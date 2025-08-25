import { fetchWithTimeout, TIMEOUTS, PerformanceMonitor, retryWithBackoff, circuitBreakers, TimeoutError } from './timeout'

export interface PexelsImage {
  id: number
  width: number
  height: number
  url: string
  photographer: string
  photographer_url: string
  avg_color?: string
  src: {
    original: string
    large2x: string
    large: string
    medium: string
    small: string
    portrait: string
    landscape: string
    tiny: string
  }
}

export interface PexelsSearchResponse {
  photos: PexelsImage[]
  total_results: number
  page: number
  per_page: number
  next_page?: string
}

export interface ImageValidationResult {
  isValid: boolean
  width: number
  height: number
  size: number
  format: string
  error?: string
}

// Enhanced image validation
export async function validateImage(imageUrl: string): Promise<ImageValidationResult> {
  const monitor = new PerformanceMonitor(`Image validation: ${imageUrl}`)
  
  try {
    const response = await fetchWithTimeout(imageUrl, {
      method: 'HEAD',
      timeout: TIMEOUTS.PEXELS,
      operation: 'image-validation'
    })
    
    if (!response.ok) {
      monitor.error(`HTTP ${response.status}`)
      return {
        isValid: false,
        width: 0,
        height: 0,
        size: 0,
        format: 'unknown',
        error: `HTTP ${response.status}`
      }
    }
    
    const contentType = response.headers.get('content-type') || ''
    const contentLength = parseInt(response.headers.get('content-length') || '0')
    
    const isValidImage = contentType.startsWith('image/')
    const format = contentType.split('/')[1] || 'unknown'
    
    monitor.finish(isValidImage)
    
    return {
      isValid: isValidImage,
      width: 0, // Would need actual image loading to get dimensions
      height: 0,
      size: contentLength,
      format,
      error: isValidImage ? undefined : 'Invalid content type'
    }
  } catch (error) {
    monitor.error(error as Error)
    return {
      isValid: false,
      width: 0,
      height: 0,
      size: 0,
      format: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

export async function fetchPexelsImage(query: string, category?: string, size: 'small' | 'medium' | 'large' = 'medium'): Promise<PexelsImage | null> {
  const monitor = new PerformanceMonitor(`Pexels search: ${query}`)
  
  try {
    const apiKey = process.env.PEXELS_API_KEY
    if (!apiKey) {
      monitor.error('Pexels API key not configured')
      return null
    }

    // Enhanced search queries with size considerations
    let searchQuery = query
    let orientation = 'landscape'
    let perPage = 10 // Increased for better selection
    
    if (category === 'restaurant' || category === 'food') {
      searchQuery = `${query} restaurant food dining`
      perPage = 15
    } else if (category === 'attraction' || category === 'landmark') {
      searchQuery = `${query} landmark attraction tourist`
    } else if (category === 'city') {
      searchQuery = `${query} city skyline urban`
    } else if (category === 'culture') {
      searchQuery = `${query} culture traditional heritage`
    }

    monitor.log(`Searching with query: ${searchQuery}`)

    // Use circuit breaker pattern
    const response = await circuitBreakers.pexels.execute(async () => {
      return await fetchWithTimeout(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=${perPage}&orientation=${orientation}&size=${size}`,
        {
          headers: {
            'Authorization': apiKey
          },
          timeout: TIMEOUTS.PEXELS,
          operation: 'pexels-search'
        }
      )
    })

    if (!response.ok) {
      monitor.error(`Pexels API error: ${response.status}`)
      return null
    }

    const data: PexelsSearchResponse = await response.json()
    monitor.log(`Found ${data.photos.length} images`)
    
    if (data.photos && data.photos.length > 0) {
      // Smart selection with validation
      const validImages: PexelsImage[] = []
      
      for (const photo of data.photos.slice(0, 5)) {
        // Quick validation for popular images (higher resolution = likely better quality)
        if (photo.width >= 800 && photo.height >= 600) {
          validImages.push(photo)
        }
      }
      
      if (validImages.length === 0) {
        monitor.log('No valid images found, using first available')
        monitor.finish(true)
        return data.photos[0]
      }
      
      // Randomly select from valid images
      const randomIndex = Math.floor(Math.random() * validImages.length)
      const selectedImage = validImages[randomIndex]
      
      monitor.log(`Selected image: ${selectedImage.id} (${selectedImage.width}x${selectedImage.height})`)
      monitor.finish(true)
      return selectedImage
    }

    monitor.log('No photos found')
    monitor.finish(false)
    return null
  } catch (error) {
    if (error instanceof TimeoutError) {
      monitor.error(`Pexels API timeout: ${error.message}`)
    } else {
      monitor.error(error as Error)
    }
    return null
  }
}

export async function fetchMultiplePexelsImages(
  queries: string[], 
  categories?: string[], 
  size: 'small' | 'medium' | 'large' = 'medium'
): Promise<(PexelsImage | null)[]> {
  const monitor = new PerformanceMonitor(`Fetching ${queries.length} images`)
  
  try {
    // Batch requests with controlled concurrency
    const BATCH_SIZE = 3 // Prevent overwhelming the API
    const results: (PexelsImage | null)[] = []
    
    for (let i = 0; i < queries.length; i += BATCH_SIZE) {
      const batch = queries.slice(i, i + BATCH_SIZE)
      const batchCategories = categories ? categories.slice(i, i + BATCH_SIZE) : undefined
      
      monitor.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(queries.length / BATCH_SIZE)}`)
      
      const batchPromises = batch.map((query, index) => {
        const category = batchCategories ? batchCategories[index] : undefined
        return retryWithBackoff(
          () => fetchPexelsImage(query, category, size),
          2, // Max 2 retries for images
          500, // 500ms base delay
          `pexels-${query}`
        )
      })
      
      const batchResults = await Promise.allSettled(batchPromises)
      
      // Process results and handle failures
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          monitor.log(`Image fetch failed: ${result.reason}`)
          results.push(null)
        }
      }
      
      // Small delay between batches to be respectful to the API
      if (i + BATCH_SIZE < queries.length) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }
    
    const successCount = results.filter(img => img !== null).length
    monitor.log(`Successfully fetched ${successCount}/${queries.length} images`)
    monitor.finish(successCount > 0)
    
    return results
  } catch (error) {
    monitor.error(error as Error)
    return queries.map(() => null)
  }
}

// Enhanced function with comprehensive categorization and fallback strategies
export async function fetchDiverseLocationImages(
  locationNames: string[], 
  size: 'small' | 'medium' | 'large' = 'medium'
): Promise<{ [key: string]: PexelsImage }> {
  const monitor = new PerformanceMonitor(`Diverse location images: ${locationNames.length} locations`)
  const locationImages: { [key: string]: PexelsImage } = {}
  
  try {
    // Enhanced categorization with fallback strategies
    const categorizedLocations = locationNames.map(locationName => {
      const lowerName = locationName.toLowerCase()
      let category = 'attraction' // default
      let fallbackQueries: string[] = []
      
      if (lowerName.includes('restaurant') || lowerName.includes('cafe') || 
          lowerName.includes('bar') || lowerName.includes('dining')) {
        category = 'restaurant'
        fallbackQueries = [`${locationName} food`, `restaurant interior`, 'fine dining']
      } else if (lowerName.includes('museum') || lowerName.includes('gallery')) {
        category = 'culture'
        fallbackQueries = [`${locationName} art`, 'museum interior', 'art gallery']
      } else if (lowerName.includes('park') || lowerName.includes('garden')) {
        category = 'nature'
        fallbackQueries = [`${locationName} nature`, 'beautiful park', 'garden landscape']
      } else if (lowerName.includes('temple') || lowerName.includes('mosque') || 
                 lowerName.includes('church') || lowerName.includes('shrine')) {
        category = 'culture'
        fallbackQueries = [`${locationName} architecture`, 'religious architecture', 'temple interior']
      } else if (lowerName.includes('palace') || lowerName.includes('fort') || 
                 lowerName.includes('castle')) {
        category = 'attraction'
        fallbackQueries = [`${locationName} architecture`, 'historic palace', 'ancient architecture']
      } else if (lowerName.includes('market') || lowerName.includes('bazaar')) {
        category = 'culture'
        fallbackQueries = [`${locationName} market`, 'traditional market', 'local bazaar']
      } else if (lowerName.includes('beach') || lowerName.includes('lake')) {
        category = 'nature'
        fallbackQueries = [`${locationName} water`, 'beautiful beach', 'scenic lake']
      } else {
        // City or general location
        fallbackQueries = [`${locationName} landmark`, `${locationName} tourism`, 'city attraction']
      }
      
      return { locationName, category, fallbackQueries }
    })
    
    // Fetch images with fallback strategies
    const imagePromises = categorizedLocations.map(async ({ locationName, category, fallbackQueries }) => {
      monitor.log(`Processing ${locationName} (${category})`)
      
      // Try primary search first
      let image = await fetchPexelsImage(locationName, category, size)
      
      // If no image found, try fallback queries
      if (!image && fallbackQueries.length > 0) {
        monitor.log(`No image found for ${locationName}, trying fallbacks`)
        
        for (const fallbackQuery of fallbackQueries) {
          image = await fetchPexelsImage(fallbackQuery, category, size)
          if (image) {
            monitor.log(`Found fallback image for ${locationName}: ${fallbackQuery}`)
            break
          }
        }
      }
      
      return { locationName, image }
    })
    
    // Process all locations with timeout control
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new TimeoutError('diverse-images', TIMEOUTS.IMAGES)), TIMEOUTS.IMAGES)
    })
    
    const results = await Promise.race([
      Promise.allSettled(imagePromises),
      timeoutPromise
    ]) as PromiseSettledResult<{ locationName: string; image: PexelsImage | null }>[] 
    
    // Process results
    let successCount = 0
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.image) {
        locationImages[result.value.locationName] = result.value.image
        successCount++
      } else if (result.status === 'rejected') {
        monitor.log(`Failed to fetch image: ${result.reason}`)
      }
    }
    
    monitor.log(`Successfully fetched ${successCount}/${locationNames.length} location images`)
    monitor.finish(successCount > 0)
    
    return locationImages
  } catch (error) {
    if (error instanceof TimeoutError) {
      monitor.error(`Location images fetch timed out: ${error.message}`)
    } else {
      monitor.error(error as Error)
    }
    return {}
  }
}

