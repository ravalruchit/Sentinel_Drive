import { useState } from 'react'
import { MapPin, Navigation, RefreshCw } from 'lucide-react'

export default function SafeStops({ token, driverId = 'DRV-001', visible = false }) {
  const [stops, setStops] = useState([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`/api/safe-stops?driver_id=${driverId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) return
      const data = await res.json()
      setStops(data.stops || [])
      setLoaded(true)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (!visible) return null

  return (
    <div className="bg-sentinel-card border border-sentinel-red/40 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-sentinel-border bg-sentinel-red/5">
        <div className="flex items-center gap-2 text-xs text-sentinel-red font-semibold tracking-widest uppercase">
          <MapPin size={14} />
          Nearest Safe Stops
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1 text-xs text-sentinel-accent hover:text-white transition-colors">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          {loaded ? 'Refresh' : 'Find Stops'}
        </button>
      </div>

      {!loaded && (
        <div className="px-4 py-6 text-center text-xs text-gray-500">
          Click "Find Stops" to locate nearest bus stops, petrol pumps & rest areas
        </div>
      )}

      {loaded && stops.length === 0 && (
        <div className="px-4 py-4 text-xs text-gray-500 text-center">No stops found nearby</div>
      )}

      <div className="divide-y divide-sentinel-border">
        {stops.map((stop, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <span className="text-xl flex-shrink-0">{stop.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{stop.name}</p>
              <p className="text-xs text-gray-500 capitalize">{stop.type.replace('_', ' ')} · {stop.distance_text}</p>
            </div>
            <a href={stop.maps_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-xs text-sentinel-accent hover:text-white
                px-2 py-1 rounded border border-sentinel-accent/30 hover:border-sentinel-accent transition-colors flex-shrink-0">
              <Navigation size={10} /> Go
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
