import { AlertTriangle, Clock } from 'lucide-react'

const SEVERITY_STYLES = {
  critical: 'text-sentinel-red border-sentinel-red/30 bg-sentinel-red/5',
  warning: 'text-sentinel-yellow border-yellow-700/30 bg-yellow-900/10',
}

const TYPE_ICONS = {
  DROWSINESS: '😴',
  YAWNING: '🥱',
  HARSH_BRAKING: '🛑',
  HARSH_ACCELERATION: '🚀',
  SHARP_TURN: '↩️',
  OVERSPEED: '⚡',
}

export default function IncidentLog({ incidents = [] }) {
  return (
    <div className="bg-sentinel-card border border-sentinel-border rounded-xl flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-sentinel-border">
        <div className="flex items-center gap-2 text-xs text-sentinel-accent font-semibold tracking-widest uppercase">
          <AlertTriangle size={14} />
          Incident Log
        </div>
        <span className="text-xs text-gray-500">{incidents.length} events</span>
      </div>

      <div className="overflow-y-auto flex-1 max-h-72">
        {incidents.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-600 text-sm">
            No incidents recorded
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-sentinel-card">
              <tr className="text-gray-500 border-b border-sentinel-border">
                <th className="text-left px-4 py-2">Time</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Details</th>
                <th className="text-left px-4 py-2">Severity</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc, i) => (
                <tr
                  key={i}
                  className={`border-b border-sentinel-border/50 transition-all
                    ${i === 0 ? 'animate-pulse-once' : ''}`}
                >
                  <td className="px-4 py-2 text-gray-400 whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {inc.timestamp}
                    </span>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {TYPE_ICONS[inc.type] || '⚠'} {inc.type?.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-2 text-gray-400 max-w-xs truncate">{inc.message}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded border text-xs font-semibold uppercase tracking-wider
                      ${SEVERITY_STYLES[inc.severity] || 'text-gray-400'}`}>
                      {inc.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
