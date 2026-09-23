import { useState } from 'react'
import { Gauge, Send, Zap } from 'lucide-react'

const PRESETS = [
  { label: 'Normal Drive', data: { acceleration: 2, braking: -1, lateral_g: 1, speed: 45 } },
  { label: 'Harsh Brake', data: { acceleration: 0, braking: -12, lateral_g: 0.5, speed: 60 } },
  { label: 'Overspeed', data: { acceleration: 5, braking: 0, lateral_g: 1, speed: 110 } },
  { label: 'Sharp Turn', data: { acceleration: 1, braking: -2, lateral_g: 9, speed: 55 } },
  { label: 'Reckless', data: { acceleration: 10, braking: -14, lateral_g: 10, speed: 120 } },
]

export default function RashDrivingPanel({ onAlert }) {
  const [form, setForm] = useState({ acceleration: 0, braking: 0, lateral_g: 0, speed: 0 })
  const [loading, setLoading] = useState(false)
  const [lastResult, setLastResult] = useState(null)

  const send = async (data) => {
    setLoading(true)
    try {
      const res = await fetch('/api/sensor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      setLastResult(json)
      if (json.alerts?.length > 0 && onAlert) onAlert(json.alerts)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-sentinel-card border border-sentinel-border rounded-xl">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-sentinel-border text-xs text-sentinel-accent font-semibold tracking-widest uppercase">
        <Gauge size={14} />
        Rash Driving Simulator
      </div>

      <div className="p-4 space-y-4">
        {/* Presets */}
        <div>
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Quick Presets</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => { setForm(p.data); send(p.data) }}
                className="px-3 py-1.5 text-xs rounded border border-sentinel-border hover:border-sentinel-accent
                  hover:text-sentinel-accent transition-colors bg-sentinel-bg"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Manual inputs */}
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(form).map(([key, val]) => (
            <div key={key}>
              <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">
                {key.replace(/_/g, ' ')}
              </label>
              <input
                type="number"
                value={val}
                onChange={e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-sentinel-bg border border-sentinel-border rounded px-3 py-1.5
                  text-sm text-white focus:border-sentinel-accent focus:outline-none"
              />
            </div>
          ))}
        </div>

        <button
          onClick={() => send(form)}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2 rounded
            bg-sentinel-accent/10 border border-sentinel-accent text-sentinel-accent
            hover:bg-sentinel-accent/20 transition-colors text-sm font-semibold"
        >
          <Send size={14} />
          {loading ? 'Sending...' : 'Send Sensor Data'}
        </button>

        {/* Result */}
        {lastResult && (
          <div className={`rounded p-3 text-xs border ${lastResult.alerts?.length > 0
            ? 'border-sentinel-red/40 bg-sentinel-red/5 text-sentinel-red'
            : 'border-green-800/40 bg-green-900/10 text-sentinel-green'}`}
          >
            {lastResult.alerts?.length > 0 ? (
              lastResult.alerts.map((a, i) => (
                <p key={i}><Zap size={10} className="inline mr-1" />{a.message}</p>
              ))
            ) : (
              <p>✓ No anomalies detected</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
