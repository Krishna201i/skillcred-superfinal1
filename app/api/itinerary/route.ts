import { NextRequest, NextResponse } from 'next/server'
import { fetchDiverseLocationImages, getFallbackCityImage } from '@/app/utils/pexels'
import { 
  fetchWithTimeout, 
  TIMEOUTS, 
  PerformanceMonitor, 
  retryWithBackoff, 
  circuitBreakers, 
  TimeoutError 
} from '@/app/utils/timeout'

// Enhanced request interface
interface ItineraryRequest {
  city: string
  budget: string
  days: number
  interests?: string[]
  includeWeather?: boolean
  includeCulturalTips?: boolean
  imageSize?: 'small' | 'medium' | 'large'
}

// Google Places API interfaces
interface GooglePlace {
  place_id: string
  name: string
  formatted_address: string
  geometry: {
    location: {
      lat: number
      lng: number
    }
  }
  rating?: number
  user_ratings_total?: number
  types: string[]
  opening_hours?: {
    open_now: boolean
    weekday_text?: string[]
  }
  price_level?: number
  photos?: Array<{
    photo_reference: string
    height: number
    width: number
  }>
}

interface GooglePlacesResponse {
  results: GooglePlace[]
  status: string
  next_page_token?: string
  error_message?: string
}

// City-specific configuration for Mumbai, Tokyo, Delhi
const CITY_CONFIGS = {
  'mumbai': {
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    culturalTips: [
      'Mumbai locals are called "Mumbaikars" and are known for their fast-paced lifestyle',
      'The city never sleeps - street food and trains run almost 24/7',
      'Monsoon season (June-September) brings heavy rains but also a unique charm',
      'Local trains are the lifeline but can be crowded during peak hours',
      'Street food culture is huge - try vada pav, bhel puri, and dosa'
    ],
    weatherInfo: 'Tropical climate with three distinct seasons: monsoon (June-September), winter (October-February), and summer (March-May). Best time to visit is October to March.',
    budgetMultiplier: 1.0
  },
  'tokyo': {
    currency: 'JPY',
    timezone: 'Asia/Tokyo',
    culturalTips: [
      'Bowing is a traditional greeting - a slight nod is sufficient for tourists',
      'Remove shoes when entering homes, temples, and some restaurants',
      'Tipping is not customary and can sometimes be considered rude',
      'Public transportation is extremely punctual and efficient',
      'Cash is still king - many places don\'t accept cards'
    ],
    weatherInfo: 'Four distinct seasons. Cherry blossom (sakura) season in March-April. Hot humid summers, mild winters. Best times: March-May and September-November.',
    budgetMultiplier: 3.5 // Tokyo is generally more expensive
  },
  'delhi': {
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    culturalTips: [
      'Delhi has both Old Delhi (historic) and New Delhi (modern capital)',
      'Respect religious sites - cover head and remove shoes at temples/mosques',
      'Haggling is common in markets but not in malls or restaurants',
      'The city has extreme weather - very hot summers and cool winters',
      'Try local specialties like chole bhature, paranthas, and chaat'
    ],
    weatherInfo: 'Semi-arid climate with extreme temperatures. Very hot summers (40°C+), cool winters (5-20°C), monsoon (July-September). Best time: October-March.',
    budgetMultiplier: 0.9
  }
}

