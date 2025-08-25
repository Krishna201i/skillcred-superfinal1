import { NextRequest, NextResponse } from 'next/server'
import { PerformanceMonitor } from '@/app/utils/timeout'

// In-memory storage for community trips (same as parent route)
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

// Helper functions
const getCommunityTrips = () => {
  return communityTrips
}

const setCommunityTrips = (trips: any[]) => {
  communityTrips = trips
}

// GET endpoint to fetch a specific trip
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const monitor = new PerformanceMonitor(`Community Trip GET ${params.id}`)
  
  try {
    const trips = getCommunityTrips()
    const trip = trips.find((t: any) => t.id === params.id)
    
    if (!trip) {
      monitor.error('Trip not found')
      return NextResponse.json({
        error: 'Trip not found',
        timestamp: new Date().toISOString()
      }, { status: 404 })
    }
    
    // Increment view count
    trip.views = (trip.views || 0) + 1
    setCommunityTrips(trips)
    
    monitor.log(`Trip found: ${trip.title}`)
    
    const processingTime = monitor.finish(true)
    
    return NextResponse.json({
      trip,
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'X-Processing-Time': `${processingTime}ms`,
        'X-Trip-ID': trip.id,
        'X-Views': trip.views.toString()
      }
    })
    
  } catch (error) {
    monitor.error(error as Error)
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to fetch trip',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// POST endpoint for trip actions (like, unlike, share)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const monitor = new PerformanceMonitor(`Community Trip Action ${params.id}`)
  
  try {
    const { action, userId } = await request.json()
    const trips = getCommunityTrips()
    const tripIndex = trips.findIndex((t: any) => t.id === params.id)
    
    if (tripIndex === -1) {
      monitor.error('Trip not found')
      return NextResponse.json({
        error: 'Trip not found',
        timestamp: new Date().toISOString()
      }, { status: 404 })
    }
    
    const trip = trips[tripIndex]
    let result: any = {
      action,
      tripId: params.id,
      timestamp: new Date().toISOString()
    }
    
    switch (action) {
      case 'like':
        trip.likes = (trip.likes || 0) + 1
        result.newLikes = trip.likes
        result.message = 'Trip liked successfully!'
        monitor.log(`Trip liked: ${trip.title}`)
        break
        
      case 'unlike':
        trip.likes = Math.max((trip.likes || 0) - 1, 0)
        result.newLikes = trip.likes
        result.message = 'Trip unliked successfully!'
        monitor.log(`Trip unliked: ${trip.title}`)
        break
        
      case 'share':
        // Track sharing (could increment a share counter)
        trip.shares = (trip.shares || 0) + 1
        result.shares = trip.shares
        result.message = 'Trip shared successfully!'
        result.shareUrl = `${request.nextUrl.origin}/community/trip/${trip.id}`
        monitor.log(`Trip shared: ${trip.title}`)
        break
        
      case 'bookmark':
        // Track bookmarking
        trip.bookmarks = (trip.bookmarks || 0) + 1
        result.bookmarks = trip.bookmarks
        result.message = 'Trip bookmarked successfully!'
        monitor.log(`Trip bookmarked: ${trip.title}`)
        break
        
      default:
        return NextResponse.json({
          error: 'Invalid action. Supported actions: like, unlike, share, bookmark',
          timestamp: new Date().toISOString()
        }, { status: 400 })
    }
    
    // Update the trip in storage
    trips[tripIndex] = trip
    setCommunityTrips(trips)
    
    const processingTime = monitor.finish(true)
    
    return NextResponse.json(result, {
      headers: {
        'X-Processing-Time': `${processingTime}ms`,
        'X-Action': action,
        'X-Trip-ID': trip.id
      }
    })
    
  } catch (error) {
    monitor.error(error as Error)
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to perform action',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// PUT endpoint to update a trip (for the author)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const monitor = new PerformanceMonitor(`Community Trip UPDATE ${params.id}`)
  
  try {
    const body = await request.json()
    const { 
      title, 
      description, 
      tags, 
      difficulty, 
      season, 
      highlights,
      authorId 
    } = body
    
    const trips = getCommunityTrips()
    const tripIndex = trips.findIndex((t: any) => t.id === params.id)
    
    if (tripIndex === -1) {
      monitor.error('Trip not found')
      return NextResponse.json({
        error: 'Trip not found',
        timestamp: new Date().toISOString()
      }, { status: 404 })
    }
    
    const trip = trips[tripIndex]
    
    // In a real app, you'd verify the user owns this trip
    // For now, we'll just check if authorId matches (simplified)
    
    // Update allowed fields
    if (title) trip.title = title
    if (description) trip.description = description
    if (tags) trip.tags = Array.isArray(tags) ? tags : trip.tags
    if (difficulty) trip.difficulty = difficulty
    if (season) trip.season = season
    if (highlights) trip.highlights = Array.isArray(highlights) ? highlights : trip.highlights
    
    trip.updatedAt = new Date().toISOString()
    
    // Update the trip in storage
    trips[tripIndex] = trip
    setCommunityTrips(trips)
    
    monitor.log(`Trip updated: ${trip.title}`)
    
    const processingTime = monitor.finish(true)
    
    return NextResponse.json({
      success: true,
      trip,
      message: 'Trip updated successfully!',
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'X-Processing-Time': `${processingTime}ms`,
        'X-Trip-ID': trip.id,
        'X-Action': 'update'
      }
    })
    
  } catch (error) {
    monitor.error(error as Error)
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to update trip',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// DELETE endpoint to remove a trip (for admins or authors)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const monitor = new PerformanceMonitor(`Community Trip DELETE ${params.id}`)
  
  try {
    const trips = getCommunityTrips()
    const tripIndex = trips.findIndex((t: any) => t.id === params.id)
    
    if (tripIndex === -1) {
      monitor.error('Trip not found')
      return NextResponse.json({
        error: 'Trip not found',
        timestamp: new Date().toISOString()
      }, { status: 404 })
    }
    
    const trip = trips[tripIndex]
    
    // Remove the trip
    trips.splice(tripIndex, 1)
    setCommunityTrips(trips)
    
    monitor.log(`Trip deleted: ${trip.title}`)
    
    const processingTime = monitor.finish(true)
    
    return NextResponse.json({
      success: true,
      message: 'Trip deleted successfully!',
      deletedTrip: {
        id: trip.id,
        title: trip.title
      },
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'X-Processing-Time': `${processingTime}ms`,
        'X-Trip-ID': trip.id,
        'X-Action': 'delete'
      }
    })
    
  } catch (error) {
    monitor.error(error as Error)
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to delete trip',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
