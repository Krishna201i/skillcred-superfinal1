import { NextRequest, NextResponse } from 'next/server'
import { PerformanceMonitor } from '@/app/utils/timeout'

// In-memory storage for community trips (in a real app, this would be a database)
let communityTrips: any[] = [
  {
    id: '1',
    title: 'Amazing 5-Day Tokyo Adventure',
    description: 'Perfect mix of traditional and modern Tokyo with amazing food experiences',
    author: 'TravelExpert2024',
    city: 'Tokyo',
    days: 5,
    budget: '₹150000',
    tags: ['Culture', 'Food', 'Adventure'],
    likes: 45,
    views: 234,
    createdAt: '2024-01-15T10:00:00Z',
    featured: true,
    difficulty: 'Moderate',
    season: 'Spring',
    highlights: ['Cherry Blossoms', 'Sushi Experience', 'Temple Visits'],
    thumbnail: 'https://images.pexels.com/photos/2070033/pexels-photo-2070033.jpeg?auto=compress&cs=tinysrgb&w=400'
  },
  {
    id: '2',
    title: 'Mumbai Street Food Paradise',
    description: 'Ultimate guide to Mumbai\'s incredible street food scene and local markets',
    author: 'FoodieMumbai',
    city: 'Mumbai',
    days: 3,
    budget: '₹25000',
    tags: ['Food', 'Culture', 'Local Experience'],
    likes: 67,
    views: 189,
    createdAt: '2024-01-10T14:30:00Z',
    featured: true,
    difficulty: 'Easy',
    season: 'Winter',
    highlights: ['Vada Pav Tour', 'Chowpatty Beach', 'Crawford Market'],
    thumbnail: 'https://images.pexels.com/photos/789750/pexels-photo-789750.jpeg?auto=compress&cs=tinysrgb&w=400'
  },
  {
    id: '3',
    title: 'Delhi Heritage Walk',
    description: 'Explore Old and New Delhi\'s rich history and architectural marvels',
    author: 'HistoryBuff',
    city: 'Delhi',
    days: 4,
    budget: '₹40000',
    tags: ['History', 'Architecture', 'Culture'],
    likes: 33,
    views: 156,
    createdAt: '2024-01-08T09:15:00Z',
    featured: false,
    difficulty: 'Moderate',
    season: 'Winter',
    highlights: ['Red Fort', 'India Gate', 'Humayun\'s Tomb'],
    thumbnail: 'https://images.pexels.com/photos/1542620/pexels-photo-1542620.jpeg?auto=compress&cs=tinysrgb&w=400'
  }
]

// GET endpoint to fetch community trips
export async function GET(request: NextRequest) {
  const monitor = new PerformanceMonitor('Community Trips GET')
  
  try {
    const url = new URL(request.url)
    const featured = url.searchParams.get('featured') === 'true'
    const city = url.searchParams.get('city')
    const tag = url.searchParams.get('tag')
    const sort = url.searchParams.get('sort') || 'popular' // popular, recent, likes
    const limit = parseInt(url.searchParams.get('limit') || '10')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    
    monitor.log(`Fetching community trips: featured=${featured}, city=${city}, tag=${tag}`)
    
    let filteredTrips = [...communityTrips]
    
    // Apply filters
    if (featured) {
      filteredTrips = filteredTrips.filter(trip => trip.featured)
    }
    
    if (city) {
      filteredTrips = filteredTrips.filter(trip => 
        trip.city.toLowerCase().includes(city.toLowerCase())
      )
    }
    
    if (tag) {
      filteredTrips = filteredTrips.filter(trip => 
        trip.tags.some((t: string) => t.toLowerCase().includes(tag.toLowerCase()))
      )
    }
    
    // Apply sorting
    switch (sort) {
      case 'recent':
        filteredTrips.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        break
      case 'likes':
        filteredTrips.sort((a, b) => b.likes - a.likes)
        break
      case 'popular':
      default:
        filteredTrips.sort((a, b) => (b.likes + b.views) - (a.likes + a.views))
        break
    }
    
    // Apply pagination
    const total = filteredTrips.length
    const paginatedTrips = filteredTrips.slice(offset, offset + limit)
    
    const response = {
      trips: paginatedTrips,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      },
      filters: {
        featured,
        city,
        tag,
        sort
      },
      stats: {
        totalTrips: communityTrips.length,
        featuredTrips: communityTrips.filter(t => t.featured).length,
        cities: Array.from(new Set(communityTrips.map(t => t.city))),
        popularTags: getPopularTags()
      }
    }
    
    const processingTime = monitor.finish(true)
    
    return NextResponse.json(response, {
      headers: {
        'X-Processing-Time': `${processingTime}ms`,
        'X-Total-Trips': total.toString(),
        'X-Filtered-Results': paginatedTrips.length.toString()
      }
    })
    
  } catch (error) {
    monitor.error(error as Error)
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to fetch community trips',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// POST endpoint to add a new community trip
export async function POST(request: NextRequest) {
  const monitor = new PerformanceMonitor('Community Trip POST')
  
  try {
    const body = await request.json()
    const { 
      title, 
      description, 
      author, 
      city, 
      days, 
      budget, 
      tags, 
      difficulty = 'Moderate',
      season = 'All Year',
      highlights = [],
      itinerary 
    } = body
    
    monitor.log(`Creating new community trip: ${title} by ${author}`)
    
    // Validate required fields
    if (!title || !description || !author || !city || !days || !budget) {
      return NextResponse.json({
        error: 'Missing required fields: title, description, author, city, days, budget',
        timestamp: new Date().toISOString()
      }, { status: 400 })
    }
    
    // Create new trip
    const newTrip = {
      id: crypto.randomUUID(),
      title,
      description,
      author,
      city,
      days: parseInt(days.toString()),
      budget,
      tags: Array.isArray(tags) ? tags : [],
      likes: 0,
      views: 0,
      createdAt: new Date().toISOString(),
      featured: false, // New trips are not featured by default
      difficulty,
      season,
      highlights: Array.isArray(highlights) ? highlights : [],
      thumbnail: `https://images.pexels.com/photos/2070033/pexels-photo-2070033.jpeg?auto=compress&cs=tinysrgb&w=400`, // Default thumbnail
      itinerary: itinerary || null // Store full itinerary if provided
    }
    
    // Add to community trips
    communityTrips.unshift(newTrip) // Add to beginning
    
    // Keep only the latest 100 trips to prevent memory issues
    if (communityTrips.length > 100) {
      communityTrips = communityTrips.slice(0, 100)
    }
    
    const processingTime = monitor.finish(true)
    
    return NextResponse.json({
      success: true,
      trip: newTrip,
      message: 'Trip added to community successfully!',
      timestamp: new Date().toISOString()
    }, {
      status: 201,
      headers: {
        'X-Processing-Time': `${processingTime}ms`,
        'X-Trip-ID': newTrip.id
      }
    })
    
  } catch (error) {
    monitor.error(error as Error)
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to create community trip',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// Helper function to get popular tags
function getPopularTags() {
  const tagCounts: { [key: string]: number } = {}
  
  communityTrips.forEach(trip => {
    trip.tags.forEach((tag: string) => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1
    })
  })
  
  return Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }))
}