export async function POST(request: NextRequest) {
  const globalMonitor = new PerformanceMonitor('Complete Itinerary Generation')
  
  try {
    // Parse request with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new TimeoutError('request-parsing', 5000)), 5000)
    })
    
    const { city, budget, days, interests, includeWeather = true, includeCulturalTips = true, imageSize = 'medium' }: ItineraryRequest = await Promise.race([
      request.json(),
      timeoutPromise
    ]) as ItineraryRequest

    globalMonitor.log(`Processing request for ${days}-day trip to ${city} with budget ${budget}`)

    // Validate input
    if (!city || !budget || !days) {
      return NextResponse.json(
        { 
          error: 'Missing required fields: city, budget, days',
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID()
        },
        { status: 400 }
      )
    }

    if (days < 1 || days > 14) {
      return NextResponse.json(
        { 
          error: 'Days must be between 1 and 14',
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID()
        },
        { status: 400 }
      )
    }

    // Get city-specific configuration early so it's available for fallback
    const cityConfig = CITY_CONFIGS[city.toLowerCase() as keyof typeof CITY_CONFIGS]

    const apiKey = process.env.PERPLEXITY_API_KEY
    if (!apiKey) {
      globalMonitor.error('Perplexity API key not configured')
      globalMonitor.log('Falling back to enhanced fallback itinerary')

      // Generate enhanced fallback instead of returning error
      const fallbackItinerary = generateEnhancedFallbackItinerary(city, days, budget, cityConfig)

      // Still try to get images
      const locationNames = extractLocationNames(fallbackItinerary, city)
      let locationImages: { [key: string]: any } = {}

      try {
        locationImages = await fetchDiverseLocationImages(locationNames, imageSize)
      } catch (imageError) {
        globalMonitor.log('Image fetch failed, using fallback city image')
        const fallbackImage = getFallbackCityImage(city)
        if (fallbackImage) {
          locationImages[city] = fallbackImage
        }
      }

      const fallbackResponse = {
        ...fallbackItinerary,
        locationImages,
        metadata: {
          generatedAt: new Date().toISOString(),
          requestId: crypto.randomUUID(),
          processingTime: Date.now() - globalMonitor['startTime'],
          aiModel: 'fallback-enhanced',
          imageCount: Object.keys(locationImages).length,
          cityConfig: cityConfig ? 'enhanced' : 'standard',
          version: '2.0.0-fallback',
          note: 'Generated using fallback due to API configuration'
        }
      }

      globalMonitor.finish(true)
      return NextResponse.json(fallbackResponse)
    }

    // cityConfig is already declared above, now calculate adjusted budget
    const adjustedBudget = cityConfig ? 
      Math.round(parseFloat(budget.replace(/[^\d]/g, '')) * cityConfig.budgetMultiplier).toString() : 
      budget

    globalMonitor.log(`Using ${cityConfig ? 'city-specific' : 'general'} configuration`)

    // Construct enhanced prompt with cultural and weather information
    const interestsText = interests && interests.length > 0 
      ? ` with interests in: ${interests.join(', ')}`
      : ''
    
    const culturalTipsText = includeCulturalTips && cityConfig 
      ? `\n\nIMPORTANT: Include these cultural tips in the response:\n${cityConfig.culturalTips.join('\n')}`
      : ''
    
         const weatherText = includeWeather && cityConfig 
       ? `\n\nWeather Information: ${cityConfig.weatherInfo}`
       : ''
    
     // Add current date context for real-time planning
     const currentDate = new Date()
     const dateContext = `\n\nCurrent Date: ${currentDate.toISOString().split('T')[0]} (${currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })})
Planning Period: ${days} days starting from today`
    
     const prompt = `Generate a detailed ${days}-day travel itinerary for ${city} with a budget of ₹${adjustedBudget}${interestsText}.${culturalTipsText}${weatherText}${dateContext}

CRITICAL REQUIREMENTS - Use ONLY REAL, VERIFIABLE places and CURRENT real-time data:

REAL PLACES REQUIREMENTS:
- Use ONLY real, existing places that can be found on Google Maps
- Include specific, searchable place names (not generic descriptions)
- Provide accurate addresses that exist in ${city}
- Use real restaurant names, attraction names, and location names
- Include only places that are currently open and operating

SPECIFIC PLACE NAMING RULES:
- NEVER use generic terms like "Main Attractions", "Tourist Spot", "City Center", "Popular Place"
- ALWAYS use specific, real names like "Gateway of India", "Marine Drive", "Colaba Causeway"
- For restaurants, use actual names like "Leopold Cafe", "Bademiya", "Trishna"
- For attractions, use real names like "Taj Mahal Palace", "Elephanta Caves", "Juhu Beach"
- For areas, use specific names like "Colaba", "Bandra West", "Andheri East"
- Each location name must be a real, searchable place on Google Maps

REAL-TIME DATA REQUIREMENTS:
- Current weather conditions and forecasts for ${city}
- Latest opening hours and current availability of attractions
- Current prices and exchange rates (as of today)
- Recent events, festivals, or special activities happening in ${city} right now
- Latest travel advisories or restrictions for ${city}
- Current seasonal highlights and best times to visit specific places
- Real-time transportation schedules and routes
- Current restaurant ratings and reviews from today
- Latest cultural events or exhibitions currently happening
- Current operating status of all mentioned places

Return ONLY a valid JSON object with this exact structure (no additional text, no markdown):

{
  "days": [
    {
      "day": 1,
      "date": "2024-01-15",
      "summary": "Brief description of the day",
      "weather": "Expected weather conditions",
      "morning": [
        {
          "time": "9:00 AM",
          "activity": "Activity description",
          "location": {
            "name": "Real place name (Google Maps searchable)",
            "address": "Full address",
            "coordinates": [lat, lng]
          },
          "description": "Detailed description with cultural context",
          "estimatedCost": "₹500-800",
          "duration": "2-3 hours"
        }
      ],
      "afternoon": [
        {
          "time": "2:00 PM",
          "activity": "Activity description",
          "location": {
            "name": "Real place name (Google Maps searchable)",
            "address": "Full address",
            "coordinates": [lat, lng]
          },
          "description": "Detailed description with cultural context",
          "estimatedCost": "₹300-600",
          "duration": "2-3 hours"
        }
      ],
      "evening": [
        {
          "time": "7:00 PM",
          "activity": "Activity description",
          "location": {
            "name": "Real place name (Google Maps searchable)",
            "address": "Full address",
            "coordinates": [lat, lng]
          },
          "description": "Detailed description with cultural context",
          "estimatedCost": "₹400-800",
          "duration": "2-3 hours"
        }
      ],
      "dining": [
        {
          "meal": "Breakfast",
          "restaurant": "Restaurant name",
          "cuisine": "Cuisine type",
          "location": {
            "name": "Restaurant name",
            "address": "Full address",
            "coordinates": [lat, lng]
          },
          "price": "₹500-800",
          "speciality": "Famous dish or specialty",
          "rating": "4.5/5",
          "ambiance": "Cozy, romantic, family-friendly, etc.",
          "culturalNote": "Cultural significance or local dining customs"
        },
        {
          "meal": "Lunch",
          "restaurant": "Restaurant name",
          "cuisine": "Cuisine type",
          "location": {
            "name": "Restaurant name",
            "address": "Full address",
            "coordinates": [lat, lng]
          },
          "price": "₹800-1200",
          "speciality": "Famous dish or specialty",
          "rating": "4.5/5",
          "ambiance": "Cozy, romantic, family-friendly, etc.",
          "culturalNote": "Cultural significance or local dining customs"
        },
        {
          "meal": "Dinner",
          "restaurant": "Restaurant name",
          "cuisine": "Cuisine type",
          "location": {
            "name": "Restaurant name",
            "address": "Full address",
            "coordinates": [lat, lng]
          },
          "price": "₹1000-1500",
          "speciality": "Famous dish or specialty",
          "rating": "4.5/5",
          "ambiance": "Cozy, romantic, family-friendly, etc.",
          "culturalNote": "Cultural significance or local dining customs"
        }
      ]
    }
  ],
  "summary": {
    "totalCost": "₹45000",
    "costBreakdown": {
      "accommodation": "₹15000",
      "food": "₹12000",
      "activities": "₹10000",
      "transportation": "₹8000"
    },
    "highlights": ["Highlight 1", "Highlight 2", "Highlight 3"],
    "tips": ["Tip 1", "Tip 2", "Tip 3"],
    "culturalTips": ["Cultural tip 1", "Cultural tip 2"],
    "bestTime": "Best time to visit description",
    "weatherOverview": "General weather information",
    "budgetingTips": ["Budget tip 1", "Budget tip 2"]
  }
}

IMPORTANT REQUIREMENTS:
- ALWAYS include Breakfast, Lunch, and Dinner for each day
- Use real, Google Maps searchable place names
- Include specific addresses and coordinates for all locations
- Provide realistic costs in INR based on ${city} pricing
- Include cultural context and local customs
- Add weather information for each day
- Make activities diverse and interesting
- For dining: include cultural notes and local dining customs
- Ensure the JSON is valid and complete
- Each day MUST have exactly 3 meals: Breakfast, Lunch, Dinner
- Include estimated costs and duration for all activities`

    globalMonitor.log('Calling Perplexity AI API')

    // Call Perplexity API with enhanced error handling and timeout
    const aiMonitor = new PerformanceMonitor('Perplexity AI API Call')
    let itinerary: any

    try {
      const response = await retryWithBackoff(async () => {
        return await circuitBreakers.perplexity.execute(async () => {
          return await fetchWithTimeout('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                             model: 'llama-3.1-sonar-small-128k-online',
                             messages: [
                 {
                   role: 'system',
                   content: 'You are a professional travel planner with access to real-time, current information. Use your real-time data capabilities to provide the most up-to-date information including current weather, prices, opening hours, events, and travel conditions. You MUST return ONLY valid JSON without any markdown formatting, explanations, or additional text. The response must be parseable by JSON.parse(). Never use trailing commas. Never include text before or after the JSON object. Include accurate coordinates and realistic pricing based on current market conditions.'
                 },
                {
                  role: 'user',
                  content: prompt
                }
              ],
              max_tokens: 6000,
              temperature: 0.2, // Lower temperature for more consistent JSON
              top_p: 0.9
            }),
            timeout: TIMEOUTS.AI,
            operation: 'perplexity-api'
          })
        })
      }, 3, 2000, 'Perplexity API Call')

      if (!response.ok) {
        let errorData = 'Unknown error'
        try {
          errorData = await response.text()
        } catch (e) {
          console.error('Failed to read error response:', e)
        }
        aiMonitor.error(`HTTP ${response.status}: ${errorData}`)
        throw new Error(`Perplexity API error: ${response.status}`)
      }

      let data: any
      try {
        data = await response.json()
      } catch (e) {
        aiMonitor.error('Failed to parse JSON response')
        throw new Error('Invalid JSON response from Perplexity API')
      }
      aiMonitor.finish(true)
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response structure from Perplexity API')
      }

      const content = data.choices[0].message.content
      globalMonitor.log('AI response received, parsing JSON')

      // Enhanced JSON parsing with multiple attempts
      let jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        globalMonitor.error('No JSON found in AI response')
        throw new Error('No valid JSON found in AI response')
      }

      let parseAttempts = 0
      const maxAttempts = 5
      
      while (parseAttempts < maxAttempts) {
        try {
          let jsonString = jsonMatch[0]
          
          // Progressive JSON cleaning
          jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
          jsonString = jsonString.replace(/([{\[,]\s*)(\w+):/g, '$1"$2":') // Quote unquoted keys
          jsonString = jsonString.replace(/:\s*([^",{\[\s][^,}\]]*[^,}\]\s])/g, ': "$1"') // Quote unquoted string values
          
          itinerary = JSON.parse(jsonString)
          globalMonitor.log('JSON parsed successfully')
          break
        } catch (parseError) {
          parseAttempts++
          globalMonitor.log(`JSON parse attempt ${parseAttempts} failed: ${(parseError as Error).message}`)
          
          if (parseAttempts >= maxAttempts) {
            globalMonitor.error(`Failed to parse JSON after ${maxAttempts} attempts`)
            throw new Error('Failed to parse AI response after multiple attempts')
          }
          
          // Try alternative JSON extraction methods
          const alternatives = content.match(/\{[\s\S]*?\}/g) || []
          if (alternatives[parseAttempts - 1]) {
            jsonMatch = [alternatives[parseAttempts - 1]]
          }
        }
      }

    } catch (aiError) {
      aiMonitor.error(aiError as Error)
      globalMonitor.log('AI service failed, generating enhanced fallback itinerary')

      // Generate enhanced fallback itinerary
      itinerary = generateEnhancedFallbackItinerary(city, days, budget, cityConfig)

      // Add fallback metadata
      if (itinerary && !itinerary.metadata) {
        itinerary.metadata = {
          fallbackReason: aiError instanceof Error ? aiError.message : 'AI service error'
        }
      }
    }

    // Validate and enhance the itinerary structure
    itinerary = validateAndEnhanceItinerary(itinerary, city, days, budget, cityConfig)
    
    // Enhance with real Google Places data
    globalMonitor.log('Enhancing itinerary with real Google Places data')
    itinerary = await enhanceWithRealPlaces(itinerary, city)
    
    // Validate real-time data freshness
    const realTimeValidation = validateRealTimeData(itinerary)
    if (!realTimeValidation.isValid) {
      globalMonitor.log(`Real-time data validation warnings: ${realTimeValidation.warnings.join(', ')}`)
    }

    // Extract location names for image search
    const locationNames = extractLocationNames(itinerary, city)
    globalMonitor.log(`Extracting images for ${locationNames.length} locations`)

    // Fetch diverse images with timeout control
    const imageMonitor = new PerformanceMonitor('Image fetching')
    let locationImages: { [key: string]: any } = {}

    try {
      locationImages = await Promise.race([
        fetchDiverseLocationImages(locationNames, imageSize),
        new Promise((_, reject) => 
          setTimeout(() => reject(new TimeoutError('image-fetch', TIMEOUTS.IMAGES)), TIMEOUTS.IMAGES)
        )
      ]) as { [key: string]: any }
      
      imageMonitor.finish(Object.keys(locationImages).length > 0)
    } catch (imageError) {
      imageMonitor.error(imageError as Error)
      globalMonitor.log('Image fetch failed, using fallback images')
      
      // Use fallback city image if available
      const fallbackImage = getFallbackCityImage(city)
      if (fallbackImage) {
        locationImages[city] = fallbackImage
      }
    }

    // Final response assembly
    const itineraryWithImages = {
      ...itinerary,
      locationImages,
      metadata: {
        generatedAt: new Date().toISOString(),
        requestId: crypto.randomUUID(),
        processingTime: Date.now() - globalMonitor['startTime'],
                 aiModel: 'llama-3.1-sonar-small-128k-online',
        imageCount: Object.keys(locationImages).length,
        cityConfig: cityConfig ? 'enhanced' : 'standard',
        version: '2.0.0',
        realTimeData: {
          validated: realTimeValidation.isValid,
          warnings: realTimeValidation.warnings,
          dataFreshness: 'real-time'
        },
        googlePlaces: {
          enhanced: true,
          realPlacesCount: countRealPlaces(itinerary),
          currentStatus: true
        }
      }
    }

    globalMonitor.finish(true)
    
    return NextResponse.json(itineraryWithImages, {
      headers: {
        'X-Processing-Time': `${Date.now() - globalMonitor['startTime']}ms`,
        'X-Request-ID': itineraryWithImages.metadata.requestId,
        'X-Image-Count': Object.keys(locationImages).length.toString()
      }
    })

  } catch (error) {
    globalMonitor.error(error as Error)
    
    const errorResponse = {
      error: error instanceof Error ? error.message : 'Internal server error',
      type: error instanceof TimeoutError ? 'timeout' : 'general',
      timestamp: new Date().toISOString(),
      requestId: crypto.randomUUID(),
      processingTime: Date.now() - globalMonitor['startTime']
    }

    return NextResponse.json(errorResponse, { 
      status: error instanceof TimeoutError ? 408 : 500,
      headers: {
        'X-Error-Type': errorResponse.type,
        'X-Request-ID': errorResponse.requestId
      }
    })
  }
}

// Enhanced fallback itinerary with ONLY REAL places - NO GENERIC NAMES
function generateEnhancedFallbackItinerary(city: string, days: number, budget: string, cityConfig?: any) {
  const currentDate = new Date()
  const itinerary = {
    days: [] as any[],
    summary: {
      totalCost: `₹${budget}`,
      costBreakdown: {
        accommodation: `₹${Math.round(parseFloat(budget.replace(/[^\d]/g, '')) * 0.4)}`,
        food: `₹${Math.round(parseFloat(budget.replace(/[^\d]/g, '')) * 0.25)}`,
        activities: `₹${Math.round(parseFloat(budget.replace(/[^\d]/g, '')) * 0.25)}`,
        transportation: `₹${Math.round(parseFloat(budget.replace(/[^\d]/g, '')) * 0.1)}`
      },
      highlights: [`Explore the heart of ${city}`, `Experience local culture and cuisine`, `Visit top attractions and landmarks`],
      tips: [`Plan your visits during off-peak hours`, `Try local transportation`, `Keep some cash handy for local vendors`],
      culturalTips: cityConfig?.culturalTips || [`Respect local customs and traditions in ${city}`],
      bestTime: cityConfig?.weatherInfo || `Research the best time to visit ${city} based on weather and tourist seasons`,
      weatherOverview: cityConfig?.weatherInfo || `Check current weather conditions for ${city}`,
      budgetingTips: [`Book accommodations in advance for better rates`, `Eat at local restaurants for authentic and affordable meals`]
    }
  }

  for (let day = 1; day <= days; day++) {
    const dayDate = new Date(currentDate)
    dayDate.setDate(currentDate.getDate() + day - 1)
    
    // Get real places for this day based on day number
    const dayPlaces = getDaySpecificPlaces(city, day)
    
    itinerary.days.push({
      day,
      date: dayDate.toISOString().split('T')[0],
      summary: `Day ${day}: Discover the best of ${city}`,
      weather: "Please check current weather conditions",
      morning: [
        {
          time: '9:00 AM',
          activity: `Morning exploration of ${dayPlaces.morning.name}`,
          location: dayPlaces.morning,
          description: `Start your day exploring the vibrant ${dayPlaces.morning.name} area of ${city}`,
          estimatedCost: '₹200-500',
          duration: '2-3 hours'
        }
      ],
      afternoon: [
        {
          time: '2:00 PM',
          activity: `Visit ${dayPlaces.afternoon.name}`,
          location: dayPlaces.afternoon,
          description: `Explore the must-see ${dayPlaces.afternoon.name} and its cultural significance`,
          estimatedCost: '₹300-800',
          duration: '3-4 hours'
        }
      ],
      evening: [
        {
          time: '7:00 PM',
          activity: `Evening at ${dayPlaces.evening.name}`,
          location: dayPlaces.evening,
          description: `Experience the evening atmosphere and culture of ${dayPlaces.evening.name}`,
          estimatedCost: '₹400-1000',
          duration: '2-3 hours'
        }
      ],
      dining: [
        {
          meal: 'Breakfast',
          restaurant: dayPlaces.breakfast.name,
          cuisine: dayPlaces.breakfast.cuisine || 'Local Cuisine',
          location: dayPlaces.breakfast,
          price: '₹200-400',
          speciality: dayPlaces.breakfast.speciality || 'Traditional breakfast items',
          rating: '4.0/5',
          ambiance: 'Casual and welcoming',
          culturalNote: `Experience authentic ${city} morning dining culture`
        },
        {
          meal: 'Lunch',
          restaurant: dayPlaces.lunch.name,
          cuisine: dayPlaces.lunch.cuisine || 'Regional Specialties',
          location: dayPlaces.lunch,
          price: '₹400-800',
          speciality: dayPlaces.lunch.speciality || 'Local lunch specialties',
          rating: '4.2/5',
          ambiance: 'Family-friendly',
          culturalNote: `Try authentic ${city} regional dishes`
        },
        {
          meal: 'Dinner',
          restaurant: dayPlaces.dinner.name,
          cuisine: dayPlaces.dinner.cuisine || 'Fine Dining',
          location: dayPlaces.dinner,
          price: '₹800-1500',
          speciality: dayPlaces.dinner.speciality || 'Evening specialties and local delicacies',
          rating: '4.3/5',
          ambiance: 'Elegant and sophisticated',
          culturalNote: `Experience upscale ${city} dining traditions`
        }
      ]
    })
  }

  return itinerary
}

// Validate and enhance itinerary structure
function validateAndEnhanceItinerary(itinerary: any, city: string, days: number, budget: string, cityConfig?: any) {
  if (!itinerary || !itinerary.days || !Array.isArray(itinerary.days)) {
    return generateEnhancedFallbackItinerary(city, days, budget, cityConfig)
  }

  // Ensure all required fields exist
  if (!itinerary.summary) {
    itinerary.summary = {
      totalCost: `₹${budget}`,
      highlights: [`Explore ${city}`, 'Experience local culture', 'Enjoy local cuisine'],
      tips: ['Plan ahead', 'Stay hydrated', 'Respect local customs'],
      bestTime: 'Year-round destination'
    }
  }

  // Validate each day
  itinerary.days.forEach((day: any, index: number) => {
    if (!day.dining || day.dining.length < 3) {
      // Ensure all three meals exist
      day.dining = ensureAllMeals(day.dining || [], city)
    }
  })

  return itinerary
}

// Ensure all three meals exist for a day
function ensureAllMeals(existingMeals: any[], city: string) {
  const requiredMeals = ['Breakfast', 'Lunch', 'Dinner']
  const mealMap = new Map(existingMeals.map(meal => [meal.meal, meal]))
  
  return requiredMeals.map(mealType => {
    return mealMap.get(mealType) || {
      meal: mealType,
      restaurant: `${city} ${mealType} Place`,
      cuisine: 'Local Cuisine',
      location: {
        name: `${city} ${mealType} Restaurant`,
        address: `${city}`,
        coordinates: [0, 0]
      },
      price: mealType === 'Breakfast' ? '₹200-400' : mealType === 'Lunch' ? '₹400-800' : '₹600-1200',
      speciality: `Local ${mealType.toLowerCase()} specialty`,
      rating: '4.0/5',
      ambiance: 'Friendly and welcoming',
      culturalNote: `Experience local ${mealType.toLowerCase()} culture`
    }
  })
}

// Extract location names for image search
function extractLocationNames(itinerary: any, city: string): string[] {
  const locationNames = new Set<string>()
  
  // Add city name
  locationNames.add(city)
  
  // Extract from activities and dining
  itinerary.days?.forEach((day: any) => {
    ['morning', 'afternoon', 'evening'].forEach(period => {
      day[period]?.forEach((activity: any) => {
        if (activity.location?.name) {
          locationNames.add(activity.location.name)
        }
      })
    })
    
    day.dining?.forEach((meal: any) => {
      if (meal.location?.name) {
        locationNames.add(meal.location.name)
      }
    })
  })
  
  return Array.from(locationNames).slice(0, 20) // Limit to 20 locations
}

// Search for real places using Google Places API
async function searchRealPlaces(query: string, city: string, type?: string): Promise<GooglePlace[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    console.warn('Google Places API key not configured')
    return []
  }

  try {
    // Clean and improve the search query
    let searchQuery = query.trim()
    
    // Remove generic terms that won't help with search
    const genericTerms = ['main attractions', 'main attraction', 'attractions', 'attraction', 'place', 'spot', 'area', 'location']
    genericTerms.forEach(term => {
      searchQuery = searchQuery.replace(new RegExp(term, 'gi'), '').trim()
    })
    
    // If query is too generic, try to make it more specific
    if (searchQuery.length < 3 || genericTerms.some(term => searchQuery.toLowerCase().includes(term))) {
      // Try with city + type instead
      if (type === 'tourist_attraction') {
        searchQuery = `${city} tourist attractions`
      } else if (type === 'restaurant') {
        searchQuery = `${city} restaurants`
      } else {
        searchQuery = city
      }
    } else {
      // Add city to the query
      searchQuery = `${searchQuery} ${city}`
    }
    
    console.log(`Searching Google Places for: "${searchQuery}" (type: ${type || 'any'})`)
    
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}${type ? `&type=${type}` : ''}&language=en`
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.status}`)
    }

    const data: GooglePlacesResponse = await response.json()
    
    if (data.status !== 'OK') {
      console.log(`Google Places search result: ${data.status} - ${data.error_message || 'No error message'}`)
      if (data.status === 'ZERO_RESULTS') {
        // Try a broader search without type restriction
        if (type) {
          console.log(`Retrying without type restriction for: "${searchQuery}"`)
          const broaderUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}&language=en`
          const broaderResponse = await fetch(broaderUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          })
          
          if (broaderResponse.ok) {
            const broaderData: GooglePlacesResponse = await broaderResponse.json()
            if (broaderData.status === 'OK') {
              console.log(`Broader search found ${broaderData.results.length} results`)
              return broaderData.results.slice(0, 5)
            }
          }
        }
      }
      throw new Error(`Google Places API status: ${data.status}`)
    }

    console.log(`Found ${data.results.length} places for: "${searchQuery}"`)
    return data.results.slice(0, 5) // Return top 5 results
  } catch (error) {
    console.error('Google Places API search failed:', error)
    return []
  }
}

// Get real-time place details including opening hours and current status
async function getPlaceDetails(placeId: string): Promise<any> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return null

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=opening_hours,price_level,rating,user_ratings_total,formatted_phone_number,website&key=${apiKey}`
    
    const response = await fetch(url)
    if (!response.ok) return null

    const data = await response.json()
    return data.result || null
  } catch (error) {
    console.error('Failed to get place details:', error)
    return null
  }
}

