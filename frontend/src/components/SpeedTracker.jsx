import { useState } from 'react'
import { Gauge, Satellite, WifiOff, AlertTriangle } from 'lucide-react'
import { useGpsSpeed } from '../hooks/useGpsSpeed'

const MAX_SPEED = 120

export default function SpeedTracker({ speed = {}, driverId = 'DRV-001' }) {
  const [gpsEnabled, setGpsEnabled] = useState(false)
  const { gpsSpeed, gpsStatus, accuracy } = useGpsSpeed(driverId, gpsEnabled)

  // Prefer GPS speed if available, else use WS speed
  const current = gpsEnabled && gpsSpeed != null ? gpsSpeed : (speed.current ?? 0)
  const { max = 0, avg = 0, history = [] } = speed

  const angle = -135 + (Math.min(current, MAX_SPEED) / MAX_SPEED) * 270
  const speedColor = current > 80 ? '#ff3b3b' : current > 60 ? '#ffd700' : '#00ff88'
  const isOverspeed = current > 80

  return (
    <div className={`bg-sentinel-card border rounded-xl p-4 transition-all
      ${isOverspeed ? 'border-sentinel-red glow-red' : 'border-sentinel-border'}`}>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-xs text-sentinel-accent font-semibold tracking-widest uppercase">
          <Gauge size={14} />
          Speed Tracker
        </div>

        {/* GPS toggle */}
        <button
          onClick={() => setGpsEnabled(v => !v)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded border transition-colors
            ${gpsEnabled
              ? gpsStatus === 'watching' ? 'border-sentinel-green text-sentinel-green bg-sentinel-green/10'
              : gpsStatus === 'error' ? 'border-sentinel-red text-sentinel-red bg-sentinel-red/10'
              : 'border-sentinel-yellow text-sentinel-yellow bg-yellow-900/10'
              : 'border-sentinel-border text-gray-500 hover:border-sentinel-accent hover:text-sentinel-accent'}`}
        >
          <Satellite size={11} />
          {gpsEnabled
            ? gpsStatus === 'watching' ? `GPS LIVE${accuracy ? ` ±${accuracy}m` : ''}`
            : gpsStatus === 'error' ? 'GPS ERROR'
            : gpsStatus === 'unsupported' ? 'NO GPS'
            : 'GPS...'
            : 'Enable GPS'}
        </button>
      </div>

      {/* GPS info banner */}
      {gpsEnabled && gpsStatus === 'unsupported' && (
        <div className="mb-3 flex items-center gap-2 text-xs text-sentinel-yellow bg-yellow-900/10 border border-yellow-800/30 rounded px-3 py-2">
          <WifiOff size={12} />
          GPS not supported on this device. Using simulated speed data.
        </div>
      )}
      {gpsEnabled && gpsStatus === 'watching' && gpsSpeed === null && (
        <div className="mb-3 flex items-center gap-2 text-xs text-sentinel-accent bg-sentinel-accent/5 border border-sentinel-accent/20 rounded px-3 py-2">
          <Satellite size={12} className="animate-pulse" />
          Acquiring GPS signal... Move the device for best accuracy.
        </div>
      )}
      {!gpsEnabled && (
        <div className="mb-3 flex items-center gap-2 text-xs text-gray-500 bg-sentinel-bg border border-sentinel-border rounded px-3 py-2">
          <AlertTriangle size={12} />
          Enable GPS for real speed tracking via device location sensor.
        </div>
      )}

      <div className="flex items-center gap-6">
        {/* Speedometer dial */}
        <div className="relative w-36 h-24 flex-shrink-0">
          <svg viewBox="0 0 120 75" className="w-full h-full">
            {/* Danger zone arc (80–120) */}
            <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke="#1f2937" strokeWidth="10" strokeLinecap="round" />
            <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke="#ff3b3b22"
              strokeWidth="10" strokeLinecap="round"
              strokeDasharray="157" strokeDashoffset={157 - (40 / MAX_SPEED) * 157}
              style={{ strokeDashoffset: 157 * (1 - 40 / 120) }}
            />
            {/* Speed arc fill */}
            <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke={speedColor}
              strokeWidth="10" strokeLinecap="round"
              strokeDasharray="157"
              strokeDashoffset={157 - (Math.min(current, MAX_SPEED) / MAX_SPEED) * 157}
              style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease',
                       filter: `drop-shadow(0 0 5px ${speedColor})` }}
            />
            {/* Speed labels */}
            {[0, 40, 80, 120].map((v) => {
              const a = (-135 + (v / MAX_SPEED) * 270) * (Math.PI / 180)
              const tx = 60 + 36 * Math.cos(a)
              const ty = 65 + 36 * Math.sin(a)
              return <text key={v} x={tx} y={ty} textAnchor="middle" fontSize="6"
                fill={v >= 80 ? '#ff3b3b88' : '#374151'} dominantBaseline="middle">{v}</text>
            })}
            {/* Tick marks */}
            {[0, 20, 40, 60, 80, 100, 120].map((v) => {
              const a = (-135 + (v / MAX_SPEED) * 270) * (Math.PI / 180)
              const x1 = 60 + 44 * Math.cos(a), y1 = 65 + 44 * Math.sin(a)
              const x2 = 60 + 50 * Math.cos(a), y2 = 65 + 50 * Math.sin(a)
              return <line key={v} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={v >= 80 ? '#ff3b3b66' : '#374151'} strokeWidth="1.5" />
            })}
            {/* Needle */}
            <line x1="60" y1="65"
              x2={60 + 40 * Math.cos(angle * Math.PI / 180)}
              y2={65 + 40 * Math.sin(angle * Math.PI / 180)}
              stroke={speedColor} strokeWidth="2.5" strokeLinecap="round"
              style={{ transition: 'all 0.4s ease', filter: `drop-shadow(0 0 4px ${speedColor})` }}
            />
            <circle cx="60" cy="65" r="5" fill={speedColor}
              style={{ filter: `drop-shadow(0 0 4px ${speedColor})` }} />
          </svg>

          {/* Center readout */}
          <div className="absolute bottom-0 left-0 right-0 text-center leading-none">
            <span className="text-xl font-bold" style={{ color: speedColor }}>{current}</span>
            <span className="text-xs text-gray-500 ml-1">km/h</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 grid grid-cols-2 gap-2">
          <StatBox label="Current" value={`${current} km/h`} color={speedColor} />
          <StatBox label="Max" value={`${max} km/h`} color="#ff3b3b" />
          <StatBox label="Average" value={`${avg} km/h`} color="#00d4ff" />
          <StatBox
            label="Status"
            value={current > 80 ? '⚠ OVERSPEED' : current > 60 ? 'FAST' : 'NORMAL'}
            color={speedColor}
          />
        </div>
      </div>

      {/* Overspeed warning */}
      {isOverspeed && (
        <div className="mt-3 flex items-center gap-2 text-xs text-sentinel-red bg-sentinel-red/10 border border-sentinel-red/30 rounded px-3 py-2 pulse-red">
          <AlertTriangle size={12} />
          OVERSPEED ALERT — {current} km/h exceeds 80 km/h limit!
        </div>
      )}

      {/* Speed history chart */}
      {history.length > 1 && (
        <div className="mt-4">
          <p className="text-xs text-gray-600 mb-1 uppercase tracking-wider">Speed History (last 20 readings)</p>
          <div className="flex items-end gap-0.5 h-12 bg-sentinel-bg rounded p-1">
            {history.slice(-40).map((h, i) => {
              const pct = Math.min(h.speed / MAX_SPEED, 1)
              const col = h.speed > 80 ? '#ff3b3b' : h.speed > 60 ? '#ffd700' : '#00ff88'
              return (
                <div key={i} className="flex-1 rounded-sm transition-all duration-300 cursor-pointer"
                  style={{ height: `${Math.max(pct * 100, 4)}%`, backgroundColor: col, opacity: 0.75 }}
                  title={`${h.time}: ${h.speed} km/h`}
                />
              )
            })}
          </div>
          <div className="flex justify-between text-xs text-gray-700 mt-0.5">
            <span>0 km/h</span>
            <span className="text-sentinel-yellow">60</span>
            <span className="text-sentinel-red">80+</span>
          </div>
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, color }) {
  return (
    <div className="bg-sentinel-bg rounded-lg px-3 py-2 border border-sentinel-border">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-bold mt-0.5" style={{ color }}>{value}</p>
    </div>
  )
}
