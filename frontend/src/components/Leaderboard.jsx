import { Trophy, Star, ChevronRight } from 'lucide-react'

export default function Leaderboard({ drivers = [], onDriverClick }) {
  const sorted = [...drivers].sort((a, b) => b.score - a.score)

  return (
    <div className="bg-sentinel-card border border-sentinel-border rounded-xl">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-sentinel-border text-xs text-sentinel-accent font-semibold tracking-widest uppercase">
        <Trophy size={14} />
        Fleet Leaderboard
      </div>

      <div className="divide-y divide-sentinel-border">
        {sorted.map((driver, i) => {
          const color = driver.score > 70 ? '#00ff88' : driver.score > 40 ? '#ffd700' : '#ff3b3b'
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`

          return (
            <button
              key={driver.id || driver.name}
              onClick={() => onDriverClick && onDriverClick(driver.id || driver.name)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-sentinel-bg/50 transition-colors text-left"
            >
              <span className="text-sm w-6 text-center flex-shrink-0">{medal}</span>
              <span className="text-lg flex-shrink-0">{driver.photo || '👤'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{driver.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500">{driver.incidents} incidents</span>
                  <span className="text-xs text-gray-600">·</span>
                  <div className="flex items-center gap-0.5">
                    <Star size={10} className="text-sentinel-yellow fill-sentinel-yellow" />
                    <span className="text-xs text-gray-400">{(driver.rating ?? 5).toFixed(1)}</span>
                  </div>
                  {driver.current_speed > 0 && (
                    <>
                      <span className="text-xs text-gray-600">·</span>
                      <span className="text-xs" style={{ color: driver.current_speed > 80 ? '#ff3b3b' : '#00d4ff' }}>
                        {driver.current_speed} km/h
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-16 bg-sentinel-border rounded-full h-1.5">
                  <div className="h-1.5 rounded-full transition-all duration-700"
                    style={{ width: `${driver.score}%`, backgroundColor: color }}
                  />
                </div>
                <span className="text-sm font-bold w-8 text-right" style={{ color }}>{driver.score}</span>
                <ChevronRight size={12} className="text-gray-600" />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