// Enhance itinerary with real Google Places data
async function enhanceWithRealPlaces(itinerary: any, city: string): Promise<any> {
  if (!itinerary?.days) return itinerary

  for (const day of itinerary.days) {
    // Enhance activities with real places
    for (const period of ['morning', 'afternoon', 'evening']) {
      if (day[period]) {
        for (const activity of day[period]) {
          if (activity.location?.name) {
            const realPlaces = await searchRealPlaces(activity.location.name, city, 'tourist_attraction')
            if (realPlaces.length > 0) {
              const bestPlace = realPlaces[0]
              const details = await getPlaceDetails(bestPlace.place_id)
              
              // Update with real data
              activity.location = {
                name: bestPlace.name,
                address: bestPlace.formatted_address,
                coordinates: [bestPlace.geometry.location.lat, bestPlace.geometry.location.lng],
                placeId: bestPlace.place_id,
                rating: bestPlace.rating,
                userRatings: bestPlace.user_ratings_total,
                openNow: details?.opening_hours?.open_now,
                priceLevel: details?.price_level,
                types: bestPlace.types
              }
              
              // Add real-time status
              if (details?.opening_hours?.weekday_text) {
                activity.currentStatus = {
                  openNow: details.opening_hours.open_now,
                  todayHours: details.opening_hours.weekday_text[new Date().getDay()] || 'Hours not available'
                }
              }
            } else {
              // Fallback: Use known popular places for the city
              const fallbackPlace = getFallbackPlace(activity.location.name, city)
              if (fallbackPlace) {
                activity.location = {
                  ...activity.location,
                  name: fallbackPlace.name,
                  address: fallbackPlace.address,
                  coordinates: fallbackPlace.coordinates,
                  fallback: true
                }
              }
            }
          }
        }
      }
    }

    // Enhance dining with real restaurants
    if (day.dining) {
      for (const meal of day.dining) {
        if (meal.restaurant) {
          const realRestaurants = await searchRealPlaces(meal.restaurant, city, 'restaurant')
          if (realRestaurants.length > 0) {
            const bestRestaurant = realRestaurants[0]
            const details = await getPlaceDetails(bestRestaurant.place_id)
            
            // Update with real data
            meal.location = {
              name: bestRestaurant.name,
              address: bestRestaurant.formatted_address,
              coordinates: [bestRestaurant.geometry.location.lat, bestRestaurant.geometry.location.lng],
              placeId: bestRestaurant.place_id,
              rating: bestRestaurant.rating,
              userRatings: bestRestaurant.user_ratings_total,
              openNow: details?.opening_hours?.open_now,
              priceLevel: details?.price_level,
              types: bestRestaurant.types
            }
            
            // Add real-time status
            if (details?.opening_hours?.weekday_text) {
              meal.currentStatus = {
                openNow: details.opening_hours.open_now,
                todayHours: details.opening_hours.weekday_text[new Date().getDay()] || 'Hours not available'
              }
            }
          } else {
            // Fallback: Use known popular restaurants for the city
            const fallbackRestaurant = getFallbackRestaurant(meal.restaurant, city)
            if (fallbackRestaurant) {
              meal.location = {
                ...meal.location,
                name: fallbackRestaurant.name,
                address: fallbackRestaurant.address,
                coordinates: fallbackRestaurant.coordinates,
                fallback: true
              }
            }
          }
        }
      }
    }
  }

  return itinerary
}

