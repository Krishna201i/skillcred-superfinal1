import { NextRequest, NextResponse } from 'next/server'
import { PerformanceMonitor, TIMEOUTS, fetchWithTimeout, TimeoutError } from '@/app/utils/timeout'

// Comprehensive timeout testing endpoint for debugging curl hanging issues
export async function GET(request: NextRequest) {
  const monitor = new PerformanceMonitor('Timeout Test')
  
  try {
    const url = new URL(request.url)
    const testTimeout = parseInt(url.searchParams.get('timeout') || '5000')
    const simulateHang = url.searchParams.get('hang') === 'true'
    const testType = url.searchParams.get('type') || 'basic'
    
    monitor.log(`Running timeout test: ${testType}, timeout: ${testTimeout}ms, hang: ${simulateHang}`)
    
    const results: any = {
      timestamp: new Date().toISOString(),
      testTimeout,
      simulateHang,
      testType,
      serverInfo: {
        uptime: process.uptime(),
        pid: process.pid,
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version
      }
    }

    // Basic timeout test
    if (testType === 'basic') {
      if (simulateHang) {
        monitor.log('Simulating hanging request...')
        // Simulate a hanging request that exceeds timeout
        await new Promise(resolve => setTimeout(resolve, testTimeout + 2000))
        results.result = 'Should not reach here if timeout works'
      } else {
        // Normal processing within timeout
        await new Promise(resolve => setTimeout(resolve, Math.min(testTimeout / 2, 1000)))
        results.result = 'Completed within timeout'
      }
    }

    // External API timeout test
    if (testType === 'external') {
      const externalTests = []
      
      // Test different delay scenarios
      const delays = [0, 1, 3, 5, 10] // seconds
      
      for (const delay of delays) {
        try {
          const start = Date.now()
          const response = await fetchWithTimeout(`https://httpbin.org/delay/${delay}`, {
            timeout: testTimeout,
            operation: `external-delay-${delay}s`
          })
          const end = Date.now()
          
          externalTests.push({
            delay: `${delay}s`,
            requestTime: end - start,
            status: response.status,
            success: true,
            timedOut: false
          })
          
        } catch (error) {
          externalTests.push({
            delay: `${delay}s`,
            requestTime: -1,
            status: 0,
            success: false,
            timedOut: error instanceof TimeoutError,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }
      
      results.externalTests = externalTests
    }

    // Connection timeout test
    if (testType === 'connection') {
      const connectionTests = []
      
      // Test various connection scenarios
      const testUrls = [
        'https://httpbin.org/status/200',  // Should work
        'https://httpbin.org/status/500',  // Server error
        'https://httpbin.org/status/404',  // Not found
        'https://nonexistent-domain-12345.com', // Connection failure
      ]
      
      for (const testUrl of testUrls) {
        try {
          const start = Date.now()
          const response = await fetchWithTimeout(testUrl, {
            timeout: testTimeout,
            operation: `connection-test`
          })
          const end = Date.now()
          
          connectionTests.push({
            url: testUrl,
            requestTime: end - start,
            status: response.status,
            success: response.ok,
            timedOut: false
          })
          
        } catch (error) {
          connectionTests.push({
            url: testUrl,
            requestTime: -1,
            status: 0,
            success: false,
            timedOut: error instanceof TimeoutError,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }
      
      results.connectionTests = connectionTests
    }

    // Large response timeout test
    if (testType === 'large') {
      try {
        const start = Date.now()
        // Request a large response to test timeout during data transfer
        const response = await fetchWithTimeout('https://httpbin.org/base64/SFRUUEJJTiBpcyBhd2Vzb21l' + 'A'.repeat(1000), {
          timeout: testTimeout,
          operation: 'large-response-test'
        })
        const data = await response.text()
        const end = Date.now()
        
        results.largeResponseTest = {
          requestTime: end - start,
          responseSize: data.length,
          status: response.status,
          success: true,
          timedOut: false
        }
        
      } catch (error) {
        results.largeResponseTest = {
          requestTime: -1,
          responseSize: 0,
          status: 0,
          success: false,
          timedOut: error instanceof TimeoutError,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }

    // Streaming timeout test
    if (testType === 'stream') {
      try {
        const start = Date.now()
        const response = await fetchWithTimeout('https://httpbin.org/stream/10', {
          timeout: testTimeout,
          operation: 'stream-test'
        })
        
        // Process streaming response
        const reader = response.body?.getReader()
        let chunks = 0
        let totalSize = 0
        
        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            
            chunks++
            totalSize += value?.length || 0
            
            // Add small delay to simulate processing
            await new Promise(resolve => setTimeout(resolve, 50))
          }
        }
        
        const end = Date.now()
        
        results.streamTest = {
          requestTime: end - start,
          chunks,
          totalSize,
          status: response.status,
          success: true,
          timedOut: false
        }
        
      } catch (error) {
        results.streamTest = {
          requestTime: -1,
          chunks: 0,
          totalSize: 0,
          status: 0,
          success: false,
          timedOut: error instanceof TimeoutError,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }

    const totalTime = monitor.finish(true)
    results.processingTime = totalTime
    results.timeoutConfiguration = TIMEOUTS

    return NextResponse.json(results, {
      headers: {
        'X-Timeout-Test': testType,
        'X-Processing-Time': `${totalTime}ms`,
        'X-Test-Timeout': `${testTimeout}ms`,
        'X-Simulated-Hang': simulateHang.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })

  } catch (error) {
    monitor.error(error as Error)
    
    const errorResponse = {
      error: error instanceof Error ? error.message : 'Timeout test failed',
      errorType: error instanceof TimeoutError ? 'timeout' : 'general',
      timestamp: new Date().toISOString(),
      testTimeout: 5000, // Default timeout value
      simulateHang: false // Default hang value
    }

    return NextResponse.json(errorResponse, { 
      status: error instanceof TimeoutError ? 408 : 500,
      headers: {
        'X-Timeout-Test': 'failed',
        'X-Error-Type': errorResponse.errorType
      }
    })
  }
}

// POST endpoint for timeout testing with request body
export async function POST(request: NextRequest) {
  const monitor = new PerformanceMonitor('Timeout POST Test')
  
  try {
    const startTime = Date.now()
    
    // Parse request body with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new TimeoutError('body-parsing', 10000)), 10000)
    })
    
    const body = await Promise.race([
      request.json(),
      timeoutPromise
    ])
    
    const { 
      processingDelay = 1000, 
      simulateError = false, 
      responseSize = 'small',
      testPayload 
    } = body as any
    
    monitor.log(`Processing POST with ${processingDelay}ms delay, error: ${simulateError}`)
    
    // Simulate processing delay
    if (processingDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, processingDelay))
    }
    
    // Simulate error if requested
    if (simulateError) {
      throw new Error('Simulated processing error')
    }
    
    // Generate response based on size
    let responseData: any = {
      timestamp: new Date().toISOString(),
      processingDelay,
      requestTime: Date.now() - startTime,
      testPayload: testPayload ? 'received' : 'not-provided'
    }
    
    if (responseSize === 'large') {
      responseData.largeData = 'A'.repeat(10000)
      responseData.moreData = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        data: `Item ${i} with some data`,
        timestamp: new Date().toISOString()
      }))
    }
    
    const totalTime = monitor.finish(true)
    responseData.totalProcessingTime = totalTime
    
    return NextResponse.json(responseData, {
      headers: {
        'X-Processing-Time': `${totalTime}ms`,
        'X-Processing-Delay': `${processingDelay}ms`,
        'X-Response-Size': responseSize
      }
    })

  } catch (error) {
    monitor.error(error as Error)
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'POST timeout test failed',
      errorType: error instanceof TimeoutError ? 'timeout' : 'processing',
      timestamp: new Date().toISOString()
    }, { 
      status: error instanceof TimeoutError ? 408 : 500,
      headers: {
        'X-Error-Type': error instanceof TimeoutError ? 'timeout' : 'processing'
      }
    })
  }
}
