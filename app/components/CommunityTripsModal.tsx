'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  X, MapPin, Calendar, DollarSign, Heart, Eye, Share2, 
  Bookmark, Star, Filter, Search, Sparkles 
} from 'lucide-react'

interface CommunityTrip {
  id: string
  title: string
  description: string
  author: string
  city: string
  days: number
  budget: string
  tags: string[]
  likes: number
  views: number
  createdAt: string
  featured: boolean
  difficulty: string
  season: string
  highlights: string[]
  thumbnail: string
}

interface CommunityTripsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function CommunityTripsModal({ isOpen, onClose }: CommunityTripsModalProps) {
  const [trips, setTrips] = useState<CommunityTrip[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState({
    featured: false,
    city: '',
    tag: '',
    sort: 'popular'
  })
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (isOpen) {
      fetchCommunityTrips()
    }
  }, [isOpen, filter])

  const fetchCommunityTrips = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter.featured) params.append('featured', 'true')
      if (filter.city) params.append('city', filter.city)
      if (filter.tag) params.append('tag', filter.tag)
      params.append('sort', filter.sort)
      params.append('limit', '20')

      const response = await fetch(`/api/community/trips?${params}`)
      const data = await response.json()
      
      if (response.ok) {
        setTrips(data.trips || [])
      } else {
        console.error('Failed to fetch community trips:', data.error)
      }
    } catch (error) {
      console.error('Error fetching community trips:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLikeTrip = async (tripId: string) => {
    try {
      const response = await fetch(`/api/community/trips/${tripId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'like',
          userId: 'anonymous' // In a real app, this would be the actual user ID
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setTrips(prev => prev.map(trip => 
          trip.id === tripId 
            ? { ...trip, likes: data.newLikes }
            : trip
        ))
      }
    } catch (error) {
      console.error('Error liking trip:', error)
    }
  }

  const handleShareTrip = async (trip: CommunityTrip) => {
    try {
      const response = await fetch(`/api/community/trips/${trip.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'share',
          userId: 'anonymous'
        }),
      })

      if (response.ok) {
        const data = await response.json()
        // Copy share URL to clipboard
        if (navigator.clipboard && data.shareUrl) {
          await navigator.clipboard.writeText(data.shareUrl)
          alert('Share link copied to clipboard!')
        }
      }
    } catch (error) {
      console.error('Error sharing trip:', error)
    }
  }

  const filteredTrips = trips.filter(trip => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return trip.title.toLowerCase().includes(query) ||
             trip.description.toLowerCase().includes(query) ||
             trip.city.toLowerCase().includes(query) ||
             trip.tags.some(tag => tag.toLowerCase().includes(query))
    }
    return true
  })

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-green rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="heading-md">Community Trips</h2>
                  <p className="text-small text-gray-600">Discover amazing itineraries from fellow travelers</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-gray-600" />
              </button>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search trips, cities, or tags..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="form-input pl-10"
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <select
                  value={filter.sort}
                  onChange={(e) => setFilter(prev => ({ ...prev, sort: e.target.value }))}
                  className="form-select min-w-32"
                >
                  <option value="popular">Popular</option>
                  <option value="recent">Recent</option>
                  <option value="likes">Most Liked</option>
                </select>
                
                <button
                  onClick={() => setFilter(prev => ({ ...prev, featured: !prev.featured }))}
                  className={`px-4 py-2 rounded-xl font-medium transition-all ${
                    filter.featured
                      ? 'bg-green-100 text-green-700 border border-green-200'
                      : 'bg-gray-100 text-gray-700 border border-gray-200'
                  }`}
                >
                  <Star className="w-4 h-4 inline mr-1" />
                  Featured
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="loading-spinner"></div>
                <span className="ml-3 text-gray-600">Loading community trips...</span>
              </div>
            ) : filteredTrips.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MapPin className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="heading-sm mb-2">No trips found</h3>
                <p className="text-body text-gray-600">
                  {searchQuery ? 'Try adjusting your search terms' : 'Be the first to share your amazing trip!'}
                </p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTrips.map((trip) => (
                  <motion.div
                    key={trip.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="card group hover:shadow-lg transition-all duration-300"
                  >
                    {/* Trip Image */}
                    <div className="relative h-48 -m-6 mb-4 rounded-t-2xl overflow-hidden">
                      <img
                        src={trip.thumbnail}
                        alt={trip.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      
                      {/* Featured Badge */}
                      {trip.featured && (
                        <div className="absolute top-3 left-3 bg-yellow-400 text-yellow-900 px-2 py-1 rounded-full text-xs font-medium flex items-center">
                          <Star className="w-3 h-3 mr-1" />
                          Featured
                        </div>
                      )}
                      
                      {/* Difficulty Badge */}
                      <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm text-gray-800 px-2 py-1 rounded-full text-xs font-medium">
                        {trip.difficulty}
                      </div>
                      
                      {/* City and Days */}
                      <div className="absolute bottom-3 left-3 text-white">
                        <h3 className="font-bold text-lg mb-1">{trip.city}</h3>
                        <div className="flex items-center space-x-3 text-sm opacity-90">
                          <span className="flex items-center">
                            <Calendar className="w-3 h-3 mr-1" />
                            {trip.days} days
                          </span>
                          <span className="flex items-center">
                            <DollarSign className="w-3 h-3 mr-1" />
                            {trip.budget}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Trip Info */}
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-1 line-clamp-2">{trip.title}</h4>
                        <p className="text-small text-gray-600 line-clamp-2">{trip.description}</p>
                      </div>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1">
                        {trip.tags.slice(0, 3).map((tag, index) => (
                          <span
                            key={index}
                            className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                        {trip.tags.length > 3 && (
                          <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">
                            +{trip.tags.length - 3}
                          </span>
                        )}
                      </div>

                      {/* Highlights */}
                      {trip.highlights.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-gray-700 mb-1">Highlights:</h5>
                          <ul className="text-xs text-gray-600 space-y-1">
                            {trip.highlights.slice(0, 2).map((highlight, index) => (
                              <li key={index} className="flex items-center">
                                <div className="w-1 h-1 bg-green-500 rounded-full mr-2 flex-shrink-0"></div>
                                <span className="line-clamp-1">{highlight}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="pt-3 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-gray-500">
                            by <span className="font-medium">{trip.author}</span>
                          </div>
                          
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-1 text-xs text-gray-500">
                              <Eye className="w-3 h-3" />
                              <span>{trip.views}</span>
                            </div>
                            
                            <button
                              onClick={() => handleLikeTrip(trip.id)}
                              className="flex items-center space-x-1 text-xs text-red-500 hover:text-red-600 transition-colors"
                            >
                              <Heart className="w-3 h-3" />
                              <span>{trip.likes}</span>
                            </button>
                            
                            <button
                              onClick={() => handleShareTrip(trip)}
                              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              <Share2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
            <div className="text-center">
              <p className="text-small text-gray-600 mb-2">
                Love traveling? Share your own amazing itinerary with the community!
              </p>
              <button className="btn-outline">
                Share Your Trip
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