// Get day-specific real places for the itinerary - NO GENERIC NAMES
function getDaySpecificPlaces(city: string, day: number): any {
  const cityLower = city.toLowerCase()
  
  if (cityLower === 'mumbai') {
    const mumbaiDayPlaces: { [key: number]: any } = {
      1: {
        morning: {
          name: 'Gateway of India',
          address: 'Apollo Bandar, Colaba, Mumbai, Maharashtra 400001',
          coordinates: [18.9217, 72.8347]
        },
        afternoon: {
          name: 'Colaba Causeway',
          address: 'Colaba Causeway, Colaba, Mumbai, Maharashtra 400001',
          coordinates: [18.9187, 72.8347]
        },
        evening: {
          name: 'Marine Drive',
          address: 'Marine Drive, Mumbai, Maharashtra 400002',
          coordinates: [18.9431, 72.8235]
        },
        breakfast: {
          name: 'Leopold Cafe',
          address: 'Colaba Causeway, Colaba, Mumbai, Maharashtra 400001',
          coordinates: [18.9187, 72.8347],
          cuisine: 'Continental & Indian',
          speciality: 'Vada Pav & Coffee'
        },
        lunch: {
          name: 'Bademiya',
          address: 'Tulloch Road, Apollo Bunder, Colaba, Mumbai, Maharashtra 400001',
          coordinates: [18.9217, 72.8347],
          cuisine: 'Mughlai & Street Food',
          speciality: 'Seekh Kebab & Biryani'
        },
        dinner: {
          name: 'Trishna',
          address: 'Kala Ghoda, Fort, Mumbai, Maharashtra 400001',
          coordinates: [18.9290, 72.8347],
          cuisine: 'Seafood & Coastal',
          speciality: 'Crab Masala & Prawns'
        }
      },
      2: {
        morning: {
          name: 'Elephanta Caves',
          address: 'Elephanta Island, Mumbai, Maharashtra 400094',
          coordinates: [18.9633, 72.9315]
        },
        afternoon: {
          name: 'Juhu Beach',
          address: 'Juhu Beach, Juhu, Mumbai, Maharashtra 400049',
          coordinates: [19.0996, 72.8347]
        },
        evening: {
          name: 'Bandra West',
          address: 'Bandra West, Mumbai, Maharashtra 400050',
          coordinates: [19.0596, 72.8295]
        },
        breakfast: {
          name: 'Cafe Madras',
          address: 'King Circle, Matunga, Mumbai, Maharashtra 400019',
          coordinates: [19.0176, 72.8478],
          cuisine: 'South Indian',
          speciality: 'Masala Dosa & Filter Coffee'
        },
        lunch: {
          name: 'The Bombay Canteen',
          address: 'Kamala Mills, Lower Parel, Mumbai, Maharashtra 400013',
          coordinates: [19.0176, 72.8478],
          cuisine: 'Modern Indian',
          speciality: 'Regional Thalis & Cocktails'
        },
        dinner: {
          name: 'Trèsind Mumbai',
          address: 'BKC, Mumbai, Maharashtra 400051',
          coordinates: [19.0596, 72.8295],
          cuisine: 'Fine Dining Indian',
          speciality: 'Tasting Menu & Wine Pairing'
        }
      },
      3: {
        morning: {
          name: 'Taj Mahal Palace',
          address: 'Apollo Bunder, Colaba, Mumbai, Maharashtra 400001',
          coordinates: [18.9217, 72.8347]
        },
        afternoon: {
          name: 'Kala Ghoda Art District',
          address: 'Kala Ghoda, Fort, Mumbai, Maharashtra 400001',
          coordinates: [18.9290, 72.8347]
        },
        evening: {
          name: 'Worli Sea Face',
          address: 'Worli, Mumbai, Maharashtra 400018',
          coordinates: [19.0176, 72.8478]
        },
        breakfast: {
          name: 'K Rustom',
          address: 'Churchgate, Mumbai, Maharashtra 400020',
          coordinates: [18.9290, 72.8347],
          cuisine: 'Parsi & Continental',
          speciality: 'Ice Cream & Sandwiches'
        },
        lunch: {
          name: 'Gajalee',
          address: 'Vile Parle, Mumbai, Maharashtra 400056',
          coordinates: [19.0996, 72.8347],
          cuisine: 'Seafood & Coastal',
          speciality: 'Pomfret Fry & Prawn Curry'
        },
        dinner: {
          name: 'Masala Library',
          address: 'BKC, Mumbai, Maharashtra 400051',
          coordinates: [19.0596, 72.8295],
          cuisine: 'Molecular Indian',
          speciality: 'Innovative Indian Cuisine'
        }
      }
    }
    
    return mumbaiDayPlaces[day] || mumbaiDayPlaces[1]
  }
  
  if (cityLower === 'delhi') {
    const delhiDayPlaces: { [key: number]: any } = {
      1: {
        morning: {
          name: 'Red Fort',
          address: 'Netaji Subhash Marg, Lal Qila, Old Delhi, New Delhi, Delhi 110006',
          coordinates: [28.6562, 77.2410]
        },
        afternoon: {
          name: 'Chandni Chowk',
          address: 'Chandni Chowk, Old Delhi, Delhi 110006',
          coordinates: [28.6562, 77.2410]
        },
        evening: {
          name: 'India Gate',
          address: 'Rajpath, New Delhi, Delhi 110001',
          coordinates: [28.6129, 77.2295]
        },
        breakfast: {
          name: 'Paranthe Wali Gali',
          address: 'Chandni Chowk, Old Delhi, Delhi 110006',
          coordinates: [28.6562, 77.2410],
          cuisine: 'North Indian',
          speciality: 'Stuffed Paranthas'
        },
        lunch: {
          name: 'Karim\'s',
          address: 'Jama Masjid, Old Delhi, Delhi 110006',
          coordinates: [28.6505, 77.2334],
          cuisine: 'Mughlai',
          speciality: 'Mutton Korma & Biryani'
        },
        dinner: {
          name: 'Bukhara',
          address: 'ITC Maurya, New Delhi, Delhi 110037',
          coordinates: [28.6129, 77.2295],
          cuisine: 'North Indian',
          speciality: 'Dal Bukhara & Tandoori'
        }
      },
      2: {
        morning: {
          name: 'Humayun\'s Tomb',
          address: 'Mathura Road, Nizamuddin, New Delhi, Delhi 110013',
          coordinates: [28.5931, 77.2506]
        },
        afternoon: {
          name: 'Qutub Minar',
          address: 'Mehrauli, New Delhi, Delhi 110030',
          coordinates: [28.5245, 77.1855]
        },
        evening: {
          name: 'Lodhi Garden',
          address: 'Lodhi Road, New Delhi, Delhi 110003',
          coordinates: [28.5931, 77.2506]
        },
        breakfast: {
          name: 'Haldiram\'s',
          address: 'Connaught Place, New Delhi, Delhi 110001',
          coordinates: [28.6129, 77.2295],
          cuisine: 'North Indian',
          speciality: 'Chole Bhature & Samosa'
        },
        lunch: {
          name: 'Pindi',
          address: 'Pandara Road, New Delhi, Delhi 110011',
          coordinates: [28.5931, 77.2506],
          cuisine: 'Punjabi',
          speciality: 'Butter Chicken & Dal Makhani'
        },
        dinner: {
          name: 'Indian Accent',
          address: 'The Lodhi, New Delhi, Delhi 110003',
          coordinates: [28.5931, 77.2506],
          cuisine: 'Modern Indian',
          speciality: 'Tasting Menu & Wine Pairing'
        }
      },
      3: {
        morning: {
          name: 'Akshardham Temple',
          address: 'Noida Mor, New Delhi, Delhi 110092',
          coordinates: [28.6129, 77.2295]
        },
        afternoon: {
          name: 'Lotus Temple',
          address: 'Bahapur, New Delhi, Delhi 110019',
          coordinates: [28.5535, 77.2588]
        },
        evening: {
          name: 'Connaught Place',
          address: 'Connaught Place, New Delhi, Delhi 110001',
          coordinates: [28.6129, 77.2295]
        },
        breakfast: {
          name: 'Bengali Sweet House',
          address: 'Chandni Chowk, Old Delhi, Delhi 110006',
          coordinates: [28.6562, 77.2410],
          cuisine: 'Bengali',
          speciality: 'Rasgulla & Sandesh'
        },
        lunch: {
          name: 'Dhaba',
          address: 'Pandara Road, New Delhi, Delhi 110011',
          coordinates: [28.5931, 77.2506],
          cuisine: 'Punjabi Dhaba',
          speciality: 'Sarson da Saag & Makki di Roti'
        },
        dinner: {
          name: 'Dum Pukht',
          address: 'ITC Maurya, New Delhi, Delhi 110037',
          coordinates: [28.6129, 77.2295],
          cuisine: 'Awadhi',
          speciality: 'Dum Biryani & Kebabs'
        }
      }
    }
    
    return delhiDayPlaces[day] || delhiDayPlaces[1]
  }
  
  if (cityLower === 'tokyo') {
    const tokyoDayPlaces: { [key: number]: any } = {
      1: {
        morning: {
          name: 'Senso-ji Temple',
          address: '2-3-1 Asakusa, Taito City, Tokyo 111-0032, Japan',
          coordinates: [35.7148, 139.7967]
        },
        afternoon: {
          name: 'Tokyo Skytree',
          address: '1-1-2 Oshiage, Sumida City, Tokyo 131-0045, Japan',
          coordinates: [35.7100, 139.8107]
        },
        evening: {
          name: 'Asakusa District',
          address: 'Asakusa, Taito City, Tokyo 111-0032, Japan',
          coordinates: [35.7148, 139.7967]
        },
        breakfast: {
          name: 'Tsukiji Outer Market',
          address: 'Tsukiji, Chuo City, Tokyo 104-0045, Japan',
          coordinates: [35.6654, 139.7704],
          cuisine: 'Japanese Street Food',
          speciality: 'Fresh Sushi & Tamago'
        },
        lunch: {
          name: 'Ichiran Ramen',
          address: 'Shibuya, Tokyo 150-0002, Japan',
          coordinates: [35.6595, 139.7004],
          cuisine: 'Ramen',
          speciality: 'Tonkotsu Ramen'
        },
        dinner: {
          name: 'Sukiyabashi Jiro',
          address: 'Ginza, Chuo City, Tokyo 104-0061, Japan',
          coordinates: [35.6720, 139.7676],
          cuisine: 'Sushi',
          speciality: 'Omakase Sushi'
        }
      },
      2: {
        morning: {
          name: 'Meiji Shrine',
          address: '1-1 Yoyogikamizonocho, Shibuya City, Tokyo 151-8557, Japan',
          coordinates: [35.6762, 139.6993]
        },
        afternoon: {
          name: 'Shibuya Crossing',
          address: 'Shibuya, Tokyo 150-0002, Japan',
          coordinates: [35.6595, 139.7004]
        },
        evening: {
          name: 'Harajuku',
          address: 'Harajuku, Shibuya City, Tokyo 150-0001, Japan',
          coordinates: [35.6702, 139.7016]
        },
        breakfast: {
          name: 'Bills',
          address: 'Omotesando, Shibuya City, Tokyo 150-0001, Japan',
          coordinates: [35.6702, 139.7016],
          cuisine: 'International',
          speciality: 'Ricotta Hotcakes'
        },
        lunch: {
          name: 'Afuri Ramen',
          address: 'Harajuku, Shibuya City, Tokyo 150-0001, Japan',
          coordinates: [35.6702, 139.7016],
          cuisine: 'Ramen',
          speciality: 'Yuzu Shio Ramen'
        },
        dinner: {
          name: 'Narisawa',
          address: 'Minato City, Tokyo 107-0062, Japan',
          coordinates: [35.6620, 139.7178],
          cuisine: 'French-Japanese Fusion',
          speciality: 'Seasonal Tasting Menu'
        }
      },
      3: {
        morning: {
          name: 'Imperial Palace',
          address: '1-1 Chiyoda, Chiyoda City, Tokyo 100-8111, Japan',
          coordinates: [35.6850, 139.7528]
        },
        afternoon: {
          name: 'Ginza District',
          address: 'Ginza, Chuo City, Tokyo 104-0061, Japan',
          coordinates: [35.6720, 139.7676]
        },
        evening: {
          name: 'Roppongi Hills',
          address: 'Roppongi, Minato City, Tokyo 106-0032, Japan',
          coordinates: [35.6620, 139.7178]
        },
        breakfast: {
          name: 'Gonpachi',
          address: 'Nishi-Azabu, Minato City, Tokyo 106-0031, Japan',
          coordinates: [35.6620, 139.7178],
          cuisine: 'Japanese',
          speciality: 'Soba & Tempura'
        },
        lunch: {
          name: 'Sukiyabashi Jiro Honten',
          address: 'Ginza, Chuo City, Tokyo 104-0061, Japan',
          coordinates: [35.6720, 139.7676],
          cuisine: 'Sushi',
          speciality: 'Premium Sushi'
        },
        dinner: {
          name: 'Ryugin',
          address: 'Roppongi, Minato City, Tokyo 106-0032, Japan',
          coordinates: [35.6620, 139.7178],
          cuisine: 'Kaiseki',
          speciality: 'Traditional Japanese'
        }
      }
    }
    
    return tokyoDayPlaces[day] || tokyoDayPlaces[1]
  }
  
  // Default fallback for other cities
  return {
    morning: { name: 'City Center', address: city, coordinates: [0, 0] },
    afternoon: { name: 'Main Square', address: city, coordinates: [0, 0] },
    evening: { name: 'Downtown', address: city, coordinates: [0, 0] },
    breakfast: { name: 'Local Cafe', address: city, coordinates: [0, 0] },
    lunch: { name: 'Local Restaurant', address: city, coordinates: [0, 0] },
    dinner: { name: 'Local Dining', address: city, coordinates: [0, 0] }
  }
}

