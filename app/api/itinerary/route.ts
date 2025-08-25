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

    // Get city-specific configuration
    const cityConfig = CITY_CONFIGS[city.toLowerCase() as keyof typeof CITY_CONFIGS]
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
    
    const prompt = `Generate a detailed ${days}-day travel itinerary for ${city} with a budget of ₹${adjustedBudget}${interestsText}.${culturalTipsText}${weatherText}

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
                  content: 'You are a professional travel planner with deep knowledge of global destinations. You MUST return ONLY valid JSON without any markdown formatting, explanations, or additional text. The response must be parseable by JSON.parse(). Never use trailing commas. Never include text before or after the JSON object. Include accurate coordinates and realistic pricing.'
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
        version: '2.0.0'
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

// Enhanced fallback itinerary with city-specific information
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
    
    itinerary.days.push({
      day,
      date: dayDate.toISOString().split('T')[0],
      summary: `Day ${day}: Discover the best of ${city}`,
      weather: "Please check current weather conditions",
      morning: [
        {
          time: '9:00 AM',
          activity: `Morning exploration of ${city}`,
          location: {
            name: `${city} Central Area`,
            address: `Central ${city}`,
            coordinates: [0, 0]
          },
          description: `Start your day exploring the vibrant streets and morning atmosphere of ${city}`,
          estimatedCost: '₹200-500',
          duration: '2-3 hours'
        }
      ],
      afternoon: [
        {
          time: '2:00 PM',
          activity: `Visit popular attractions in ${city}`,
          location: {
            name: `${city} Main Attractions`,
            address: `Tourist Area, ${city}`,
            coordinates: [0, 0]
          },
          description: `Explore the must-see sights and cultural landmarks that make ${city} special`,
          estimatedCost: '₹300-800',
          duration: '3-4 hours'
        }
      ],
      evening: [
        {
          time: '7:00 PM',
          activity: `Evening leisure in ${city}`,
          location: {
            name: `${city} Evening District`,
            address: `Entertainment Area, ${city}`,
            coordinates: [0, 0]
          },
          description: `Experience the nightlife and evening culture of ${city}`,
          estimatedCost: '₹400-1000',
          duration: '2-3 hours'
        }
      ],
      dining: [
        {
          meal: 'Breakfast',
          restaurant: `Local ${city} Breakfast Spot`,
          cuisine: 'Local Cuisine',
          location: {
            name: `${city} Breakfast Place`,
            address: `Morning District, ${city}`,
            coordinates: [0, 0]
          },
          price: '₹200-400',
          speciality: 'Traditional breakfast items',
          rating: '4.0/5',
          ambiance: 'Casual and welcoming',
          culturalNote: `Experience authentic ${city} morning dining culture`
        },
        {
          meal: 'Lunch',
          restaurant: `Traditional ${city} Restaurant`,
          cuisine: 'Regional Specialties',
          location: {
            name: `${city} Lunch Restaurant`,
            address: `Central ${city}`,
            coordinates: [0, 0]
          },
          price: '₹400-800',
          speciality: 'Local lunch specialties',
          rating: '4.2/5',
          ambiance: 'Family-friendly',
          culturalNote: `Try authentic ${city} regional dishes`
        },
        {
          meal: 'Dinner',
          restaurant: `Premium ${city} Dining`,
          cuisine: 'Fine Dining',
          location: {
            name: `${city} Dinner Restaurant`,
            address: `Dining District, ${city}`,
            coordinates: [0, 0]
          },
          price: '₹800-1500',
          speciality: 'Evening specialties and local delicacies',
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
