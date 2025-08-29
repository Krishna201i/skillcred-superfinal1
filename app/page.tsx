'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Calendar, DollarSign, Plane, Download, Save, 
  ArrowRight, ArrowLeft, Sparkles, Globe, Users, Star, 
  Check, X, RefreshCw, AlertCircle, Wifi, WifiOff
} from 'lucide-react'
import CommunityTripsModal from './components/CommunityTripsModal'

// Types
interface ItineraryRequest {
  city: string
  budget: string
  days: number
  interests: string[]
}

interface Location {
  name: string
  address: string
  coordinates?: [number, number]
}

interface Activity {
  time: string
  activity: string
  location: Location
  description: string
  estimatedCost?: string
  duration?: string
}

interface Dining {
  meal: string
  restaurant: string
  cuisine: string
  location: Location
  price: string
  speciality?: string
  rating?: string
  ambiance?: string
  culturalNote?: string
}

interface DayItinerary {
  day: number
  date: string
  summary: string
  weather?: string
  morning: Activity[]
  afternoon: Activity[]
  evening: Activity[]
  dining: Dining[]
}

interface TripSummary {
  totalCost: string
  costBreakdown?: {
    accommodation: string
    food: string
    activities: string
    transportation: string
  }
  highlights: string[]
  tips: string[]
  culturalTips?: string[]
  bestTime: string
  weatherOverview?: string
  budgetingTips?: string[]
}

interface PexelsImage {
  id: number
  url: string
  photographer: string
  src: {
    medium: string
    large: string
    original: string
  }
}

interface ItineraryResponse {
  days: DayItinerary[]
  summary: TripSummary
  locationImages: { [key: string]: PexelsImage }
  metadata?: {
    generatedAt: string
    requestId: string
    processingTime: number
    aiModel: string
    imageCount: number
    cityConfig: string
    version: string
    realDataSources?: {
      locations: string
      weather: string
      images: string
      ai: string
    }
  }
}

// Enhanced travel interests
const travelInterests = [
  'Culture & Heritage', 'Food & Dining', 'Adventure Sports', 'History & Museums', 
  'Nature & Wildlife', 'Shopping', 'Art & Galleries', 'Music & Entertainment', 
  'Sports', 'Relaxation & Wellness', 'Photography', 'Architecture',
  'Local Cuisine', 'Fine Dining', 'Street Food', 'Cafes & Coffee', 'Bars & Nightlife'
]

// Step flow configuration
const STEPS = {
  WELCOME: 'welcome',
  DESTINATION: 'destination',
  DURATION: 'duration',
  BUDGET: 'budget',
  INTERESTS: 'interests',
  GENERATING: 'generating',
  RESULTS: 'results'
}

