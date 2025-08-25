import { NextRequest, NextResponse } from 'next/server'
import { PerformanceMonitor, TIMEOUTS, circuitBreakers } from '@/app/utils/timeout'

// Comprehensive health check endpoint
export async function GET(request: NextRequest) {
  const monitor = new PerformanceMonitor('Health Check')
  
  try {
    const startTime = Date.now()
    
    // Basic server health
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      server: {
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version,
        arch: process.arch,
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      },
      services: {} as any,
      configuration: {
        timeouts: TIMEOUTS,
        environment: process.env.NODE_ENV || 'development'
      },
      metrics: {
        responseTime: 0,
        requestCount: 0 // In a real app, this would be tracked
      },
      circuitBreakers: {} as any
    }
    
    // Check external service availability
    const serviceChecks = []
    
    // Check Perplexity API availability
    serviceChecks.push(
      checkService('perplexity', async () => {
        const hasKey = !!process.env.PERPLEXITY_API_KEY
        if (!hasKey) throw new Error('API key not configured')
        return { configured: true, keyPresent: hasKey }
      })
    )
    
    // Check Pexels API availability
    serviceChecks.push(
      checkService('pexels', async () => {
        const hasKey = !!process.env.PEXELS_API_KEY
        if (!hasKey) throw new Error('API key not configured')
        return { configured: true, keyPresent: hasKey }
      })
    )
    
    // Check external connectivity
    serviceChecks.push(
      checkService('external_connectivity', async () => {
        const response = await fetch('https://httpbin.org/status/200', {
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        })
        return { 
          reachable: response.ok, 
          status: response.status,
          latency: Date.now() - startTime 
        }
      })
    )
    
    // Run all service checks
    const serviceResults = await Promise.allSettled(serviceChecks)
    
    // Process service check results
    serviceResults.forEach((result, index) => {
      const serviceName = ['perplexity', 'pexels', 'external_connectivity'][index]
      
      if (result.status === 'fulfilled') {
        health.services[serviceName] = {
          status: 'healthy',
          ...result.value
        }
      } else {
        health.services[serviceName] = {
          status: 'unhealthy',
          error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
        }
        // If critical services are down, mark overall health as degraded
        if (serviceName === 'external_connectivity') {
          health.status = 'degraded'
        }
      }
    })
    
    // Check circuit breaker states
    health.circuitBreakers = {
      perplexity: circuitBreakers.perplexity.getState(),
      pexels: circuitBreakers.pexels.getState()
    }
    
    // Add response time
    const responseTime = monitor.finish(true)
    health.metrics.responseTime = responseTime
    
    // Determine overall status
    const unhealthyServices = Object.values(health.services).filter((s: any) => s.status === 'unhealthy')
    if (unhealthyServices.length > 0) {
      health.status = unhealthyServices.length === Object.keys(health.services).length ? 'unhealthy' : 'degraded'
    }
    
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 206 : 503
    
    return NextResponse.json(health, {
      status: statusCode,
      headers: {
        'X-Health-Status': health.status,
        'X-Response-Time': `${responseTime}ms`,
        'X-Uptime': `${health.uptime}s`,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })
    
  } catch (error) {
    monitor.error(error as Error)
    
    return NextResponse.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Health check failed',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }, { 
      status: 503,
      headers: {
        'X-Health-Status': 'unhealthy',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })
  }
}

// Helper function to check individual services
async function checkService(name: string, checkFn: () => Promise<any>) {
  const monitor = new PerformanceMonitor(`Service Check: ${name}`)
  
  try {
    const result = await checkFn()
    monitor.finish(true)
    return result
  } catch (error) {
    monitor.error(error as Error)
    throw error
  }
}

// Simple liveness probe endpoint
export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'X-Alive': 'true',
      'X-Timestamp': new Date().toISOString()
    }
  })
}
