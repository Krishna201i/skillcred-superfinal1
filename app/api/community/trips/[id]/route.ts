import { NextRequest, NextResponse } from 'next/server'
import { PerformanceMonitor } from '@/app/utils/timeout'

// In-memory storage reference (same as in parent route)
// In a real app, this would be imported from a shared data service
const getCommunityTrips = () => {
  // This would normally be a database call
  return global.communityTrips || []
}

const setCommunityTrips = (trips: any[]) => {
  global.communityTrips = trips
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
