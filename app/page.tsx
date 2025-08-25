'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Calendar, DollarSign, Plane, Download, Save, Moon, Sun,
  Image as ImageIcon, Utensils, Coffee, Wine, Pizza, ArrowRight,
  ArrowLeft, Sparkles, Globe, Users, Star, Check, X
} from 'lucide-react'
import CommunityTripsModal from './components/CommunityTripsModal'

// Types (keeping existing interfaces)
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

    setCurrentStep(STEPS.GENERATING)
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/itinerary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          includeWeather: true,
          includeCulturalTips: true,
          imageSize: 'medium'
        }),
      })

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`
        try {
          const errorData = await response.text()
          console.error('API Error:', response.status, errorData)
          // Try to parse error message from response
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

      let data: any
      try {
        data = await response.json()
      } catch (e) {
        console.error('Failed to parse response JSON:', e)
        throw new Error('Invalid response from server')
      }
      setItinerary(data)
      setCurrentStep(STEPS.RESULTS)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setCurrentStep(STEPS.INTERESTS) // Go back to last step
    } finally {
      setLoading(false)
    }
  }

  const saveItinerary = () => {
    if (!itinerary) return
    
    const updated = [...savedItineraries, itinerary]
    setSavedItineraries(updated)
    localStorage.setItem('savedItineraries', JSON.stringify(updated))
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
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation Header */}
      <nav className="nav-header">
        <div className="nav-container">
          <div className="logo">
            <div className="w-8 h-8 bg-gradient-green rounded-lg flex items-center justify-center">
              <Plane className="w-5 h-5 text-white" />
            </div>
            <span>Trip Planner AI</span>
          </div>
          <div className="flex items-center space-x-6">
            <button
              onClick={() => setShowCommunityTrips(true)}
              className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
            >
              Community Trips
            </button>
            <button className="btn-outline">
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
              className="section"
            >
              <div className="container-tight text-center">
                {/* AI Assistant Avatar */}
                <motion.div 
                  className="mx-auto w-24 h-24 bg-gradient-green rounded-full flex items-center justify-center mb-8 float"
                >
                  <Sparkles className="w-12 h-12 text-white" />
                </motion.div>

                <div className="mb-8">
                  <div className="inline-flex items-center space-x-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
                    <Sparkles className="w-4 h-4" />
                    <span>Meet TripAI - Your Smart Travel Assistant</span>
                  </div>
                </div>

                <h1 className="heading-xl mb-6">
                  Your Next Journey,
                  <br />
                  <span className="text-green-700">Optimized</span>
                </h1>

                <p className="text-subtitle mb-12 max-w-2xl mx-auto">
                  Build, personalize, and optimize your itineraries with our free AI trip 
                  planner. Designed for vacations, workations, and everyday adventures.
                </p>

                <div className="space-y-6">
                  <button 
                    onClick={nextStep}
                    className="btn-primary inline-flex items-center space-x-2"
                  >
                    <span>Create a new trip</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>

                  <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
                    {savedItineraries.length > 0 && (
                      <div className="text-small text-gray-500">
                        You have {savedItineraries.length} saved trip{savedItineraries.length !== 1 ? 's' : ''}
                      </div>
                    )}
                    <button
                      onClick={() => setShowCommunityTrips(true)}
                      className="btn-secondary inline-flex items-center space-x-2"
                    >
                      <Users className="w-4 h-4" />
                      <span>Explore Community Trips</span>
                    </button>
                  </div>
                </div>

                {/* Features Grid */}
                <div className="grid md:grid-cols-3 gap-8 mt-20">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                      <Globe className="w-6 h-6 text-green-700" />
                    </div>
                    <h3 className="heading-sm mb-2">AI-Powered Planning</h3>
                    <p className="text-body text-gray-600">
                      Smart recommendations based on your preferences and travel style
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                      <MapPin className="w-6 h-6 text-blue-700" />
                    </div>
                    <h3 className="heading-sm mb-2">Real Locations</h3>
                    <p className="text-body text-gray-600">
                      Authentic places with real addresses and cultural insights
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                      <Utensils className="w-6 h-6 text-purple-700" />
                    </div>
                    <h3 className="heading-sm mb-2">Local Experiences</h3>
                    <p className="text-body text-gray-600">
                      Discover hidden gems and authentic local dining experiences
                    </p>
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
              className="section"
            >
              <div className="container-tight">
                <div className="text-center mb-12">
                  <h2 className="heading-lg mb-4">Where would you like to go?</h2>
                  <p className="text-subtitle text-gray-600">
                    Tell us your dream destination and we'll create the perfect itinerary
                  </p>
                </div>

                <div className="card-elevated max-w-md mx-auto">
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Destination
                    </label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="e.g., Mumbai, Tokyo, Delhi"
                      className="form-input text-lg"
                      autoFocus
                    />
                  </div>

                  <div className="flex justify-between">
                    <button onClick={prevStep} className="btn-secondary inline-flex items-center space-x-2">
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back</span>
                    </button>
                    <button 
                      onClick={nextStep} 
                      disabled={!formData.city}
                      className="btn-primary inline-flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span>Continue</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
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
              className="section"
            >
              <div className="container-tight">
                <div className="text-center mb-12">
                  <h2 className="heading-lg mb-4">How long is your trip?</h2>
                  <p className="text-subtitle text-gray-600">
                    Choose the duration that works best for your schedule
                  </p>
                </div>

                <div className="card-elevated max-w-md mx-auto">
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Trip Duration
                    </label>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {[1, 2, 3, 4, 5, 6, 7, 10, 14].map(d => (
                        <button
                          key={d}
                          onClick={() => setFormData(prev => ({ ...prev, days: d }))}
                          className={`p-3 rounded-xl border text-center font-medium transition-all ${
                            formData.days === d
                              ? 'border-green-500 bg-green-50 text-green-700'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {d} {d === 1 ? 'Day' : 'Days'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <button onClick={prevStep} className="btn-secondary inline-flex items-center space-x-2">
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back</span>
                    </button>
                    <button 
                      onClick={nextStep}
                      className="btn-primary inline-flex items-center space-x-2"
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
              className="section"
            >
              <div className="container-tight">
                <div className="text-center mb-12">
                  <h2 className="heading-lg mb-4">What's your budget?</h2>
                  <p className="text-subtitle text-gray-600">
                    We'll optimize your itinerary to match your spending preferences
                  </p>
                </div>

                <div className="card-elevated max-w-md mx-auto">
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Budget (INR)
                    </label>
                    <input
                      type="text"
                      value={formData.budget}
                      onChange={(e) => setFormData(prev => ({ ...prev, budget: e.target.value }))}
                      placeholder="e.g., 50000"
                      className="form-input text-lg"
                    />
                    <div className="mt-3 text-small text-gray-500">
                      This includes accommodation, food, activities, and transportation
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <button onClick={prevStep} className="btn-secondary inline-flex items-center space-x-2">
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back</span>
                    </button>
                    <button 
                      onClick={nextStep}
                      disabled={!formData.budget}
                      className="btn-primary inline-flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="section"
            >
              <div className="container-tight">
                <div className="text-center mb-12">
                  <h2 className="heading-lg mb-4">What interests you?</h2>
                  <p className="text-subtitle text-gray-600">
                    Select your preferences to personalize your experience (optional)
                  </p>
                </div>

                <div className="card-elevated">
                  <div className="mb-8">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {travelInterests.map((interest) => (
                        <button
                          key={interest}
                          onClick={() => toggleInterest(interest)}
                          className={`p-3 rounded-xl text-left text-sm font-medium transition-all ${
                            formData.interests.includes(interest)
                              ? 'border-green-500 bg-green-50 text-green-700 border-2'
                              : 'border border-gray-200 hover:border-gray-300'
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
                  </div>

                  {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-red-700 text-sm">{error}</p>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <button onClick={prevStep} className="btn-secondary inline-flex items-center space-x-2">
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back</span>
                    </button>
                    <button 
                      onClick={handleGenerate}
                      className="btn-primary inline-flex items-center space-x-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Create My Trip</span>
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
              className="section"
            >
              <div className="container-tight text-center">
                <div className="card-elevated max-w-md mx-auto">
                  <div className="mb-6">
                    <div className="loading-spinner mx-auto mb-4"></div>
                    <h3 className="heading-sm mb-2">Creating your perfect trip...</h3>
                    <p className="text-body text-gray-600">
                      Our AI is analyzing the best attractions, restaurants, and experiences in {formData.city}
                    </p>
                  </div>
                  
                  <div className="space-y-2 text-left">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-small text-gray-600">Finding top attractions...</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-small text-gray-600">Discovering local restaurants...</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-small text-gray-600">Optimizing your schedule...</span>
                    </div>
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
              <div className="container">
                <div className="text-center mb-8">
                  <h2 className="heading-lg mb-4">Your {formData.days}-Day Trip to {formData.city}</h2>
                  <div className="flex justify-center space-x-4">
                    <button
                      onClick={saveItinerary}
                      className="btn-secondary inline-flex items-center space-x-2"
                    >
                      <Save className="w-4 h-4" />
                      <span>Save Trip</span>
                    </button>
                    <button
                      onClick={resetForm}
                      className="btn-outline inline-flex items-center space-x-2"
                    >
                      <Plane className="w-4 h-4" />
                      <span>Plan Another Trip</span>
                    </button>
                  </div>
                </div>

                {/* City Header Image */}
                {itinerary.locationImages[formData.city] && (
                  <div className="mb-8">
                    <div className="relative h-80 rounded-2xl overflow-hidden">
                      <img
                        src={itinerary.locationImages[formData.city].src.large}
                        alt={formData.city}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <div className="text-center text-white">
                          <h3 className="text-4xl font-bold mb-2">{formData.city}</h3>
                          <p className="text-xl opacity-90">Your {formData.days}-day adventure awaits</p>
                        </div>
                      </div>
                    </div>
                    <p className="text-small text-gray-500 mt-2 text-center">
                      Photo by <span className="underline">{itinerary.locationImages[formData.city].photographer}</span> on Pexels
                    </p>
                  </div>
                )}

                {/* Trip Summary */}
                <div className="card mb-8">
                  <h3 className="heading-sm mb-4">Trip Overview</h3>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-body mb-2"><strong>Total Cost:</strong> ₹{itinerary.summary.totalCost}</p>
                      {itinerary.summary.costBreakdown && (
                        <div className="text-small text-gray-600 space-y-1">
                          <p>Accommodation: ₹{itinerary.summary.costBreakdown.accommodation}</p>
                          <p>Food: ₹{itinerary.summary.costBreakdown.food}</p>
                          <p>Activities: ₹{itinerary.summary.costBreakdown.activities}</p>
                          <p>Transportation: ₹{itinerary.summary.costBreakdown.transportation}</p>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-body mb-2"><strong>Best Time to Visit:</strong> {itinerary.summary.bestTime}</p>
                      {itinerary.summary.weatherOverview && (
                        <p className="text-small text-gray-600">{itinerary.summary.weatherOverview}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="mt-6">
                    <h4 className="font-semibold mb-2">Trip Highlights</h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      <ul className="space-y-1">
                        {itinerary.summary.highlights.map((highlight, i) => (
                          <li key={i} className="text-small text-gray-600 flex items-center space-x-2">
                            <Star className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                            <span>{highlight}</span>
                          </li>
                        ))}
                      </ul>
                      {itinerary.summary.culturalTips && (
                        <div>
                          <h5 className="font-medium mb-2">Cultural Tips</h5>
                          <ul className="space-y-1">
                            {itinerary.summary.culturalTips.slice(0, 3).map((tip, i) => (
                              <li key={i} className="text-small text-gray-600 flex items-start space-x-2">
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                                <span>{tip}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
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
                      className="card"
                    >
                      <div className="mb-6">
                        <h3 className="heading-sm mb-2">Day {day.day} - {day.date}</h3>
                        <p className="text-body text-gray-600 mb-2">{day.summary}</p>
                        {day.weather && (
                          <p className="text-small text-gray-500">Weather: {day.weather}</p>
                        )}
                      </div>

                      {/* Activities */}
                      <div className="grid md:grid-cols-3 gap-6 mb-8">
                        <div>
                          <h4 className="font-semibold text-orange-600 mb-4 flex items-center space-x-2">
                            <Coffee className="w-4 h-4" />
                            <span>Morning</span>
                          </h4>
                          {day.morning.map((activity, i) => (
                            <div key={i} className="mb-4 p-4 bg-orange-50 rounded-xl">
                              <div className="flex items-start space-x-3">
                                {itinerary.locationImages[activity.location.name] && (
                                  <img
                                    src={itinerary.locationImages[activity.location.name].src.medium}
                                    alt={activity.location.name}
                                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                                  />
                                )}
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{activity.time}</p>
                                  <p className="text-sm font-medium">{activity.activity}</p>
                                  <p className="text-xs text-gray-600">{activity.location.name}</p>
                                  {activity.estimatedCost && (
                                    <p className="text-xs text-green-600">{activity.estimatedCost}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        <div>
                          <h4 className="font-semibold text-blue-600 mb-4 flex items-center space-x-2">
                            <MapPin className="w-4 h-4" />
                            <span>Afternoon</span>
                          </h4>
                          {day.afternoon.map((activity, i) => (
                            <div key={i} className="mb-4 p-4 bg-blue-50 rounded-xl">
                              <div className="flex items-start space-x-3">
                                {itinerary.locationImages[activity.location.name] && (
                                  <img
                                    src={itinerary.locationImages[activity.location.name].src.medium}
                                    alt={activity.location.name}
                                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                                  />
                                )}
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{activity.time}</p>
                                  <p className="text-sm font-medium">{activity.activity}</p>
                                  <p className="text-xs text-gray-600">{activity.location.name}</p>
                                  {activity.estimatedCost && (
                                    <p className="text-xs text-green-600">{activity.estimatedCost}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        <div>
                          <h4 className="font-semibold text-purple-600 mb-4 flex items-center space-x-2">
                            <Wine className="w-4 h-4" />
                            <span>Evening</span>
                          </h4>
                          {day.evening.map((activity, i) => (
                            <div key={i} className="mb-4 p-4 bg-purple-50 rounded-xl">
                              <div className="flex items-start space-x-3">
                                {itinerary.locationImages[activity.location.name] && (
                                  <img
                                    src={itinerary.locationImages[activity.location.name].src.medium}
                                    alt={activity.location.name}
                                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                                  />
                                )}
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{activity.time}</p>
                                  <p className="text-sm font-medium">{activity.activity}</p>
                                  <p className="text-xs text-gray-600">{activity.location.name}</p>
                                  {activity.estimatedCost && (
                                    <p className="text-xs text-green-600">{activity.estimatedCost}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Dining */}
                      <div>
                        <h4 className="font-semibold text-green-600 mb-4 flex items-center space-x-2">
                          <Utensils className="w-4 h-4" />
                          <span>Dining Experience</span>
                        </h4>
                        
                        <div className="grid md:grid-cols-3 gap-4">
                          {day.dining.map((meal, i) => (
                            <div key={i} className="p-4 bg-green-50 rounded-xl">
                              <div className="flex items-start space-x-3">
                                {itinerary.locationImages[meal.location.name] && (
                                  <img
                                    src={itinerary.locationImages[meal.location.name].src.medium}
                                    alt={meal.restaurant}
                                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                                  />
                                )}
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2 mb-2">
                                    <span className="text-lg">
                                      {meal.meal === 'Breakfast' ? '☕' : meal.meal === 'Lunch' ? '🍽️' : '🍷'}
                                    </span>
                                    <div>
                                      <p className="font-medium text-sm">{meal.meal}</p>
                                      <p className="text-sm text-green-700 font-medium">{meal.restaurant}</p>
                                    </div>
                                  </div>
                                  <p className="text-xs text-gray-600 mb-1">{meal.cuisine}</p>
                                  <p className="text-xs text-gray-600 mb-1">📍 {meal.location.name}</p>
                                  <p className="text-xs text-green-600 font-medium">{meal.price}</p>
                                  {meal.speciality && (
                                    <p className="text-xs text-gray-500 mt-1">✨ {meal.speciality}</p>
                                  )}
                                  {meal.rating && (
                                    <p className="text-xs text-yellow-600 mt-1">⭐ {meal.rating}</p>
                                  )}
                                </div>
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

        {/* Saved Itineraries Section */}
        {currentStep === STEPS.WELCOME && savedItineraries.length > 0 && (
          <section className="section bg-gray-50">
            <div className="container">
              <h2 className="heading-md text-center mb-12">Your Saved Trips</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {savedItineraries.slice(0, 6).map((saved, index) => (
                  <div key={index} className="card">
                    <h3 className="font-semibold mb-2">
                      {saved.days.length}-Day Adventure
                    </h3>
                    <p className="text-small text-gray-600 mb-2">
                      Generated: {new Date(saved.metadata?.generatedAt || '').toLocaleDateString()}
                    </p>
                    <p className="text-small text-gray-600">
                      Budget: ₹{saved.summary.totalCost}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Community Trips Modal */}
        <CommunityTripsModal
          isOpen={showCommunityTrips}
          onClose={() => setShowCommunityTrips(false)}
        />
      </main>
    </div>
  )
}
