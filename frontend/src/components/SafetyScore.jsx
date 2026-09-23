import { Shield } from 'lucide-react'

export default function SafetyScore({ score = 100 }) {
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  const color = score > 70 ? '#00ff88' : score > 40 ? '#ffd700' : '#ff3b3b'
  const label = score > 70 ? 'SAFE' : score > 40 ? 'CAUTION' : 'DANGER'

  return (
    <div className="bg-sentinel-card border border-sentinel-border rounded-xl p-5 flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 text-xs text-sentinel-accent font-semibold tracking-widest uppercase w-full">
        <Shield size={14} />
        Safety Score
      </div>

      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          {/* Track */}
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#1f2937" strokeWidth="10" />
          {/* Progress */}
          <circle
            cx="60" cy="60" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="score-ring"
            style={{ filter: `drop-shadow(0 0 8px ${color})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color }}>{score}</span>
          <span className="text-xs tracking-widest" style={{ color }}>{label}</span>
        </div>
      </div>

      {/* Score bar */}
      <div className="w-full bg-sentinel-border rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${score}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
        />
      </div>
    </div>
  )
}