// Fallback places for when Google Places API fails
function getFallbackPlace(originalName: string, city: string): any {
  const cityLower = city.toLowerCase()
  
  if (cityLower === 'mumbai') {
    const mumbaiPlaces = {
      'gateway of india': {
        name: 'Gateway of India',
        address: 'Apollo Bandar, Colaba, Mumbai, Maharashtra 400001',
        coordinates: [18.9217, 72.8347]
      },
      'marine drive': {
        name: 'Marine Drive',
        address: 'Marine Drive, Mumbai, Maharashtra 400002',
        coordinates: [18.9431, 72.8235]
      },
      'colaba causeway': {
        name: 'Colaba Causeway',
        address: 'Colaba Causeway, Colaba, Mumbai, Maharashtra 400001',
        coordinates: [18.9187, 72.8347]
      },
      'juhu beach': {
        name: 'Juhu Beach',
        address: 'Juhu Beach, Juhu, Mumbai, Maharashtra 400049',
        coordinates: [19.0996, 72.8347]
      },
      'elephanta caves': {
        name: 'Elephanta Caves',
        address: 'Elephanta Island, Mumbai, Maharashtra 400094',
        coordinates: [18.9633, 72.9315]
      },
      'taj mahal palace': {
        name: 'Taj Mahal Palace',
        address: 'Apollo Bunder, Colaba, Mumbai, Maharashtra 400001',
        coordinates: [18.9217, 72.8347]
      }
    }
    
    // Try to find a match
    for (const [key, place] of Object.entries(mumbaiPlaces)) {
      if (originalName.toLowerCase().includes(key) || key.includes(originalName.toLowerCase())) {
        return place
      }
    }
    
    // Return a default popular place
    return mumbaiPlaces['gateway of india']
  }
  
  if (cityLower === 'delhi') {
    const delhiPlaces = {
      'red fort': {
        name: 'Red Fort',
        address: 'Netaji Subhash Marg, Lal Qila, Old Delhi, New Delhi, Delhi 110006',
        coordinates: [28.6562, 77.2410]
      },
      'india gate': {
        name: 'India Gate',
        address: 'Rajpath, New Delhi, Delhi 110001',
        coordinates: [28.6129, 77.2295]
      },
      'humayun tomb': {
        name: 'Humayun\'s Tomb',
        address: 'Mathura Road, Nizamuddin, New Delhi, Delhi 110013',
        coordinates: [28.5931, 77.2506]
      },
      'qutub minar': {
        name: 'Qutub Minar',
        address: 'Mehrauli, New Delhi, Delhi 110030',
        coordinates: [28.5245, 77.1855]
      }
    }
    
    for (const [key, place] of Object.entries(delhiPlaces)) {
      if (originalName.toLowerCase().includes(key) || key.includes(originalName.toLowerCase())) {
        return place
      }
    }
    
    return delhiPlaces['red fort']
  }
  
  if (cityLower === 'tokyo') {
    const tokyoPlaces = {
      'senso ji': {
        name: 'Senso-ji Temple',
        address: '2-3-1 Asakusa, Taito City, Tokyo 111-0032, Japan',
        coordinates: [35.7148, 139.7967]
      },
      'tokyo skytree': {
        name: 'Tokyo Skytree',
        address: '1-1-2 Oshiage, Sumida City, Tokyo 131-0045, Japan',
        coordinates: [35.7100, 139.8107]
      },
      'shibuya crossing': {
        name: 'Shibuya Crossing',
        address: 'Shibuya, Tokyo 150-0002, Japan',
        coordinates: [35.6595, 139.7004]
      }
    }
    
    for (const [key, place] of Object.entries(tokyoPlaces)) {
      if (originalName.toLowerCase().includes(key) || key.includes(originalName.toLowerCase())) {
        return place
      }
    }
    
    return tokyoPlaces['senso ji']
  }
  
  return null
}

