import { NextRequest, NextResponse } from 'next/server'
import { PerformanceMonitor } from '@/app/utils/timeout'

// Basic connection and functionality test endpoint
export async function GET(request: NextRequest) {
  const monitor = new PerformanceMonitor('Debug Test Endpoint')
  
  try {
    const timestamp = new Date().toISOString()
    const userAgent = request.headers.get('user-agent') || 'unknown'
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    
    monitor.log('Processing test request')
    
    // Test basic functionality
    const testData = {
      status: 'ok',
      timestamp,
      server: 'nextjs-travel-app',
      version: '2.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch
      },
      request: {
        method: 'GET',
        userAgent,
        ip,
        url: request.url
      },
      apis: {
        perplexity: !!process.env.PERPLEXITY_API_KEY,
        pexels: !!process.env.PEXELS_API_KEY
      },
      performance: {
        responseTime: null // Will be set below
      }
    }
    
    const responseTime = monitor.finish(true)
    testData.performance.responseTime = responseTime
    
    return NextResponse.json(testData, {
      headers: {
        'X-Debug-Mode': 'true',
        'X-Response-Time': `${responseTime}ms`,
        'X-Timestamp': timestamp
      }
    })
    
  } catch (error) {
    monitor.error(error as Error)
    
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { 
      status: 500,
      headers: {
        'X-Debug-Mode': 'true',
        'X-Error': 'true'
      }
    })
  }
}

// POST test for request body parsing
export async function POST(request: NextRequest) {
  const monitor = new PerformanceMonitor('Debug POST Test')
  
  try {
    const body = await request.json()
    monitor.log(`Received POST data: ${JSON.stringify(body).length} characters`)
    
    const response = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      received: body,
      echo: {
        ...body,
        serverProcessed: true,
        processedAt: new Date().toISOString()
      }
    }
    
    const responseTime = monitor.finish(true)
    
    return NextResponse.json(response, {
      headers: {
        'X-Debug-Mode': 'true',
        'X-Response-Time': `${responseTime}ms`,
        'X-Echo-Test': 'true'
      }
    })
    
  } catch (error) {
    monitor.error(error as Error)
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to parse JSON body',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { 
      status: 400,
      headers: {
        'X-Debug-Mode': 'true',
        'X-Error': 'json-parse'
      }
    })
  }
}
