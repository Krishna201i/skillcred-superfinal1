export interface PexelsImage {
  id: number
  width: number
  height: number
  url: string
  photographer: string
  photographer_url: string
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

export async function fetchPexelsImage(query: string, category?: string): Promise<PexelsImage | null> {
  try {
    const apiKey = process.env.PEXELS_API_KEY
    if (!apiKey) {
      console.warn('Pexels API key not configured')
      return null
    }

    // Create more specific search queries based on category
    let searchQuery = query
    if (category === 'restaurant' || category === 'food') {
      searchQuery = `${query} restaurant food`
    } else if (category === 'attraction' || category === 'landmark') {
      searchQuery = `${query} landmark attraction`
    } else if (category === 'city') {
      searchQuery = `${query} city skyline`
    }

    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=5&orientation=landscape`,
      {
        headers: {
          'Authorization': apiKey
        }
      }
    )

    if (!response.ok) {
      console.error('Pexels API error:', response.status)
      return null
    }

    const data = await response.json()
    
    if (data.photos && data.photos.length > 0) {
      // Randomly select from top 5 results to add variety
      const randomIndex = Math.floor(Math.random() * Math.min(data.photos.length, 5))
      return data.photos[randomIndex]
    }

    return null
  } catch (error) {
    console.error('Error fetching Pexels image:', error)
    return null
  }
}

export async function fetchMultiplePexelsImages(queries: string[], categories?: string[]): Promise<(PexelsImage | null)[]> {
  const imagePromises = queries.map((query, index) => {
    const category = categories ? categories[index] : undefined
    return fetchPexelsImage(query, category)
  })
  return Promise.all(imagePromises)
}

// Enhanced function to get diverse images for different types of locations
export async function fetchDiverseLocationImages(locationNames: string[]): Promise<{ [key: string]: PexelsImage }> {
  const locationImages: { [key: string]: PexelsImage } = {}
  
  // Process each location with appropriate category
  for (const locationName of locationNames) {
    let category = 'attraction' // default category
    
    // Determine category based on location type
    if (locationName.toLowerCase().includes('restaurant') || 
        locationName.toLowerCase().includes('cafe') ||
        locationName.toLowerCase().includes('bar')) {
      category = 'restaurant'
    } else if (locationName.toLowerCase().includes('museum') ||
               locationName.toLowerCase().includes('park') ||
               locationName.toLowerCase().includes('temple') ||
               locationName.toLowerCase().includes('palace')) {
      category = 'attraction'
    }
    
    const image = await fetchPexelsImage(locationName, category)
    if (image) {
      locationImages[locationName] = image
    }
  }
  
  return locationImages
}