export default function Home() {
  const [currentStep, setCurrentStep] = useState(STEPS.WELCOME)
  const [formData, setFormData] = useState<ItineraryRequest>({
    city: '',
    budget: '',
    days: 3,
    interests: []
  })
  const [itinerary, setItinerary] = useState<ItineraryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savedItineraries, setSavedItineraries] = useState<ItineraryResponse[]>([])
  const [showCommunityTrips, setShowCommunityTrips] = useState(false)
  const [sessionId] = useState(() => crypto.randomUUID())
  const [generationCount, setGenerationCount] = useState(0)
  const [isOnline, setIsOnline] = useState(true)

  // Check online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('savedItineraries')
    if (saved) {
      try {
        setSavedItineraries(JSON.parse(saved))
      } catch (e) {
        console.error('Error loading saved itineraries:', e)
      }
    }
  }, [])

  const nextStep = () => {
    const steps = Object.values(STEPS)
    const currentIndex = steps.indexOf(currentStep)
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1])
    }
  }

  const prevStep = () => {
    const steps = Object.values(STEPS)
    const currentIndex = steps.indexOf(currentStep)
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1])
    }
  }

  const handleGenerate = async () => {
    if (!formData.city || !formData.budget || !formData.days) {
      setError('Please complete all required fields')
      return
    }

    if (!isOnline) {
      setError('Internet connection required for real-time data')
      return
    }

    setCurrentStep(STEPS.GENERATING)
    setLoading(true)
    setError('')
    setGenerationCount(prev => prev + 1)

    try {
      const response = await fetch('/api/itinerary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': sessionId,
          'X-Generation-Count': generationCount.toString()
        },
        body: JSON.stringify({
          ...formData,
          sessionId,
          generationCount,
          includeWeather: true,
          includeCulturalTips: true,
          imageSize: 'medium',
          realTimeData: true
        }),
      })

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`
        try {
          const errorData = await response.text()
          console.error('API Error:', response.status, errorData)
          try {
            const errorObj = JSON.parse(errorData)
            errorMessage = errorObj.error || errorMessage
          } catch {
            errorMessage = errorData.substring(0, 100) || errorMessage
          }
        } catch (e) {
          console.error('Failed to read error response:', e)
        }
        throw new Error(errorMessage)
      }

      const data = await response.json()
      setItinerary(data)
      setCurrentStep(STEPS.RESULTS)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setCurrentStep(STEPS.INTERESTS)
    } finally {
      setLoading(false)
    }
  }

  const saveItinerary = () => {
    if (!itinerary) return
    
    const updated = [...savedItineraries, itinerary]
    setSavedItineraries(updated)
    localStorage.setItem('savedItineraries', JSON.stringify(updated))
    
    // Show success message
    alert('Trip saved successfully!')
  }

  const toggleInterest = (interest: string) => {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.includes(interest) 
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest]
    }))
  }

  const resetForm = () => {
    setCurrentStep(STEPS.WELCOME)
    setFormData({
      city: '',
      budget: '',
      days: 3,
      interests: []
    })
    setItinerary(null)
    setError('')
    setGenerationCount(0)
  }

  const startNewTrip = () => {
    setCurrentStep(STEPS.DESTINATION)
    setFormData({
      city: '',
      budget: '',
      days: 3,
      interests: []
    })
    setItinerary(null)
    setError('')
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation Header */}
      <nav className="bg-white/95 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3 font-bold text-xl text-gray-900">
            <div className="w-8 h-8 bg-gradient-to-r from-green-600 to-green-700 rounded-lg flex items-center justify-center">
              <Plane className="w-5 h-5 text-white" />
            </div>
            <span>Trip Planner AI</span>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Online Status Indicator */}
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs ${
              isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </div>
            
            <button
              onClick={() => setShowCommunityTrips(true)}
              className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
            >
              Community Trips
            </button>
            <button className="bg-transparent hover:bg-green-50 text-green-700 font-medium py-2 px-6 rounded-full border border-green-200 transition-all duration-200">
              Sign In
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-8">
        <AnimatePresence mode="wait">
          {/* Welcome Step */}
          {currentStep === STEPS.WELCOME && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="py-16 md:py-24"
            >
              <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                {/* AI Assistant Avatar */}
                <motion.div 
                  className="mx-auto w-24 h-24 bg-gradient-to-r from-green-600 to-green-700 rounded-full flex items-center justify-center mb-8"
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Sparkles className="w-12 h-12 text-white" />
                </motion.div>

                <div className="mb-8">
                  <div className="inline-flex items-center space-x-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
                    <Sparkles className="w-4 h-4" />
                    <span>Powered by Real-Time Data & AI</span>
                  </div>
                </div>

                <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 leading-tight mb-6">
                  Your Next Journey,
                  <br />
                  <span className="text-green-700">Perfectly Planned</span>
                </h1>

                <p className="text-lg md:text-xl text-gray-600 leading-relaxed mb-12 max-w-3xl mx-auto">
                  Create personalized travel itineraries using real-time location data, live weather updates, 
                  and AI-powered recommendations. Every suggestion is based on actual places and current information.
                </p>

                <div className="space-y-6">
                  <button 
                    onClick={startNewTrip}
                    className="bg-green-700 hover:bg-green-800 text-white font-semibold py-4 px-10 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 inline-flex items-center space-x-3 text-lg"
                  >
                    <Sparkles className="w-6 h-6" />
                    <span>Plan My Perfect Trip</span>
                    <ArrowRight className="w-6 h-6" />
                  </button>

                  <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
                    {savedItineraries.length > 0 && (
                      <div className="text-sm text-gray-500">
                        You have {savedItineraries.length} saved trip{savedItineraries.length !== 1 ? 's' : ''}
                      </div>
                    )}
                    <button
                      onClick={() => setShowCommunityTrips(true)}
                      className="bg-white hover:bg-gray-50 text-gray-700 font-medium py-3 px-6 rounded-full border border-gray-200 transition-all duration-200 shadow-sm hover:shadow-md inline-flex items-center space-x-2"
                    >
                      <Users className="w-4 h-4" />
                      <span>Explore Community Trips</span>
                    </button>
                  </div>
                </div>

                {/* Real-Time Features Grid */}
                <div className="grid md:grid-cols-3 gap-8 mt-20">
                  <motion.div 
                    className="text-center"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <Globe className="w-8 h-8 text-green-700" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-semibold text-gray-900 leading-tight mb-3">Real-Time Data</h3>
                    <p className="text-base text-gray-700 leading-relaxed">
                      Live location data from OpenStreetMap, real weather updates, and current attraction information
                    </p>
                  </motion.div>
                  
                  <motion.div 
                    className="text-center"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <MapPin className="w-8 h-8 text-blue-700" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-semibold text-gray-900 leading-tight mb-3">Authentic Locations</h3>
                    <p className="text-base text-gray-700 leading-relaxed">
                      Real addresses, actual restaurants, and verified attractions with precise coordinates
                    </p>
                  </motion.div>
                  
                  <motion.div 
                    className="text-center"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                  >
                    <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <Sparkles className="w-8 h-8 text-purple-700" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-semibold text-gray-900 leading-tight mb-3">AI-Powered</h3>
                    <p className="text-base text-gray-700 leading-relaxed">
                      Google Gemini AI creates unique itineraries based on your preferences and real data
                    </p>
                  </motion.div>
                </div>

                {/* API Status Indicators */}
                <div className="mt-16 p-6 bg-gray-50 rounded-2xl">
                  <h4 className="font-semibold text-gray-900 mb-4">Live Data Sources</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-gray-600">OpenStreetMap</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-gray-600">Weather API</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-gray-600">Pexels Images</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-gray-600">Google Gemini AI</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Destination Step */}
          {currentStep === STEPS.DESTINATION && (
            <motion.div
              key="destination"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="py-16 md:py-24"
            >
              <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                  <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">Where would you like to go?</h2>
                  <p className="text-lg md:text-xl text-gray-600 leading-relaxed">
                    Enter any city worldwide and we'll fetch real-time data to create your perfect itinerary
                  </p>
                </div>

                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 transition-all duration-300 hover:shadow-xl">
                  <div className="mb-8">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Destination City
                    </label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="e.g., Mumbai, Tokyo, Paris, New York"
                      className="w-full px-4 py-4 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 text-lg"
                      autoFocus
                    />
                    <p className="mt-2 text-sm text-gray-500">
                      We'll fetch real attractions, restaurants, and current weather data for your destination
                    </p>
                  </div>

                  <div className="flex justify-between">
                    <button 
                      onClick={resetForm} 
                      className="bg-white hover:bg-gray-50 text-gray-700 font-medium py-3 px-6 rounded-full border border-gray-200 transition-all duration-200 shadow-sm hover:shadow-md inline-flex items-center space-x-2"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back</span>
                    </button>
                    <button
                      onClick={nextStep}
                      disabled={!formData.city || !isOnline}
                      className="bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-8 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 inline-flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                    >
                      <span>Continue</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {!isOnline && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      <span className="text-sm text-red-700">Internet connection required for real-time data</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Duration Step */}
          {currentStep === STEPS.DURATION && (
            <motion.div
              key="duration"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="py-16 md:py-24"
            >
              <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                  <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">How long is your trip?</h2>
                  <p className="text-lg md:text-xl text-gray-600 leading-relaxed">
                    Choose the duration that works best for your schedule
                  </p>
                </div>

                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 transition-all duration-300 hover:shadow-xl">
                  <div className="mb-8">
                    <label className="block text-sm font-medium text-gray-700 mb-4">
                      Trip Duration
                    </label>
                    <div className="grid grid-cols-3 gap-3 mb-6">
                      {[1, 2, 3, 4, 5, 6, 7, 10, 14].map(d => (
                        <button
                          key={d}
                          onClick={() => setFormData(prev => ({ ...prev, days: d }))}
                          className={`p-4 rounded-xl border text-center font-medium transition-all ${
                            formData.days === d
                              ? 'border-green-500 bg-green-50 text-green-700 shadow-md'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="text-lg font-bold">{d}</div>
                          <div className="text-xs">{d === 1 ? 'Day' : 'Days'}</div>
                        </button>
                      ))}
                    </div>
                    <p className="text-sm text-gray-500">
                      Longer trips allow for more detailed exploration and diverse experiences
                    </p>
                  </div>

                  <div className="flex justify-between">
                    <button 
                      onClick={prevStep} 
                      className="bg-white hover:bg-gray-50 text-gray-700 font-medium py-3 px-6 rounded-full border border-gray-200 transition-all duration-200 shadow-sm hover:shadow-md inline-flex items-center space-x-2"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back</span>
                    </button>
                    <button 
                      onClick={nextStep}
                      className="bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-8 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 inline-flex items-center space-x-2"
                    >
                      <span>Continue</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Budget Step */}
          {currentStep === STEPS.BUDGET && (
            <motion.div
              key="budget"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="py-16 md:py-24"
            >
              <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                  <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">What's your budget?</h2>
                  <p className="text-lg md:text-xl text-gray-600 leading-relaxed">
                    We'll optimize your itinerary to match your spending preferences with real pricing data
                  </p>
                </div>

                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 transition-all duration-300 hover:shadow-xl">
                  <div className="mb-8">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Total Budget (INR)
                    </label>
                    <input
                      type="text"
                      value={formData.budget}
                      onChange={(e) => setFormData(prev => ({ ...prev, budget: e.target.value }))}
                      placeholder="e.g., 50000"
                      className="w-full px-4 py-4 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 text-lg"
                    />
                    <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-700 font-medium mb-2">Budget includes:</p>
                      <ul className="text-sm text-blue-600 space-y-1">
                        <li>• Accommodation (40%)</li>
                        <li>• Food & Dining (30%)</li>
                        <li>• Activities & Attractions (20%)</li>
                        <li>• Local Transportation (10%)</li>
                      </ul>
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <button 
                      onClick={prevStep} 
                      className="bg-white hover:bg-gray-50 text-gray-700 font-medium py-3 px-6 rounded-full border border-gray-200 transition-all duration-200 shadow-sm hover:shadow-md inline-flex items-center space-x-2"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back</span>
                    </button>
                    <button
                      onClick={nextStep}
                      disabled={!formData.budget}
                      className="bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-8 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 inline-flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                    >
                      <span>Continue</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Interests Step */}
          {currentStep === STEPS.INTERESTS && (
            <motion.div
              key="interests"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="py-16 md:py-24"
            >
              <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                  <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">What interests you?</h2>
                  <p className="text-lg md:text-xl text-gray-600 leading-relaxed">
                    Select your preferences to personalize your experience (optional)
                  </p>
                </div>

                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 transition-all duration-300 hover:shadow-xl">
                  <div className="mb-8">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {travelInterests.map((interest) => (
                        <button
                          key={interest}
                          onClick={() => toggleInterest(interest)}
                          className={`p-4 rounded-xl text-left text-sm font-medium transition-all ${
                            formData.interests.includes(interest)
                              ? 'border-green-500 bg-green-50 text-green-700 border-2 shadow-md'
                              : 'border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>{interest}</span>
                            {formData.interests.includes(interest) && (
                              <Check className="w-4 h-4" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                    
                    <div className="mt-6 p-4 bg-green-50 rounded-lg">
                      <p className="text-sm text-green-700">
                        Selected {formData.interests.length} interests. These will help us find the most relevant real attractions and experiences in {formData.city}.
                      </p>
                    </div>
                  </div>

                  {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-2">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                      <p className="text-red-700 text-sm">{error}</p>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <button 
                      onClick={prevStep} 
                      className="bg-white hover:bg-gray-50 text-gray-700 font-medium py-3 px-6 rounded-full border border-gray-200 transition-all duration-200 shadow-sm hover:shadow-md inline-flex items-center space-x-2"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back</span>
                    </button>
                    <button 
                      onClick={handleGenerate}
                      disabled={!isOnline}
                      className="bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-8 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 inline-flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                    >
                      <Sparkles className="w-5 h-5" />
                      <span>Generate My Trip</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Generating Step */}
          {currentStep === STEPS.GENERATING && (
            <motion.div
              key="generating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-16 md:py-24"
            >
              <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 transition-all duration-300 hover:shadow-xl">
                  <div className="mb-8">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-700 mx-auto mb-6"></div>
                    <h3 className="text-xl md:text-2xl font-semibold text-gray-900 leading-tight mb-3">Creating your perfect trip...</h3>
                    <p className="text-base text-gray-700 leading-relaxed mb-6">
                      Our AI is analyzing real-time data for {formData.city} to create your personalized itinerary
                    </p>
                  </div>
                  
                  <div className="space-y-4 text-left max-w-md mx-auto">
                    <motion.div 
                      className="flex items-center space-x-3"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 }}
                    >
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm text-gray-600">Fetching real location data from OpenStreetMap...</span>
                    </motion.div>
                    <motion.div 
                      className="flex items-center space-x-3"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 1 }}
                    >
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm text-gray-600">Getting current weather conditions...</span>
                    </motion.div>
                    <motion.div 
                      className="flex items-center space-x-3"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 1.5 }}
                    >
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm text-gray-600">Finding authentic restaurants and attractions...</span>
                    </motion.div>
                    <motion.div 
                      className="flex items-center space-x-3"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 2 }}
                    >
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm text-gray-600">Generating AI-powered recommendations...</span>
                    </motion.div>
                    <motion.div 
                      className="flex items-center space-x-3"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 2.5 }}
                    >
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm text-gray-600">Optimizing your schedule and budget...</span>
                    </motion.div>
                  </div>
                  
                  <div className="mt-8 p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-700">
                      <strong>Generation #{generationCount}</strong> - Each trip is unique and based on live data
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Results Step */}
          {currentStep === STEPS.RESULTS && itinerary && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="py-8"
            >
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-8">
                  <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                    Your {formData.days}-Day Trip to {formData.city}
                  </h2>
                  
                  {/* Real Data Indicators */}
                  {itinerary.metadata?.realDataSources && (
                    <div className="mb-6 p-4 bg-green-50 rounded-lg inline-block">
                      <p className="text-sm text-green-700 font-medium mb-2">✅ Generated with Real-Time Data</p>
                      <div className="flex flex-wrap gap-2 text-xs text-green-600">
                        <span>📍 {itinerary.metadata.realDataSources.locations}</span>
                        <span>🌤️ {itinerary.metadata.realDataSources.weather}</span>
                        <span>🖼️ {itinerary.metadata.realDataSources.images}</span>
                        <span>🤖 {itinerary.metadata.realDataSources.ai}</span>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex flex-col sm:flex-row justify-center gap-4">
                    <button
                      onClick={saveItinerary}
                      className="bg-white hover:bg-gray-50 text-gray-700 font-medium py-3 px-6 rounded-full border border-gray-200 transition-all duration-200 shadow-sm hover:shadow-md inline-flex items-center space-x-2"
                    >
                      <Save className="w-4 h-4" />
                      <span>Save Trip</span>
                    </button>
                    <button
                      onClick={startNewTrip}
                      className="bg-transparent hover:bg-green-50 text-green-700 font-medium py-3 px-6 rounded-full border border-green-200 transition-all duration-200 inline-flex items-center space-x-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Plan Another Trip</span>
                    </button>
                  </div>
                </div>

                {/* City Header Image */}
                {itinerary.locationImages[formData.city] && (
                  <div className="mb-12">
                    <div className="relative h-80 md:h-96 rounded-2xl overflow-hidden">
                      <img
                        src={itinerary.locationImages[formData.city].src.large}
                        alt={formData.city}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="text-center text-white">
                          <h3 className="text-4xl md:text-5xl font-bold mb-2">{formData.city}</h3>
                          <p className="text-xl md:text-2xl opacity-90">Your {formData.days}-day adventure awaits</p>
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-3 text-center">
                      Photo by {itinerary.locationImages[formData.city].photographer} on Pexels
                    </p>
                  </div>
                )}

                {/* Trip Summary */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 transition-all duration-200 hover:shadow-md mb-8">
                  <h3 className="text-xl md:text-2xl font-semibold text-gray-900 leading-tight mb-6">Trip Overview</h3>
                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">Budget Breakdown</h4>
                      <p className="text-base text-gray-700 leading-relaxed mb-3">
                        <strong>Total Cost:</strong> ₹{itinerary.summary.totalCost}
                      </p>
                      {itinerary.summary.costBreakdown && (
                        <div className="text-sm text-gray-600 space-y-2">
                          <div className="flex justify-between">
                            <span>Accommodation:</span>
                            <span className="font-medium">₹{itinerary.summary.costBreakdown.accommodation}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Food & Dining:</span>
                            <span className="font-medium">₹{itinerary.summary.costBreakdown.food}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Activities:</span>
                            <span className="font-medium">₹{itinerary.summary.costBreakdown.activities}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Transportation:</span>
                            <span className="font-medium">₹{itinerary.summary.costBreakdown.transportation}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">Travel Information</h4>
                      <p className="text-base text-gray-700 leading-relaxed mb-2">
                        <strong>Best Time to Visit:</strong> {itinerary.summary.bestTime}
                      </p>
                      {itinerary.summary.weatherOverview && (
                        <p className="text-sm text-gray-600 mb-4">{itinerary.summary.weatherOverview}</p>
                      )}
                      
                      {itinerary.metadata && (
                        <div className="text-xs text-gray-500 space-y-1">
                          <p>Generated: {new Date(itinerary.metadata.generatedAt).toLocaleString()}</p>
                          <p>Processing Time: {itinerary.metadata.processingTime}ms</p>
                          <p>Images Found: {itinerary.metadata.imageCount}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="mt-8 grid md:grid-cols-2 gap-8">
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">Trip Highlights</h4>
                      <ul className="space-y-2">
                        {itinerary.summary.highlights.map((highlight, i) => (
                          <li key={i} className="text-sm text-gray-600 flex items-center space-x-2">
                            <Star className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                            <span>{highlight}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    {itinerary.summary.culturalTips && (
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-3">Cultural Tips</h4>
                        <ul className="space-y-2">
                          {itinerary.summary.culturalTips.slice(0, 4).map((tip, i) => (
                            <li key={i} className="text-sm text-gray-600 flex items-start space-x-2">
                              <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                              <span>{tip}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Daily Itineraries */}
                <div className="space-y-8">
                  {itinerary.days.map((day, index) => (
                    <motion.div
                      key={day.day}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 transition-all duration-200 hover:shadow-md"
                    >
                      <div className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xl md:text-2xl font-semibold text-gray-900 leading-tight">
                            Day {day.day} - {new Date(day.date).toLocaleDateString('en-US', { 
                              weekday: 'long', 
                              month: 'long', 
                              day: 'numeric' 
                            })}
                          </h3>
                          {day.weather && (
                            <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm">
                              🌤️ {day.weather}
                            </div>
                          )}
                        </div>
                        <p className="text-base text-gray-700 leading-relaxed">{day.summary}</p>
                      </div>

                      {/* Activities Grid */}
                      <div className="grid md:grid-cols-3 gap-6 mb-8">
                        {/* Morning */}
                        <div>
                          <h4 className="font-semibold text-orange-600 mb-4 flex items-center space-x-2">
                            <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                            <span>Morning</span>
                          </h4>
                          {day.morning.map((activity, i) => (
                            <div key={i} className="mb-4 p-4 bg-orange-50 rounded-xl">
                              <div className="space-y-2">
                                <p className="font-medium text-sm text-orange-800">{activity.time}</p>
                                <p className="text-sm font-semibold text-gray-900">{activity.activity}</p>
                                <p className="text-xs text-gray-600">📍 {activity.location.address}</p>
                                <p className="text-xs text-gray-700">{activity.description}</p>
                                {activity.estimatedCost && (
                                  <p className="text-xs text-green-600 font-medium">💰 {activity.estimatedCost}</p>
                                )}
                                {activity.duration && (
                                  <p className="text-xs text-blue-600">⏱️ {activity.duration}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Afternoon */}
                        <div>
                          <h4 className="font-semibold text-blue-600 mb-4 flex items-center space-x-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            <span>Afternoon</span>
                          </h4>
                          {day.afternoon.map((activity, i) => (
                            <div key={i} className="mb-4 p-4 bg-blue-50 rounded-xl">
                              <div className="space-y-2">
                                <p className="font-medium text-sm text-blue-800">{activity.time}</p>
                                <p className="text-sm font-semibold text-gray-900">{activity.activity}</p>
                                <p className="text-xs text-gray-600">📍 {activity.location.address}</p>
                                <p className="text-xs text-gray-700">{activity.description}</p>
                                {activity.estimatedCost && (
                                  <p className="text-xs text-green-600 font-medium">💰 {activity.estimatedCost}</p>
                                )}
                                {activity.duration && (
                                  <p className="text-xs text-blue-600">⏱️ {activity.duration}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Evening */}
                        <div>
                          <h4 className="font-semibold text-purple-600 mb-4 flex items-center space-x-2">
                            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                            <span>Evening</span>
                          </h4>
                          {day.evening.map((activity, i) => (
                            <div key={i} className="mb-4 p-4 bg-purple-50 rounded-xl">
                              <div className="space-y-2">
                                <p className="font-medium text-sm text-purple-800">{activity.time}</p>
                                <p className="text-sm font-semibold text-gray-900">{activity.activity}</p>
                                <p className="text-xs text-gray-600">📍 {activity.location.address}</p>
                                <p className="text-xs text-gray-700">{activity.description}</p>
                                {activity.estimatedCost && (
                                  <p className="text-xs text-green-600 font-medium">💰 {activity.estimatedCost}</p>
                                )}
                                {activity.duration && (
                                  <p className="text-xs text-blue-600">⏱️ {activity.duration}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Dining */}
                      <div>
                        <h4 className="font-semibold text-green-600 mb-4 flex items-center space-x-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span>Dining Experience</span>
                        </h4>
                        
                        <div className="grid md:grid-cols-3 gap-4">
                          {day.dining.map((meal, i) => (
                            <div key={i} className="p-4 bg-green-50 rounded-xl">
                              <div className="space-y-2">
                                <div className="flex items-center space-x-2 mb-2">
                                  <span className="text-lg">
                                    {meal.meal === 'Breakfast' ? '☕' : meal.meal === 'Lunch' ? '🍽️' : '🍷'}
                                  </span>
                                  <div>
                                    <p className="font-medium text-sm text-green-800">{meal.meal}</p>
                                    <p className="text-sm font-semibold text-gray-900">{meal.restaurant}</p>
                                  </div>
                                </div>
                                <p className="text-xs text-gray-600">{meal.cuisine} • 📍 {meal.location.address}</p>
                                <p className="text-xs text-green-600 font-medium">💰 {meal.price}</p>
                                {meal.speciality && (
                                  <p className="text-xs text-gray-700">✨ {meal.speciality}</p>
                                )}
                                {meal.rating && (
                                  <p className="text-xs text-yellow-600">⭐ {meal.rating}</p>
                                )}
                                {meal.culturalNote && (
                                  <p className="text-xs text-purple-600 italic">🏛️ {meal.culturalNote}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Community Trips Modal */}
        <CommunityTripsModal
          isOpen={showCommunityTrips}
          onClose={() => setShowCommunityTrips(false)}
        />
      </main>
    </div>
  )
}