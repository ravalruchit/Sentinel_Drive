import { useState, useEffect } from 'react'
import { Video, Download, RefreshCw } from 'lucide-react'

const SEVERITY_COLOR = {
  'Eye-Closure-Fatigue': '#ff3b3b',
  'Prolonged-Yawn':      '#ffd700',
  'Yawn-Warning':        '#ffd700',
  'Head-Nod-Tilt':       '#ff8c00',
  'Harsh-Braking':       '#ff3b3b',
  'Harsh-Acceleration':  '#ffd700',
  'Sharp-Turn':          '#00d4ff',
  'Overspeed':           '#ff3b3b',
}

export default function IncidentClips({ token }) {
  const [clips, setClips] = useState([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch('/api/incident-clips', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) return
      const data = await res.json()
      setClips(Array.isArray(data) ? data : [])
      setClips(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="bg-sentinel-card border border-sentinel-border rounded-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-sentinel-border">
        <div className="flex items-center gap-2 text-xs text-sentinel-accent font-semibold tracking-widest uppercase">
          <Video size={14} /> Incident Recordings
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">{clips.length} clips</span>
          <button onClick={load} className="text-gray-500 hover:text-white transition-colors">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {clips.length === 0 ? (
        <div className="px-4 py-6 text-center space-y-1">
          <p className="text-xs text-gray-500">No recordings yet</p>
          <p className="text-xs text-gray-600">Clips save automatically on fatigue, yawn, head nod, harsh braking & overspeed</p>
        </div>
      ) : (
        <div className="divide-y divide-sentinel-border max-h-64 overflow-y-auto">
          {clips.map((c, i) => {
            const color = SEVERITY_COLOR[c.event_raw] || '#00d4ff'
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-sentinel-bg/40 transition-colors">
                {/* Icon */}
                <span className="text-lg flex-shrink-0">{c.icon}</span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold" style={{ color }}>{c.event}</span>
                    <span className="text-xs text-gray-600">·</span>
                    <span className="text-xs text-gray-400 truncate">{c.driver}</span>
                  </div>
                  <p className="text-xs text-gray-600">{c.timestamp} · {c.size_kb} KB</p>
                </div>

                {/* Download */}
                <a
                  href={`/api/incident-clips/${c.filename}?token=${token}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`Download ${c.filename}`}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded border
                    border-sentinel-accent/30 text-sentinel-accent hover:bg-sentinel-accent/10
                    transition-colors flex-shrink-0"
                >
                  <Download size={11} />
                  MP4
                </a>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
