import { NextRequest, NextResponse } from 'next/server'
import { PerformanceMonitor } from '@/app/utils/timeout'

// Clean fallback route that always returns a basic itinerary
export async function POST(request: NextRequest) {
  const monitor = new PerformanceMonitor('Fallback Itinerary Generation')
  
  try {
    const { city, budget, days, interests } = await request.json()
    
    monitor.log(`Generating fallback itinerary for ${city}`)
    
    // Validate basic input
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

    // Generate a basic but complete itinerary
    const currentDate = new Date()
    const itinerary = {
      days: [] as any[],
      summary: {
        totalCost: budget.toString(),
        costBreakdown: {
          accommodation: Math.round(parseFloat(budget.replace(/[^\d]/g, '')) * 0.4).toString(),
          food: Math.round(parseFloat(budget.replace(/[^\d]/g, '')) * 0.25).toString(),
          activities: Math.round(parseFloat(budget.replace(/[^\d]/g, '')) * 0.25).toString(),
          transportation: Math.round(parseFloat(budget.replace(/[^\d]/g, '')) * 0.1).toString()
        },
        highlights: [
          `Explore the vibrant culture of ${city}`,
          `Experience authentic local cuisine`,
          `Visit iconic landmarks and attractions`,
          `Discover hidden gems and local favorites`
        ],
        tips: [
          `Best time to visit ${city} varies by season`,
          `Try local transportation for authentic experience`,
          `Book popular attractions in advance`,
          `Keep some cash for local vendors and street food`
        ],
        culturalTips: [
          `Respect local customs and traditions in ${city}`,
          `Learn a few basic phrases in the local language`,
          `Dress appropriately for religious sites`,
          `Be open to trying new experiences and foods`
        ],
        bestTime: `Year-round destination with seasonal variations`,
        weatherOverview: `Check current weather conditions for ${city} before your trip`,
        budgetingTips: [
          `Book accommodations early for better rates`,
          `Eat at local restaurants for authentic and affordable meals`,
          `Use public transportation when possible`,
          `Look for free walking tours and activities`
        ]
      },
      locationImages: {
        [city]: {
          id: 0,
          url: 'https://images.pexels.com/photos/2070033/pexels-photo-2070033.jpeg',
          photographer: 'Fallback Image',
          src: {
            medium: 'https://images.pexels.com/photos/2070033/pexels-photo-2070033.jpeg?auto=compress&cs=tinysrgb&w=800',
            large: 'https://images.pexels.com/photos/2070033/pexels-photo-2070033.jpeg?auto=compress&cs=tinysrgb&w=1200',
            original: 'https://images.pexels.com/photos/2070033/pexels-photo-2070033.jpeg'
          }
        }
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        requestId: crypto.randomUUID(),
        processingTime: 0,
        aiModel: 'fallback-generator',
        imageCount: 1,
        cityConfig: 'fallback',
        version: '2.0.0-fallback'
      }
    }

    // Generate days
    for (let day = 1; day <= parseInt(days.toString()); day++) {
      const dayDate = new Date(currentDate)
      dayDate.setDate(currentDate.getDate() + day - 1)
      
      const dayItinerary = {
        day,
        date: dayDate.toISOString().split('T')[0],
        summary: `Day ${day}: Discover the essence of ${city}`,
        weather: "Pleasant weather expected - check local forecasts",
        morning: [
          {
            time: '9:00 AM',
            activity: `Morning exploration of ${city}`,
            location: {
              name: `${city} City Center`,
              address: `Central District, ${city}`,
              coordinates: [0, 0]
            },
            description: `Start your day with a leisurely walk through the heart of ${city}, taking in the morning atmosphere and local life`,
            estimatedCost: '₹200-500',
            duration: '2-3 hours'
          }
        ],
        afternoon: [
          {
            time: '2:00 PM',
            activity: `Cultural attractions in ${city}`,
            location: {
              name: `${city} Cultural District`,
              address: `Cultural Area, ${city}`,
              coordinates: [0, 0]
            },
            description: `Explore the rich cultural heritage of ${city} through its museums, galleries, or historical sites`,
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
              address: `Entertainment Quarter, ${city}`,
              coordinates: [0, 0]
            },
            description: `Experience the vibrant evening scene of ${city} with shopping, entertainment, or nightlife`,
            estimatedCost: '₹400-1000',
            duration: '2-3 hours'
          }
        ],
        dining: [
          {
            meal: 'Breakfast',
            restaurant: `Local ${city} Cafe`,
            cuisine: 'Traditional & Continental',
            location: {
              name: `Morning Delights Cafe`,
              address: `Breakfast Street, ${city}`,
              coordinates: [0, 0]
            },
            price: '₹200-400',
            speciality: 'Fresh local breakfast items and coffee',
            rating: '4.0/5',
            ambiance: 'Cozy and welcoming morning atmosphere',
            culturalNote: `Experience the local breakfast culture of ${city}`
          },
          {
            meal: 'Lunch',
            restaurant: `Traditional ${city} Restaurant`,
            cuisine: 'Regional Specialties',
            location: {
              name: `Heritage Lunch House`,
              address: `Traditional Quarter, ${city}`,
              coordinates: [0, 0]
            },
            price: '₹400-800',
            speciality: 'Authentic regional dishes and local favorites',
            rating: '4.2/5',
            ambiance: 'Traditional and family-friendly',
            culturalNote: `Taste the authentic flavors that define ${city}`
          },
          {
            meal: 'Dinner',
            restaurant: `Premium ${city} Dining`,
            cuisine: 'Fine Dining & Local Fusion',
            location: {
              name: `Evening Elegance Restaurant`,
              address: `Fine Dining District, ${city}`,
              coordinates: [0, 0]
            },
            price: '₹800-1500',
            speciality: 'Elevated local cuisine with modern presentation',
            rating: '4.3/5',
            ambiance: 'Elegant and sophisticated evening setting',
            culturalNote: `Experience upscale dining that celebrates ${city}'s culinary heritage`
          }
        ]
      }
      
      itinerary.days.push(dayItinerary)
    }

    // Update processing time
    const processingTime = monitor.finish(true)
    itinerary.metadata.processingTime = processingTime

    monitor.log(`Fallback itinerary generated successfully`)

    return NextResponse.json(itinerary, {
      headers: {
        'X-Processing-Time': `${processingTime}ms`,
        'X-Request-ID': itinerary.metadata.requestId,
        'X-Fallback-Mode': 'true',
        'X-City': city
      }
    })

  } catch (error) {
    monitor.error(error as Error)
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Fallback generation failed',
      timestamp: new Date().toISOString(),
      requestId: crypto.randomUUID(),
      fallbackMode: true
    }, { status: 500 })
  }
}
