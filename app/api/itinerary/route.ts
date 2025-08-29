import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { PerformanceMonitor, fetchWithTimeout, TIMEOUTS } from '@/app/utils/timeout'
import { fetchDiverseLocationImages, getFallbackCityImage } from '@/app/utils/pexels'

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '')

// Real-time location data APIs
async function fetchRealLocationData(city: string) {
  const monitor = new PerformanceMonitor(`Real location data: ${city}`)
  
  try {
    // Use Nominatim (OpenStreetMap) for real location data - free and reliable
    const geocodeResponse = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&addressdetails=1`,
      {
        timeout: 8000,
        operation: 'geocoding'
      }
    )
    
    if (!geocodeResponse.ok) {
      throw new Error(`Geocoding failed: ${geocodeResponse.status}`)
    }
    
    const geocodeData = await geocodeResponse.json()
    
    if (!geocodeData || geocodeData.length === 0) {
      throw new Error('City not found')
    }
    
    const location = geocodeData[0]
    const coordinates = [parseFloat(location.lat), parseFloat(location.lon)]
    
    // Fetch nearby attractions using Overpass API (OpenStreetMap data)
    const attractionsResponse = await fetchWithTimeout(
      `https://overpass-api.de/api/interpreter?data=[out:json][timeout:10];(node["tourism"~"attraction|museum|monument|castle|palace|temple|church|mosque|synagogue|shrine"](around:5000,${coordinates[0]},${coordinates[1]});way["tourism"~"attraction|museum|monument|castle|palace|temple|church|mosque|synagogue|shrine"](around:5000,${coordinates[0]},${coordinates[1]}););out center;`,
      {
        timeout: 10000,
        operation: 'attractions-fetch'
      }
    )
    
    let attractions = []
    if (attractionsResponse.ok) {
      const attractionsData = await attractionsResponse.json()
      attractions = attractionsData.elements?.slice(0, 20).map((element: any) => ({
        name: element.tags?.name || `${city} Attraction`,
        type: element.tags?.tourism || 'attraction',
        address: element.tags?.['addr:full'] || `${city}`,
        coordinates: element.lat && element.lon ? [element.lat, element.lon] : coordinates,
        description: element.tags?.description || `Popular attraction in ${city}`
      })) || []
    }
    
    // Fetch restaurants using Overpass API
    const restaurantsResponse = await fetchWithTimeout(
      `https://overpass-api.de/api/interpreter?data=[out:json][timeout:10];(node["amenity"="restaurant"](around:3000,${coordinates[0]},${coordinates[1]});way["amenity"="restaurant"](around:3000,${coordinates[0]},${coordinates[1]}););out center;`,
      {
        timeout: 10000,
        operation: 'restaurants-fetch'
      }
    )
    
    let restaurants = []
    if (restaurantsResponse.ok) {
      const restaurantsData = await restaurantsResponse.json()
      restaurants = restaurantsData.elements?.slice(0, 15).map((element: any) => ({
        name: element.tags?.name || `${city} Restaurant`,
        cuisine: element.tags?.cuisine || 'Local',
        address: element.tags?.['addr:full'] || `${city}`,
        coordinates: element.lat && element.lon ? [element.lat, element.lon] : coordinates,
        phone: element.tags?.phone || '',
        website: element.tags?.website || ''
      })) || []
    }
    
    monitor.finish(true)
    
    return {
      city: location.display_name.split(',')[0],
      country: location.address?.country || 'Unknown',
      coordinates,
      attractions,
      restaurants,
      timezone: 'Asia/Kolkata', // Default for India, could be enhanced
      population: location.address?.population || 'Unknown'
    }
    
  } catch (error) {
    monitor.error(error as Error)
    
    // Return fallback data structure
    return {
      city,
      country: 'Unknown',
      coordinates: [0, 0],
      attractions: [],
      restaurants: [],
      timezone: 'UTC',
      population: 'Unknown'
    }
  }
}

