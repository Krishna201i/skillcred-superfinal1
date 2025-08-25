// Comprehensive timeout handling utilities
export const TIMEOUTS = {
  GLOBAL: 30000,     // 30s global timeout
  AI: 15000,         // 15s AI API timeout
  IMAGES: 20000,     // 20s images timeout
  PEXELS: 8000,      // 8s Pexels API timeout
  FALLBACK: 5000     // 5s fallback timeout
} as const

export class TimeoutError extends Error {
  constructor(operation: string, timeout: number) {
    super(`Operation '${operation}' timed out after ${timeout}ms`)
    this.name = 'TimeoutError'
  }
}

// Create a timeout-aware fetch function
export async function fetchWithTimeout(
  url: string | URL | Request,
  options: RequestInit & { timeout?: number; operation?: string } = {}
): Promise<Response> {
  const { timeout = TIMEOUTS.GLOBAL, operation = 'fetch', ...fetchOptions } = options
  
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeout)

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(operation, timeout)
    }
    
    throw error
  }
}

// Performance monitoring and logging utilities
export class PerformanceMonitor {
  private startTime: number
  private operation: string
  
  constructor(operation: string) {
    this.operation = operation
    this.startTime = Date.now()
    console.log(`[${new Date().toISOString()}] 🚀 Starting ${operation}`)
  }
  
  log(message: string) {
    const elapsed = Date.now() - this.startTime
    console.log(`[${new Date().toISOString()}] ⏱️  ${this.operation} (${elapsed}ms): ${message}`)
  }
  
  finish(success: boolean = true) {
    const elapsed = Date.now() - this.startTime
    const status = success ? '✅' : '❌'
    console.log(`[${new Date().toISOString()}] ${status} ${this.operation} completed in ${elapsed}ms`)
    return elapsed
  }
  
  error(error: Error | string) {
    const elapsed = Date.now() - this.startTime
    console.error(`[${new Date().toISOString()}] ❌ ${this.operation} failed after ${elapsed}ms:`, error)
    return elapsed
  }
}

// Retry mechanism with exponential backoff
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000,
  operationName: string = 'operation'
): Promise<T> {
  let lastError: Error
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const monitor = new PerformanceMonitor(`${operationName} (attempt ${attempt}/${maxAttempts})`)
      const result = await operation()
      monitor.finish(true)
      return result
    } catch (error) {
      lastError = error as Error
      
      if (attempt === maxAttempts) {
        console.error(`[${new Date().toISOString()}] 💥 ${operationName} failed after ${maxAttempts} attempts:`, lastError)
        break
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1) // Exponential backoff
      console.warn(`[${new Date().toISOString()}] ⚠️  ${operationName} attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message)
      
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError!
}

// Circuit breaker pattern for external APIs
export class CircuitBreaker {
  private failures: number = 0
  private lastFailureTime: number = 0
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
  
  constructor(
    private failureThreshold: number = 5,
    private resetTimeout: number = 60000, // 1 minute
    private name: string = 'unknown'
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN'
        console.log(`[${new Date().toISOString()}] 🔄 Circuit breaker ${this.name} transitioning to HALF_OPEN`)
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN - too many failures`)
      }
    }
    
    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }
  
  private onSuccess() {
    this.failures = 0
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED'
      console.log(`[${new Date().toISOString()}] ✅ Circuit breaker ${this.name} reset to CLOSED`)
    }
  }
  
  private onFailure() {
    this.failures++
    this.lastFailureTime = Date.now()
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN'
      console.log(`[${new Date().toISOString()}] 🔴 Circuit breaker ${this.name} OPENED after ${this.failures} failures`)
    }
  }
  
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    }
  }
}

// Global circuit breakers for external services
export const circuitBreakers = {
  perplexity: new CircuitBreaker(3, 60000, 'Perplexity-AI'),
  pexels: new CircuitBreaker(5, 30000, 'Pexels-API')
}
