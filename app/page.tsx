'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MapPin, Calendar, DollarSign, Plane, Download, Save, Moon, Sun, Image as ImageIcon, Utensils, Coffee, Wine, Pizza } from 'lucide-react'

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
}

interface DayItinerary {
  day: number
  date: string
  summary: string
  morning: Activity[]
  afternoon: Activity[]
  evening: Activity[]
  dining: Dining[]
}

interface TripSummary {
  totalCost: string
  highlights: string[]
  tips: string[]
  bestTime: string
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
  generatedAt: string
}

// Enhanced travel interests with dining focus
const travelInterests = [
  'Culture', 'Food & Dining', 'Adventure', 'History', 'Nature', 'Shopping',
  'Art', 'Music', 'Sports', 'Relaxation', 'Photography', 'Architecture',
  'Local Cuisine', 'Fine Dining', 'Street Food', 'Cafes', 'Wine & Bars'
]

// Dining meal types with icons
const mealTypes = [
  { type: 'Breakfast', icon: '☕', description: 'Morning meal & coffee' },
  { type: 'Brunch', icon: '🥐', description: 'Late morning meal' },
  { type: 'Lunch', icon: '🍽️', description: 'Midday dining' },
  { type: 'Afternoon Tea', icon: '🫖', description: 'Tea & snacks' },
  { type: 'Dinner', icon: '🍷', description: 'Evening dining' },
  { type: 'Late Night', icon: '🌙', description: 'Night food & drinks' }
]