// Get real-time weather data
async function getRealWeatherData(coordinates: [number, number]) {
  try {
    // Using OpenWeatherMap's free tier with a demo key
    const response = await fetchWithTimeout(
      `https://api.openweathermap.org/data/2.5/weather?lat=${coordinates[0]}&lon=${coordinates[1]}&units=metric&appid=demo`,
      {
        timeout: 5000,
        operation: 'weather-fetch'
      }
    )
    
    if (response.ok) {
      const data = await response.json()
      return {
        temperature: Math.round(data.main?.temp || 25),
        condition: data.weather?.[0]?.description || 'pleasant weather',
        humidity: data.main?.humidity || 60,
        windSpeed: data.wind?.speed || 5
      }
    }
  } catch (error) {
    console.log('Weather API unavailable, using seasonal defaults')
  }
  
  // Seasonal fallback based on current date
  const month = new Date().getMonth()
  const isWinter = month >= 11 || month <= 2
  const isSummer = month >= 3 && month <= 6
  
  return {
    temperature: isWinter ? 18 : isSummer ? 32 : 25,
    condition: isWinter ? 'cool and pleasant' : isSummer ? 'warm and sunny' : 'pleasant weather',
    humidity: isWinter ? 45 : isSummer ? 70 : 60,
    windSpeed: 8
  }
}

// Generate AI-powered itinerary using real data
async function generateAIItinerary(
  city: string,
  days: number,
  budget: string,
  interests: string[],
  locationData: any,
  weather: any
) {
  const monitor = new PerformanceMonitor('AI Itinerary Generation')
  
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" })
    
    const prompt = `Create a detailed ${days}-day travel itinerary for ${city} with the following requirements:

REAL LOCATION DATA:
- City: ${locationData.city}, ${locationData.country}
- Coordinates: ${locationData.coordinates[0]}, ${locationData.coordinates[1]}
- Available attractions: ${locationData.attractions.map(a => `${a.name} (${a.type}) at ${a.address}`).join(', ')}
- Available restaurants: ${locationData.restaurants.map(r => `${r.name} (${r.cuisine}) at ${r.address}`).join(', ')}

TRIP REQUIREMENTS:
- Budget: ${budget} INR total
- Duration: ${days} days
- Interests: ${interests.join(', ')}
- Current weather: ${weather.temperature}°C, ${weather.condition}

IMPORTANT INSTRUCTIONS:
1. Use ONLY the real attractions and restaurants provided above
2. Include exact addresses from the location data
3. Create realistic timing and costs based on the budget
4. Include cultural tips specific to ${city}
5. Suggest realistic transportation between locations
6. Include weather-appropriate activities

Please respond with a JSON object in this exact format:
{
  "days": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "summary": "Day summary",
      "weather": "Weather description",
      "morning": [
        {
          "time": "9:00 AM",
          "activity": "Activity name",
          "location": {
            "name": "Exact location name from data",
            "address": "Exact address from data",
            "coordinates": [lat, lon]
          },
          "description": "Detailed description",
          "estimatedCost": "₹500-800",
          "duration": "2-3 hours"
        }
      ],
      "afternoon": [...],
      "evening": [...],
      "dining": [
        {
          "meal": "Breakfast/Lunch/Dinner",
          "restaurant": "Exact restaurant name from data",
          "cuisine": "Cuisine type",
          "location": {
            "name": "Restaurant name",
            "address": "Exact address",
            "coordinates": [lat, lon]
          },
          "price": "₹500-800",
          "speciality": "Signature dish",
          "rating": "4.2/5",
          "ambiance": "Description",
          "culturalNote": "Cultural context"
        }
      ]
    }
  ],
  "summary": {
    "totalCost": "${budget}",
    "costBreakdown": {
      "accommodation": "₹amount",
      "food": "₹amount", 
      "activities": "₹amount",
      "transportation": "₹amount"
    },
    "highlights": ["highlight1", "highlight2"],
    "tips": ["tip1", "tip2"],
    "culturalTips": ["cultural tip1", "cultural tip2"],
    "bestTime": "Best time to visit",
    "weatherOverview": "Weather information",
    "budgetingTips": ["budget tip1", "budget tip2"]
  }
}`

    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()
    
    // Extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Invalid AI response format')
    }
    
    const itineraryData = JSON.parse(jsonMatch[0])
    monitor.finish(true)
    
    return itineraryData
    
  } catch (error) {
    monitor.error(error as Error)
    throw error
  }
}