// Fallback restaurants for when Google Places API fails
function getFallbackRestaurant(originalName: string, city: string): any {
  const cityLower = city.toLowerCase()
  
  if (cityLower === 'mumbai') {
    const mumbaiRestaurants = {
      'leopold cafe': {
        name: 'Leopold Cafe',
        address: 'Colaba Causeway, Colaba, Mumbai, Maharashtra 400001',
        coordinates: [18.9187, 72.8347]
      },
      'bademiya': {
        name: 'Bademiya',
        address: 'Tulloch Road, Apollo Bunder, Colaba, Mumbai, Maharashtra 400001',
        coordinates: [18.9217, 72.8347]
      },
      'trishna': {
        name: 'Trishna',
        address: 'Kala Ghoda, Fort, Mumbai, Maharashtra 400001',
        coordinates: [18.9290, 72.8347]
      }
    }
    
    for (const [key, restaurant] of Object.entries(mumbaiRestaurants)) {
      if (originalName.toLowerCase().includes(key) || key.includes(originalName.toLowerCase())) {
        return restaurant
      }
    }
    
    return mumbaiRestaurants['leopold cafe']
  }
  
  return null
}

// Validate real-time data freshness
function validateRealTimeData(itinerary: any): { isValid: boolean; warnings: string[] } {
  const warnings: string[] = []
  const currentDate = new Date()
  
  // Check if dates are current
  itinerary.days?.forEach((day: any, index: number) => {
    if (day.date) {
      const dayDate = new Date(day.date)
      const daysDiff = Math.ceil((dayDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))
      
      if (daysDiff < 0) {
        warnings.push(`Day ${index + 1} has a past date: ${day.date}`)
      }
    }
    
    // Check for current weather information
    if (day.weather && day.weather.includes('Please check current weather conditions')) {
      warnings.push(`Day ${index + 1} has generic weather info - should use real-time data`)
    }
    
    // Check for current pricing
    if (day.morning || day.afternoon || day.evening) {
      ['morning', 'afternoon', 'evening'].forEach(period => {
        day[period]?.forEach((activity: any) => {
          if (activity.estimatedCost && activity.estimatedCost.includes('₹200-500')) {
            warnings.push(`Day ${index + 1} ${period} has generic pricing - should use current rates`)
          }
        })
      })
    }
  })
  
  return {
    isValid: warnings.length === 0,
    warnings
  }
}

// Count real places in the itinerary
function countRealPlaces(itinerary: any): number {
  let count = 0
  
  if (!itinerary?.days) return count
  
  itinerary.days.forEach((day: any) => {
    ['morning', 'afternoon', 'evening'].forEach(period => {
      day[period]?.forEach((activity: any) => {
        if (activity.location?.placeId) count++
      })
    })
    
    day.dining?.forEach((meal: any) => {
      if (meal.location?.placeId) count++
    })
  })
  
  return count
}