// Curated images for major cities when API fails
export const FALLBACK_CITY_IMAGES: { [key: string]: Partial<PexelsImage> } = {
  'mumbai': {
    id: 0,
    url: 'https://images.pexels.com/photos/789750/pexels-photo-789750.jpeg',
    photographer: 'Fallback Image',
    src: {
      original: 'https://images.pexels.com/photos/789750/pexels-photo-789750.jpeg',
      large2x: 'https://images.pexels.com/photos/789750/pexels-photo-789750.jpeg?auto=compress&cs=tinysrgb&w=1200',
      large: 'https://images.pexels.com/photos/789750/pexels-photo-789750.jpeg?auto=compress&cs=tinysrgb&w=1200',
      medium: 'https://images.pexels.com/photos/789750/pexels-photo-789750.jpeg?auto=compress&cs=tinysrgb&w=800',
      small: 'https://images.pexels.com/photos/789750/pexels-photo-789750.jpeg?auto=compress&cs=tinysrgb&w=400',
      portrait: 'https://images.pexels.com/photos/789750/pexels-photo-789750.jpeg?auto=compress&cs=tinysrgb&w=400',
      landscape: 'https://images.pexels.com/photos/789750/pexels-photo-789750.jpeg?auto=compress&cs=tinysrgb&w=800',
      tiny: 'https://images.pexels.com/photos/789750/pexels-photo-789750.jpeg?auto=compress&cs=tinysrgb&w=200'
    }
  },
  'tokyo': {
    id: 0,
    url: 'https://images.pexels.com/photos/2070033/pexels-photo-2070033.jpeg',
    photographer: 'Fallback Image',
    src: {
      original: 'https://images.pexels.com/photos/2070033/pexels-photo-2070033.jpeg',
      large2x: 'https://images.pexels.com/photos/2070033/pexels-photo-2070033.jpeg?auto=compress&cs=tinysrgb&w=1200',
      large: 'https://images.pexels.com/photos/2070033/pexels-photo-2070033.jpeg?auto=compress&cs=tinysrgb&w=1200',
      medium: 'https://images.pexels.com/photos/2070033/pexels-photo-2070033.jpeg?auto=compress&cs=tinysrgb&w=800',
      small: 'https://images.pexels.com/photos/2070033/pexels-photo-2070033.jpeg?auto=compress&cs=tinysrgb&w=400',
      portrait: 'https://images.pexels.com/photos/2070033/pexels-photo-2070033.jpeg?auto=compress&cs=tinysrgb&w=400',
      landscape: 'https://images.pexels.com/photos/2070033/pexels-photo-2070033.jpeg?auto=compress&cs=tinysrgb&w=800',
      tiny: 'https://images.pexels.com/photos/2070033/pexels-photo-2070033.jpeg?auto=compress&cs=tinysrgb&w=200'
    }
  },
  'delhi': {
    id: 0,
    url: 'https://images.pexels.com/photos/1542620/pexels-photo-1542620.jpeg',
    photographer: 'Fallback Image',
    src: {
      original: 'https://images.pexels.com/photos/1542620/pexels-photo-1542620.jpeg',
      large2x: 'https://images.pexels.com/photos/1542620/pexels-photo-1542620.jpeg?auto=compress&cs=tinysrgb&w=1200',
      large: 'https://images.pexels.com/photos/1542620/pexels-photo-1542620.jpeg?auto=compress&cs=tinysrgb&w=1200',
      medium: 'https://images.pexels.com/photos/1542620/pexels-photo-1542620.jpeg?auto=compress&cs=tinysrgb&w=800',
      small: 'https://images.pexels.com/photos/1542620/pexels-photo-1542620.jpeg?auto=compress&cs=tinysrgb&w=400',
      portrait: 'https://images.pexels.com/photos/1542620/pexels-photo-1542620.jpeg?auto=compress&cs=tinysrgb&w=400',
      landscape: 'https://images.pexels.com/photos/1542620/pexels-photo-1542620.jpeg?auto=compress&cs=tinysrgb&w=800',
      tiny: 'https://images.pexels.com/photos/1542620/pexels-photo-1542620.jpeg?auto=compress&cs=tinysrgb&w=200'
    }
  }
}

// Get fallback image for a city
export function getFallbackCityImage(cityName: string): PexelsImage | null {
  const fallback = FALLBACK_CITY_IMAGES[cityName.toLowerCase()]
  if (fallback) {
    return {
      id: fallback.id || 0,
      width: 1200,
      height: 800,
      url: fallback.url || '',
      photographer: fallback.photographer || 'Stock Photo',
      photographer_url: '',
      avg_color: '#2C3E50',
      src: {
        original: fallback.src?.original || '',
        large2x: fallback.src?.large || '',
        large: fallback.src?.large || '',
        medium: fallback.src?.medium || '',
        small: fallback.src?.medium || '',
        portrait: fallback.src?.medium || '',
        landscape: fallback.src?.large || '',
        tiny: fallback.src?.medium || ''
      }
    }
  }
  return null
}