export default function Home() {
  const [city, setCity] = useState('')
  const [budget, setBudget] = useState('')
  const [days, setDays] = useState(3)
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [itinerary, setItinerary] = useState<ItineraryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savedItineraries, setSavedItineraries] = useState<ItineraryResponse[]>([])
  const [darkMode, setDarkMode] = useState(false)

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

  const handleGenerate = async () => {
    if (!city || !budget || !days) {
      setError('Please fill in all fields')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/itinerary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          city,
          budget,
          days,
          interests: selectedInterests,
        }),
      })

      if (!response.ok) {
        const errorData = await response.text()
        console.error('API Error:', response.status, errorData)
        throw new Error(`API Error: ${response.status}`)
      }

      const data = await response.json()
      setItinerary(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
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
    setSelectedInterests(prev => 
      prev.includes(interest) 
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    )
  }

  const toggleDarkMode = () => {
    setDarkMode(!darkMode)
  }

  const getLocationImage = (locationName: string) => {
    if (!itinerary?.locationImages) return null
    return itinerary.locationImages[locationName] || itinerary.locationImages[city]
  }

  const getMealIcon = (mealType: string) => {
    const meal = mealTypes.find(m => m.type.toLowerCase() === mealType.toLowerCase())
    return meal ? meal.icon : '🍽️'
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'dark' : ''}`}>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
            ✈️ Travel Itinerary Generator
          </h1>
          <p className="text-xl text-white/80">
            AI-powered travel planning for your perfect trip
          </p>
        </motion.div>

        {/* Dark Mode Toggle */}
        <motion.button
          onClick={toggleDarkMode}
          className="fixed top-4 right-4 p-3 glass-card text-white hover:bg-white/20 transition-colors z-50"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          {darkMode ? <Sun size={24} /> : <Moon size={24} />}
        </motion.button>

        {/* Form */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 mb-8"
        >
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="block text-white mb-2 font-medium">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g., Paris, Tokyo"
                className="w-full glass-input p-3 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50"
              />
            </div>
            
            <div>
              <label className="block text-white mb-2 font-medium">Budget (INR)</label>
              <input
                type="text"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="e.g., 50000"
                className="w-full glass-input p-3 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50"
              />
            </div>
            
            <div>
              <label className="block text-white mb-2 font-medium">Days</label>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-full glass-input p-3 text-white focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                {[1, 2, 3, 4, 5, 6, 7, 10, 14].map(d => (
                  <option key={d} value={d} className="bg-gray-800 text-white">
                    {d} {d === 1 ? 'Day' : 'Days'}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="flex items-end">
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full glass-input bg-gradient-to-r from-teal-400 to-blue-500 text-white font-semibold py-3 px-6 rounded-lg hover:from-teal-500 hover:to-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Generating...' : 'Generate Itinerary'}
              </button>
            </div>
          </div>

          {/* Travel Interests */}
          <div>
            <label className="block text-white mb-3 font-medium">Travel Interests (Optional)</label>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {travelInterests.map((interest) => (
                <button
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                  className={`p-2 rounded-lg text-sm font-medium transition-all ${
                    selectedInterests.includes(interest)
                      ? 'bg-teal-400 text-gray-900'
                      : 'glass-input text-white hover:bg-white/20'
                  }`}
                >
                  {interest}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Error */}
        {error && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-card p-4 mb-6 border-red-400 border-2"
          >
            <p className="text-red-200">{error}</p>
          </motion.div>
        )}

        {/* Generated Itinerary */}
        {itinerary && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6 mb-8"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">
                Your {days}-Day Trip to {city}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={saveItinerary}
                  className="glass-input p-2 text-white hover:bg-white/20 transition-colors"
                  title="Save Itinerary"
                >
                  <Save size={20} />
                </button>
                <button
                  className="glass-input p-2 text-white hover:bg-white/20 transition-colors"
                  title="Download PDF"
                >
                  <Download size={20} />
                </button>
              </div>
            </div>

            {/* City Header Image */}
            {getLocationImage(city) && (
              <div className="mb-6">
                <div className="relative h-64 rounded-xl overflow-hidden">
                  <img
                    src={getLocationImage(city)!.src.large}
                    alt={city}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <div className="text-center text-white">
                      <h3 className="text-3xl font-bold mb-2">{city}</h3>
                      <p className="text-lg opacity-90">Your {days}-day adventure awaits</p>
                    </div>
                  </div>
                </div>
                <p className="text-white/60 text-sm mt-2 text-center">
                  Photo by <span className="underline">{getLocationImage(city)!.photographer}</span> on Pexels
                </p>
              </div>
            )}

            {/* Trip Summary */}
            <div className="glass-card p-4 mb-6 bg-white/5">
              <h3 className="text-lg font-semibold text-white mb-3">Trip Summary</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-white/80"><strong>Total Cost:</strong> ₹{itinerary.summary.totalCost}</p>
                  <p className="text-white/80"><strong>Best Time:</strong> {itinerary.summary.bestTime}</p>
                </div>
                <div>
                  <p className="text-white/80"><strong>Highlights:</strong></p>
                  <ul className="text-white/60 text-sm">
                    {itinerary.summary.highlights.map((highlight, i) => (
                      <li key={i}>• {highlight}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Daily Itineraries */}
            <div className="space-y-6">
              {itinerary.days.map((day, index) => (
                <motion.div
                  key={day.day}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="glass-card p-6"
                >
                  <h3 className="text-xl font-bold text-white mb-4">
                    Day {day.day} - {day.date}
                  </h3>
                  <p className="text-white/80 mb-4">{day.summary}</p>

                  {/* Activities */}
                  <div className="grid md:grid-cols-3 gap-4 mb-6">
                    <div>
                      <h4 className="text-lg font-semibold text-teal-300 mb-2">🌅 Morning</h4>
                      {day.morning.map((activity, i) => (
                        <div key={i} className="mb-3 p-3 glass-input">
                          <div className="flex items-start gap-3">
                            {getLocationImage(activity.location.name) && (
                              <img
                                src={getLocationImage(activity.location.name)!.src.medium}
                                alt={activity.location.name}
                                className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                              />
                            )}
                            <div className="flex-1">
                              <p className="text-white font-medium">{activity.time}</p>
                              <p className="text-white/90">{activity.activity}</p>
                              <p className="text-white/70 text-sm">{activity.location.name}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div>
                      <h4 className="text-lg font-semibold text-orange-300 mb-2">☀️ Afternoon</h4>
                      {day.afternoon.map((activity, i) => (
                        <div key={i} className="mb-3 p-3 glass-input">
                          <div className="flex items-start gap-3">
                            {getLocationImage(activity.location.name) && (
                              <img
                                src={getLocationImage(activity.location.name)!.src.medium}
                                alt={activity.location.name}
                                className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                              />
                            )}
                            <div className="flex-1">
                              <p className="text-white font-medium">{activity.time}</p>
                              <p className="text-white/90">{activity.activity}</p>
                              <p className="text-white/70 text-sm">{activity.location.name}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div>
                      <h4 className="text-lg font-semibold text-purple-300 mb-2">🌙 Evening</h4>
                      {day.evening.map((activity, i) => (
                        <div key={i} className="mb-3 p-3 glass-input">
                          <div className="flex items-start gap-3">
                            {getLocationImage(activity.location.name) && (
                              <img
                                src={getLocationImage(activity.location.name)!.src.medium}
                                alt={activity.location.name}
                                className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                              />
                            )}
                            <div className="flex-1">
                              <p className="text-white font-medium">{activity.time}</p>
                              <p className="text-white/90">{activity.activity}</p>
                              <p className="text-white/70 text-sm">{activity.location.name}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Enhanced Dining Section */}
                  <div>
                    <h4 className="text-lg font-semibold text-yellow-300 mb-4 flex items-center gap-2">
                      <Utensils size={20} />
                      Dining Experience
                    </h4>
                    
                    {/* Ensure all three meals are shown */}
                    {(() => {
                      const requiredMeals = ['Breakfast', 'Lunch', 'Dinner']
                      const existingMeals = day.dining || []
                      
                      // Create a map of existing meals
                      const mealMap = new Map(existingMeals.map(meal => [meal.meal.toLowerCase(), meal]))
                      
                      // Ensure all required meals exist
                      const allMeals = requiredMeals.map(mealType => {
                        const existingMeal = mealMap.get(mealType.toLowerCase())
                        if (existingMeal) {
                          return existingMeal
                        }
                        
                        // Create fallback meal if missing
                        return {
                          meal: mealType,
                          restaurant: `${mealType} Place`,
                          cuisine: 'Local Cuisine',
                          location: { name: `${mealType} Location`, address: 'Address to be added' },
                          price: '₹500-1000',
                          speciality: 'Local specialty',
                          rating: '4.0/5',
                          ambiance: 'Cozy and welcoming'
                        }
                      })
                      
                      return (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {allMeals.map((meal, i) => (
                            <div key={i} className="p-4 glass-input hover:bg-white/10 transition-colors">
                              <div className="flex items-start gap-3">
                                {getLocationImage(meal.location.name) && (
                                  <img
                                    src={getLocationImage(meal.location.name)!.src.medium}
                                    alt={meal.restaurant}
                                    className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                                  />
                                )}
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-2xl">{getMealIcon(meal.meal)}</span>
                                    <div>
                                      <p className="text-white font-semibold">{meal.meal}</p>
                                      <p className="text-yellow-300 font-medium">{meal.restaurant}</p>
                                    </div>
                                  </div>
                                  <p className="text-white/90 text-sm mb-1">{meal.cuisine}</p>
                                  <p className="text-white/70 text-sm mb-1">📍 {meal.location.name}</p>
                                  <p className="text-green-300 text-sm font-medium">₹{meal.price}</p>
                                  {meal.speciality && (
                                    <p className="text-white/60 text-xs mt-1">✨ {meal.speciality}</p>
                                  )}
                                  {meal.rating && (
                                    <p className="text-yellow-400 text-xs mt-1">⭐ {meal.rating}</p>
                                  )}
                                  {meal.ambiance && (
                                    <p className="text-blue-300 text-xs mt-1">🎭 {meal.ambiance}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Saved Itineraries */}
        {savedItineraries.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6"
          >
            <h2 className="text-2xl font-bold text-white mb-4">Saved Itineraries</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedItineraries.map((saved, index) => (
                <div key={index} className="glass-card p-4 bg-white/5">
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {saved.days.length}-Day Trip
                  </h3>
                  <p className="text-white/80 text-sm mb-2">
                    Generated: {new Date(saved.generatedAt).toLocaleDateString()}
                  </p>
                  <p className="text-white/60 text-sm">
                    Cost: ₹{saved.summary.totalCost}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
