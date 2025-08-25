import { NextRequest, NextResponse } from 'next/server'
import { PerformanceMonitor, TIMEOUTS, fetchWithTimeout } from '@/app/utils/timeout'

// Performance testing endpoint to debug potential bottlenecks
export async function GET(request: NextRequest) {
  const monitor = new PerformanceMonitor('Performance Test')
  
  try {
    const url = new URL(request.url)
    const testType = url.searchParams.get('type') || 'basic'
    const delay = parseInt(url.searchParams.get('delay') || '0')
    
    monitor.log(`Running ${testType} performance test with ${delay}ms delay`)
    
    const results: any = {
      timestamp: new Date().toISOString(),
      testType,
      delay,
      results: {}
    }

    // Basic CPU and memory test
    if (testType === 'basic' || testType === 'all') {
      const startCpu = process.cpuUsage()
      const startMemory = process.memoryUsage()
      
      // Simulate some CPU work
      let sum = 0
      for (let i = 0; i < 1000000; i++) {
        sum += Math.random()
      }
      
      const endCpu = process.cpuUsage(startCpu)
      const endMemory = process.memoryUsage()
      
      results.results.cpu = {
        user: endCpu.user,
        system: endCpu.system,
        userMs: endCpu.user / 1000,
        systemMs: endCpu.system / 1000
      }
      
      results.results.memory = {
        start: startMemory,
        end: endMemory,
        delta: {
          rss: endMemory.rss - startMemory.rss,
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          heapTotal: endMemory.heapTotal - startMemory.heapTotal,
          external: endMemory.external - startMemory.external
        }
      }
    }

    // Network latency test
    if (testType === 'network' || testType === 'all') {
      const networkTests = []
      
      // Test external API latency
      try {
        const externalStart = Date.now()
        const response = await fetchWithTimeout('https://httpbin.org/delay/0', {
          timeout: 5000,
          operation: 'network-test'
        })
        const externalEnd = Date.now()
        
        networkTests.push({
          target: 'httpbin.org',
          latency: externalEnd - externalStart,
          status: response.status,
          success: response.ok
        })
      } catch (error) {
        networkTests.push({
          target: 'httpbin.org',
          latency: -1,
          status: 0,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
      
      results.results.network = networkTests
    }

    // Timeout stress test
    if (testType === 'timeout' || testType === 'all') {
      const timeoutTests = []
      
      // Test various timeout scenarios
      for (const timeout of [1000, 5000, 10000]) {
        try {
          const start = Date.now()
          await fetchWithTimeout(`https://httpbin.org/delay/${Math.floor(timeout / 2000)}`, {
            timeout,
            operation: `timeout-test-${timeout}`
          })
          const end = Date.now()
          
          timeoutTests.push({
            timeout,
            actualTime: end - start,
            success: true
          })
        } catch (error) {
          timeoutTests.push({
            timeout,
            actualTime: -1,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }
      
      results.results.timeouts = timeoutTests
    }

    // Concurrent request test
    if (testType === 'concurrent' || testType === 'all') {
      const concurrentStart = Date.now()
      const concurrentPromises = []
      
      for (let i = 0; i < 5; i++) {
        concurrentPromises.push(
          fetchWithTimeout('https://httpbin.org/json', {
            timeout: 10000,
            operation: `concurrent-test-${i}`
          }).then(r => r.json()).catch(e => ({ error: e.message }))
        )
      }
      
      const concurrentResults = await Promise.allSettled(concurrentPromises)
      const concurrentEnd = Date.now()
      
      results.results.concurrent = {
        totalTime: concurrentEnd - concurrentStart,
        requests: concurrentResults.length,
        successful: concurrentResults.filter(r => r.status === 'fulfilled').length,
        failed: concurrentResults.filter(r => r.status === 'rejected').length,
        results: concurrentResults
      }
    }

    // Add artificial delay if requested
    if (delay > 0) {
      monitor.log(`Adding artificial delay of ${delay}ms`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    const totalTime = monitor.finish(true)
    results.processingTime = totalTime
    results.server = {
      uptime: process.uptime(),
      platform: process.platform,
      nodeVersion: process.version,
      pid: process.pid
    }

    return NextResponse.json(results, {
      headers: {
        'X-Performance-Test': testType,
        'X-Processing-Time': `${totalTime}ms`,
        'X-Test-Timestamp': results.timestamp
      }
    })

  } catch (error) {
    monitor.error(error as Error)
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Performance test failed',
      timestamp: new Date().toISOString(),
      testFailed: true
    }, { status: 500 })
  }
}

// POST endpoint for load testing
export async function POST(request: NextRequest) {
  const monitor = new PerformanceMonitor('Load Test POST')
  
  try {
    const body = await request.json()
    const { iterations = 10, delay = 100, payload } = body
    
    monitor.log(`Running load test: ${iterations} iterations with ${delay}ms delay`)
    
    const results = []
    
    for (let i = 0; i < iterations; i++) {
      const iterationStart = Date.now()
      
      // Simulate processing
      await new Promise(resolve => setTimeout(resolve, delay))
      
      // Process payload if provided
      let processedData = null
      if (payload) {
        processedData = JSON.parse(JSON.stringify(payload)) // Deep clone
        processedData.iteration = i
        processedData.timestamp = new Date().toISOString()
      }
      
      const iterationEnd = Date.now()
      
      results.push({
        iteration: i,
        time: iterationEnd - iterationStart,
        memoryUsage: process.memoryUsage(),
        processedData
      })
      
      monitor.log(`Iteration ${i + 1}/${iterations} completed`)
    }
    
    const totalTime = monitor.finish(true)
    
    return NextResponse.json({
      loadTest: true,
      iterations,
      delay,
      totalTime,
      averageIterationTime: results.reduce((sum, r) => sum + r.time, 0) / results.length,
      results,
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'X-Load-Test': 'true',
        'X-Iterations': iterations.toString(),
        'X-Total-Time': `${totalTime}ms`
      }
    })

  } catch (error) {
    monitor.error(error as Error)
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Load test failed',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
