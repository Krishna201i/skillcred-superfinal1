import { NextRequest, NextResponse } from 'next/server'
import { PerformanceMonitor, fetchWithTimeout, TIMEOUTS } from '@/app/utils/timeout'
import { validateImage } from '@/app/utils/pexels'

// Image optimization and validation endpoint
export async function POST(request: NextRequest) {
  const monitor = new PerformanceMonitor('Image Optimization')
  
  try {
    const { 
      imageUrls, 
      targetSize = 'medium', 
      validateOnly = false,
      timeout = TIMEOUTS.PEXELS 
    } = await request.json()
    
    if (!imageUrls || !Array.isArray(imageUrls)) {
      return NextResponse.json({
        error: 'imageUrls must be an array of image URLs',
        timestamp: new Date().toISOString()
      }, { status: 400 })
    }
    
    monitor.log(`Processing ${imageUrls.length} images, target size: ${targetSize}`)
    
    const results = []
    
    for (const imageUrl of imageUrls) {
      const imageMonitor = new PerformanceMonitor(`Image Processing: ${imageUrl}`)
      
      try {
        // Validate the image first
        const validation = await validateImage(imageUrl)
        
        const result: any = {
          originalUrl: imageUrl,
          validation,
          timestamp: new Date().toISOString()
        }
        
        if (validateOnly) {
          result.validationOnly = true
        } else if (validation.isValid) {
          // Generate optimized URLs based on target size
          result.optimized = generateOptimizedUrls(imageUrl, targetSize)
          
          // Test the optimized URLs
          const optimizedTests = []
          for (const [size, url] of Object.entries(result.optimized)) {
            try {
              const testResponse = await fetchWithTimeout(url as string, {
                method: 'HEAD',
                timeout: timeout / 2,
                operation: `optimize-test-${size}`
              })
              
              optimizedTests.push({
                size,
                url,
                status: testResponse.status,
                available: testResponse.ok,
                contentType: testResponse.headers.get('content-type'),
                contentLength: testResponse.headers.get('content-length')
              })
            } catch (error) {
              optimizedTests.push({
                size,
                url,
                status: 0,
                available: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              })
            }
          }
          
          result.optimizedTests = optimizedTests
        }
        
        imageMonitor.finish(validation.isValid)
        results.push(result)
        
      } catch (error) {
        imageMonitor.error(error as Error)
        results.push({
          originalUrl: imageUrl,
          error: error instanceof Error ? error.message : 'Processing failed',
          timestamp: new Date().toISOString()
        })
      }
    }
    
    // Generate summary statistics
    const summary = {
      totalImages: imageUrls.length,
      validImages: results.filter(r => r.validation?.isValid).length,
      invalidImages: results.filter(r => r.validation?.isValid === false).length,
      errors: results.filter(r => r.error).length,
      avgFileSize: 0,
      supportedFormats: [] as string[]
    }
    
    // Calculate average file size and collect formats
    const validResults = results.filter(r => r.validation?.isValid)
    if (validResults.length > 0) {
      const totalSize = validResults.reduce((sum, r) => sum + (r.validation?.size || 0), 0)
      summary.avgFileSize = Math.round(totalSize / validResults.length)
      summary.supportedFormats = Array.from(new Set(validResults.map(r => r.validation?.format).filter(Boolean)))
    }
    
    const processingTime = monitor.finish(true)
    
    return NextResponse.json({
      success: true,
      summary,
      results,
      processingTime,
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'X-Processing-Time': `${processingTime}ms`,
        'X-Images-Processed': imageUrls.length.toString(),
        'X-Valid-Images': summary.validImages.toString(),
        'X-Target-Size': targetSize
      }
    })
    
  } catch (error) {
    monitor.error(error as Error)
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Image optimization failed',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// GET endpoint for image proxy/resize (simple implementation)
export async function GET(request: NextRequest) {
  const monitor = new PerformanceMonitor('Image Proxy')
  
  try {
    const url = new URL(request.url)
    const imageUrl = url.searchParams.get('url')
    const size = url.searchParams.get('size') || 'medium'
    const format = url.searchParams.get('format') || 'webp'
    
    if (!imageUrl) {
      return NextResponse.json({
        error: 'url parameter is required',
        timestamp: new Date().toISOString()
      }, { status: 400 })
    }
    
    monitor.log(`Proxying image: ${imageUrl}, size: ${size}`)
    
    // Validate the URL
    try {
      new URL(imageUrl)
    } catch {
      return NextResponse.json({
        error: 'Invalid image URL',
        timestamp: new Date().toISOString()
      }, { status: 400 })
    }
    
    // For Pexels URLs, we can modify the query parameters for optimization
    const optimizedUrl = optimizePexelsUrl(imageUrl, size)
    
    // Fetch the image
    const response = await fetchWithTimeout(optimizedUrl, {
      timeout: TIMEOUTS.PEXELS,
      operation: 'image-proxy'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`)
    }
    
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    
    if (!contentType.startsWith('image/')) {
      throw new Error('URL does not point to an image')
    }
    
    // Get the image data
    const imageBuffer = await response.arrayBuffer()
    
    const processingTime = monitor.finish(true)
    
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        'X-Processing-Time': `${processingTime}ms`,
        'X-Original-Url': imageUrl,
        'X-Optimized-Url': optimizedUrl,
        'X-Size': size
      }
    })
    
  } catch (error) {
    monitor.error(error as Error)
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Image proxy failed',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// Helper function to generate optimized URLs for different platforms
function generateOptimizedUrls(originalUrl: string, targetSize: string) {
  const optimized: { [key: string]: string } = {}
  
  // For Pexels URLs
  if (originalUrl.includes('pexels.com')) {
    const sizeParams = {
      small: 'w=400&h=300',
      medium: 'w=800&h=600', 
      large: 'w=1200&h=900'
    }
    
    const baseUrl = originalUrl.split('?')[0]
    optimized.webp = `${baseUrl}?auto=compress&cs=tinysrgb&${sizeParams[targetSize as keyof typeof sizeParams] || sizeParams.medium}&fm=webp`
    optimized.jpeg = `${baseUrl}?auto=compress&cs=tinysrgb&${sizeParams[targetSize as keyof typeof sizeParams] || sizeParams.medium}&fm=jpg`
    optimized.avif = `${baseUrl}?auto=compress&cs=tinysrgb&${sizeParams[targetSize as keyof typeof sizeParams] || sizeParams.medium}&fm=avif`
  } else {
    // For other URLs, return as-is (in a real app, you might use a service like Cloudinary)
    optimized.original = originalUrl
  }
  
  return optimized
}

// Helper function to optimize Pexels URLs specifically
function optimizePexelsUrl(url: string, size: string) {
  if (!url.includes('pexels.com')) {
    return url
  }
  
  const sizeParams = {
    small: 'w=400&h=300',
    medium: 'w=800&h=600',
    large: 'w=1200&h=900',
    thumbnail: 'w=200&h=150'
  }
  
  const baseUrl = url.split('?')[0]
  const targetParam = sizeParams[size as keyof typeof sizeParams] || sizeParams.medium
  
  return `${baseUrl}?auto=compress&cs=tinysrgb&${targetParam}&fm=webp&q=80`
}
