import { Brain, Clock, TrendingUp, AlertTriangle } from 'lucide-react'

const LEVEL_STYLES = {
  normal:   { color: '#00ff88', label: 'NORMAL',   bg: 'bg-green-900/10',  border: 'border-green-800/30' },
  mild:     { color: '#ffd700', label: 'MILD',     bg: 'bg-yellow-900/10', border: 'border-yellow-800/30' },
  medium:   { color: '#ff8c00', label: 'MEDIUM',   bg: 'bg-orange-900/10', border: 'border-orange-800/30' },
  critical: { color: '#ff3b3b', label: 'CRITICAL', bg: 'bg-red-900/10',    border: 'border-sentinel-red/40' },
}

export default function AIFatiguePanel({ ai = {} }) {
  const {
    fatigue_score = 0,
    alert_level = 'normal',
    prediction_minutes = null,
    components = {},
    drive_duration_min = 0,
    speed_variance = 0,
    zigzag_count = 0,
  } = ai

  const style = LEVEL_STYLES[alert_level] || LEVEL_STYLES.normal
  const circumference = 2 * Math.PI * 40
  const offset = circumference - (fatigue_score / 100) * circumference

  return (
    <div className={`bg-sentinel-card border rounded-xl p-4 ${style.border} ${style.bg}`}>
      <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase mb-4"
        style={{ color: style.color }}>
        <Brain size={14} />
        AI Fatigue Score
      </div>

      <div className="flex items-center gap-5">
        {/* Radial score */}
        <div className="relative w-24 h-24 flex-shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#1f2937" strokeWidth="10" />
            <circle cx="50" cy="50" r="40" fill="none"
              stroke={style.color} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.3s ease',
                       filter: `drop-shadow(0 0 6px ${style.color})` }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold" style={{ color: style.color }}>{fatigue_score}</span>
            <span className="text-xs font-bold tracking-wider" style={{ color: style.color }}>{style.label}</span>
          </div>
        </div>

        {/* Components */}
        <div className="flex-1 space-y-1.5">
          {[
            { label: 'Eyes',     val: components.eye     ?? 0, max: 100 },
            { label: 'Yawning',  val: components.yawn    ?? 0, max: 100 },
            { label: 'Head',     val: components.head    ?? 0, max: 100 },
            { label: 'Driving',  val: components.driving ?? 0, max: 100 },
            { label: 'Time Risk',val: components.time_risk?? 0, max: 100 },
          ].map(c => {
            const pct = Math.min(c.val, 100)
            const col = pct > 60 ? '#ff3b3b' : pct > 30 ? '#ffd700' : '#00ff88'
            return (
              <div key={c.label} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-16 flex-shrink-0">{c.label}</span>
                <div className="flex-1 bg-sentinel-border rounded-full h-1.5">
                  <div className="h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: col }} />
                </div>
                <span className="text-xs w-6 text-right" style={{ color: col }}>{Math.round(pct)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Prediction + stats row */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        <StatChip
          icon={<Clock size={11} />}
          label="Drive Time"
          value={`${Math.round(drive_duration_min)} min`}
          color={drive_duration_min > 120 ? '#ff3b3b' : '#00d4ff'}
        />
        <StatChip
          icon={<TrendingUp size={11} />}
          label="Speed Var."
          value={`±${speed_variance} km/h`}
          color={speed_variance > 8 ? '#ffd700' : '#00ff88'}
        />
        <StatChip
          icon={<AlertTriangle size={11} />}
          label="Zigzag"
          value={`${zigzag_count}x`}
          color={zigzag_count > 5 ? '#ff3b3b' : '#00ff88'}
        />
      </div>

      {/* Prediction banner */}
      {prediction_minutes !== null && (
        <div className={`mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded border
          ${prediction_minutes <= 5
            ? 'border-sentinel-red/40 bg-sentinel-red/10 text-sentinel-red'
            : prediction_minutes <= 15
            ? 'border-yellow-700/40 bg-yellow-900/10 text-sentinel-yellow'
            : 'border-sentinel-border text-gray-400'}`}>
          <Brain size={11} />
          {prediction_minutes === 0
            ? '🚨 Driver is critically fatigued NOW'
            : `🔮 AI predicts fatigue in ~${prediction_minutes} min — consider a break`}
        </div>
      )}
    </div>
  )
}

function StatChip({ icon, label, value, color }) {
  return (
    <div className="bg-sentinel-bg rounded-lg px-2 py-2 border border-sentinel-border text-center">
      <div className="flex items-center justify-center gap-1 text-gray-500 mb-1">{icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-xs font-bold" style={{ color }}>{value}</p>
    </div>
  )
}