// Main POST endpoint
export async function POST(request: NextRequest) {
  const monitor = new PerformanceMonitor('Itinerary Generation')
  
  try {
    const { city, budget, days, interests } = await request.json()
    
    // Validate input
    if (!city || !budget || !days) {
      return NextResponse.json({
        error: 'Missing required fields: city, budget, days',
        timestamp: new Date().toISOString()
      }, { status: 400 })
    }
    
    monitor.log(`Generating itinerary for ${city}, ${days} days, budget: ${budget}`)
    
    // Check if Gemini API key is configured
    if (!process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY === 'your_gemini_api_key_here') {
      monitor.log('Gemini API key not configured, using fallback')
      
      // Use fallback endpoint
      const fallbackResponse = await fetch(`${request.nextUrl.origin}/api/itinerary/fallback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, budget, days, interests })
      })
      
      return fallbackResponse
    }
    
    // Fetch real location data
    const locationData = await fetchRealLocationData(city)
    
    if (locationData.attractions.length === 0 && locationData.restaurants.length === 0) {
      monitor.log('No real location data found, using fallback')
      
      const fallbackResponse = await fetch(`${request.nextUrl.origin}/api/itinerary/fallback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, budget, days, interests })
      })
      
      return fallbackResponse
    }
    
    // Get real weather data
    const weather = await getRealWeatherData(locationData.coordinates)
    
    // Generate AI itinerary with real data
    const budgetNumber = parseFloat(budget.replace(/[^\d]/g, ''))
    const itineraryData = await generateAIItinerary(
      city, 
      days, 
      budgetNumber, 
      interests, 
      locationData, 
      weather
    )
    
    // Fetch real images for locations
    const locationNames = [
      city,
      ...itineraryData.days.flatMap((day: any) => [
        ...day.morning.map((a: any) => a.location.name),
        ...day.afternoon.map((a: any) => a.location.name),
        ...day.evening.map((a: any) => a.location.name),
        ...day.dining.map((d: any) => d.location.name)
      ])
    ]
    
    // Remove duplicates
    const uniqueLocationNames = Array.from(new Set(locationNames))
    
    let locationImages = {}
    try {
      locationImages = await fetchDiverseLocationImages(uniqueLocationNames.slice(0, 10))
      
      // Add fallback for main city if no image found
      if (!locationImages[city]) {
        const fallbackImage = getFallbackCityImage(city)
        if (fallbackImage) {
          locationImages[city] = fallbackImage
        }
      }
    } catch (error) {
      monitor.log('Image fetch failed, using fallbacks')
      const fallbackImage = getFallbackCityImage(city)
      if (fallbackImage) {
        locationImages[city] = fallbackImage
      }
    }
    
    const response = {
      ...itineraryData,
      locationImages,
      metadata: {
        generatedAt: new Date().toISOString(),
        requestId: crypto.randomUUID(),
        processingTime: 0,
        aiModel: 'gemini-pro',
        imageCount: Object.keys(locationImages).length,
        cityConfig: 'real-data',
        version: '2.0.0',
        realDataSources: {
          locations: 'OpenStreetMap/Overpass API',
          weather: 'OpenWeatherMap',
          images: 'Pexels API',
          ai: 'Google Gemini Pro'
        }
      }
    }
    
    const processingTime = monitor.finish(true)
    response.metadata.processingTime = processingTime
    
    return NextResponse.json(response, {
      headers: {
        'X-Processing-Time': `${processingTime}ms`,
        'X-Request-ID': response.metadata.requestId,
        'X-AI-Model': 'gemini-pro',
        'X-Real-Data': 'true'
      }
    })
    
  } catch (error) {
    monitor.error(error as Error)
    
    // Fallback to basic itinerary if AI fails
    try {
      monitor.log('AI generation failed, using fallback')
      
      const fallbackResponse = await fetch(`${request.nextUrl.origin}/api/itinerary/fallback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(await request.json())
      })
      
      return fallbackResponse
      
    } catch (fallbackError) {
      return NextResponse.json({
        error: 'Both AI and fallback generation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }
  }
}