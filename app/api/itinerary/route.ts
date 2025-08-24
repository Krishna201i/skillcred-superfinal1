import { NextRequest, NextResponse } from 'next/server'
import { fetchDiverseLocationImages } from '@/app/utils/pexels'

export async function POST(request: NextRequest) {
  try {
    const { city, budget, days, interests } = await request.json()

    // Validate input
    if (!city || !budget || !days) {
      return NextResponse.json(
        { error: 'Missing required fields: city, budget, days' },
        { status: 400 }
      )
    }

    const apiKey = process.env.PERPLEXITY_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Perplexity API key not configured' },
        { status: 500 }
      )
    }

    // Construct the prompt for Perplexity
    const interestsText = interests && interests.length > 0 
      ? ` with interests in: ${interests.join(', ')}`
      : ''
    
    const prompt = `Generate a detailed ${days}-day travel itinerary for ${city} with a budget of ₹${budget}${interestsText}. 

Return ONLY a valid JSON object with this exact structure (no additional text, no markdown):

{
  "days": [
    {
      "day": 1,
      "date": "2024-01-15",
      "summary": "Brief description of the day",
      "morning": [
        {
          "time": "9:00 AM",
          "activity": "Activity description",
          "location": {
            "name": "Real place name (Google Maps searchable)",
            "address": "Full address"
          },
          "description": "Detailed description"
        }
      ],
      "afternoon": [
        {
          "time": "2:00 PM",
          "activity": "Activity description",
          "location": {
            "name": "Real place name (Google Maps searchable)",
            "address": "Full address"
          },
          "description": "Detailed description"
        }
      ],
      "evening": [
        {
          "time": "7:00 PM",
          "activity": "Activity description",
          "location": {
            "name": "Real place name (Google Maps searchable)",
            "address": "Full address"
          },
          "description": "Detailed description"
        }
      ],
      "dining": [
        {
          "meal": "Breakfast",
          "restaurant": "Restaurant name",
          "cuisine": "Cuisine type",
          "location": {
            "name": "Restaurant name",
            "address": "Full address"
          },
          "price": "₹500-800",
          "speciality": "Famous dish or specialty",
          "rating": "4.5/5",
          "ambiance": "Cozy, romantic, family-friendly, etc."
        },
        {
          "meal": "Lunch",
          "restaurant": "Restaurant name",
          "cuisine": "Cuisine type",
          "location": {
            "name": "Restaurant name",
            "address": "Full address"
          },
          "price": "₹800-1200",
          "speciality": "Famous dish or specialty",
          "rating": "4.5/5",
          "ambiance": "Cozy, romantic, family-friendly, etc."
        },
        {
          "meal": "Dinner",
          "restaurant": "Restaurant name",
          "cuisine": "Cuisine type",
          "location": {
            "name": "Restaurant name",
            "address": "Full address"
          },
          "price": "₹1000-1500",
          "speciality": "Famous dish or specialty",
          "rating": "4.5/5",
          "ambiance": "Cozy, romantic, family-friendly, etc."
        }
      ]
    }
  ],
  "summary": {
    "totalCost": "₹45000",
    "highlights": ["Highlight 1", "Highlight 2", "Highlight 3"],
    "tips": ["Tip 1", "Tip 2", "Tip 3"],
    "bestTime": "Best time to visit description"
  }
}

IMPORTANT REQUIREMENTS:
- ALWAYS include Breakfast, Lunch, and Dinner for each day
- Use real, Google Maps searchable place names
- Include specific addresses for all locations
- Provide realistic costs in INR
- Make activities diverse and interesting
- For dining: include speciality dishes, ratings, and ambiance descriptions
- Ensure the JSON is valid and complete
- Each day MUST have exactly 3 meals: Breakfast, Lunch, Dinner`

    // Call Perplexity API
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a travel planner assistant. You MUST return ONLY valid JSON without any markdown formatting, explanations, or additional text. The response must be parseable by JSON.parse(). Never use trailing commas. Never include text before or after the JSON object.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 4000,
        temperature: 0.3, // Lower temperature for more consistent JSON
        top_p: 0.9
      })
    })

    if (!response.ok) {
      const errorData = await response.text()
      console.error('Perplexity API error:', errorData)
      return NextResponse.json(
        { error: 'Failed to generate itinerary from Perplexity API' },
        { status: 500 }
      )
    }

    const data = await response.json()
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return NextResponse.json(
        { error: 'Invalid response from Perplexity API' },
        { status: 500 }
      )
    }

    const content = data.choices[0].message.content
    
    // Try to extract and clean JSON from the response
    let jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('No JSON found in Perplexity response:', content)
      return NextResponse.json(
        { error: 'No valid JSON found in Perplexity response' },
        { status: 500 }
      )
    }

    let itinerary
    let parseAttempts = 0
    const maxAttempts = 3
    
    while (parseAttempts < maxAttempts) {
      try {
        // Clean the JSON string
        let jsonString = jsonMatch[0]
        
        // Remove any trailing commas before closing braces/brackets
        jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1')
        
        // Remove any trailing commas in arrays/objects
        jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1')
        
        // Try to fix common JSON issues
        jsonString = jsonString.replace(/,\s*}/g, '}')
        jsonString = jsonString.replace(/,\s*]/g, ']')
        
        itinerary = JSON.parse(jsonString)
        break // Successfully parsed
      } catch (parseError) {
        parseAttempts++
        console.error(`JSON parse attempt ${parseAttempts} failed:`, parseError)
        
        if (parseAttempts >= maxAttempts) {
          console.error('Final JSON string that failed to parse:', jsonMatch[0])
          return NextResponse.json(
            { error: 'Invalid JSON response from Perplexity API after cleanup attempts' },
            { status: 500 }
          )
        }
        
        // Try to find a better JSON match
        const betterMatch = content.match(/\{[\s\S]*?\}/g)
        if (betterMatch && betterMatch.length > parseAttempts) {
          jsonMatch = [betterMatch[parseAttempts]]
        }
      }
    }

    // Validate the parsed itinerary structure
    if (!itinerary || !itinerary.days || !Array.isArray(itinerary.days)) {
      console.error('Invalid itinerary structure:', itinerary)
      
      // Generate a fallback itinerary
      console.log('Generating fallback itinerary...')
      itinerary = generateFallbackItinerary(city, days, budget)
    }

    // Extract all location names for image search
    const locationNames: string[] = []
    
    itinerary.days.forEach((day: any) => {
      // Add city name for general city images
      if (!locationNames.includes(city)) {
        locationNames.push(city)
      }
      
      // Add activity locations
      day.morning?.forEach((activity: any) => {
        if (activity.location?.name && !locationNames.includes(activity.location.name)) {
          locationNames.push(activity.location.name)
        }
      })
      
      day.afternoon?.forEach((activity: any) => {
        if (activity.location?.name && !locationNames.includes(activity.location.name)) {
          locationNames.push(activity.location.name)
        }
      })
      
      day.evening?.forEach((activity: any) => {
        if (activity.location?.name && !locationNames.includes(activity.location.name)) {
          locationNames.push(activity.location.name)
        }
      })
      
      // Add dining locations
      day.dining?.forEach((meal: any) => {
        if (meal.location?.name && !locationNames.includes(meal.location.name)) {
          locationNames.push(meal.location.name)
        }
      })
    })

    // Fetch diverse images for locations using enhanced function
    const locationImages = await fetchDiverseLocationImages(locationNames)

    // Add images to the itinerary
    const itineraryWithImages = {
      ...itinerary,
      locationImages,
      generatedAt: new Date().toISOString()
    }

    return NextResponse.json(itineraryWithImages)

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Fallback itinerary generator
function generateFallbackItinerary(city: string, days: number, budget: string) {
  const itinerary = {
    days: [] as any[],
    summary: {
      totalCost: `₹${budget}`,
      highlights: [`Explore ${city}`, `Experience local culture`, `Enjoy local cuisine`],
      tips: [`Plan ahead`, `Book accommodations early`, `Try local food`],
      bestTime: `Year-round destination with pleasant weather`
    }
  }

  for (let day = 1; day <= days; day++) {
    const currentDate = new Date()
    currentDate.setDate(currentDate.getDate() + day - 1)
    
    itinerary.days.push({
      day,
      date: currentDate.toISOString().split('T')[0],
      summary: `Day ${day} exploring ${city}`,
      morning: [
        {
          time: '9:00 AM',
          activity: `Start your day exploring ${city}`,
          location: {
            name: `${city} City Center`,
            address: `${city}, India`
          },
          description: `Begin your adventure in the heart of ${city}`
        }
      ],
      afternoon: [
        {
          time: '2:00 PM',
          activity: `Visit local attractions in ${city}`,
          location: {
            name: `${city} Tourist Spot`,
            address: `${city}, India`
          },
          description: `Discover the main attractions of ${city}`
        }
      ],
      evening: [
        {
          time: '7:00 PM',
          activity: `Evening stroll in ${city}`,
          location: {
            name: `${city} Evening Area`,
            address: `${city}, India`
          },
          description: `Enjoy the evening atmosphere of ${city}`
        }
      ],
      dining: [
        {
          meal: 'Breakfast',
          restaurant: `${city} Breakfast Place`,
          cuisine: 'Local Cuisine',
          location: {
            name: `${city} Breakfast Place`,
            address: `${city}, India`
          },
          price: '₹200-400',
          speciality: 'Local breakfast items',
          rating: '4.0/5',
          ambiance: 'Cozy and welcoming'
        },
        {
          meal: 'Lunch',
          restaurant: `${city} Lunch Restaurant`,
          cuisine: 'Local Cuisine',
          location: {
            name: `${city} Lunch Restaurant`,
            address: `${city}, India`
          },
          price: '₹400-800',
          speciality: 'Traditional local dishes',
          rating: '4.2/5',
          ambiance: 'Family-friendly'
        },
        {
          meal: 'Dinner',
          restaurant: `${city} Dinner Place`,
          cuisine: 'Local Cuisine',
          location: {
            name: `${city} Dinner Place`,
            address: `${city}, India`
          },
          price: '₹600-1200',
          speciality: 'Evening specialties',
          rating: '4.1/5',
          ambiance: 'Romantic and cozy'
        }
      ]
    })
  }

  return itinerary
}
