import { useState, useEffect } from 'react'
import { X, Star, MessageSquare, Send, AlertTriangle, FileText, TrendingUp } from 'lucide-react'

function StarRating({ rating }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star
          key={s}
          size={14}
          className={s <= Math.round(rating) ? 'text-sentinel-yellow fill-sentinel-yellow' : 'text-gray-600'}
        />
      ))}
      <span className="text-xs text-gray-400 ml-1">{rating.toFixed(1)}</span>
    </div>
  )
}

function RatingLabel({ rating }) {
  if (rating >= 4.5) return <span className="text-sentinel-green text-xs font-semibold">⭐ Excellent</span>
  if (rating >= 3.5) return <span className="text-sentinel-accent text-xs font-semibold">👍 Good</span>
  if (rating >= 2.5) return <span className="text-sentinel-yellow text-xs font-semibold">⚠ Average</span>
  return <span className="text-sentinel-red text-xs font-semibold">🚨 Poor</span>
}

export default function DriverProfile({ driver, token, onClose, onFeedbackSent }) {
  const [feedbackText, setFeedbackText] = useState('')
  const [sending, setSending] = useState(false)
  const [report, setReport] = useState(null)
  const [activeTab, setActiveTab] = useState('profile') // 'profile' | 'report'

  useEffect(() => {
    if (!driver?.id || !token) return
    fetch(`/api/drivers/${driver.id}/report`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => setReport(data))
      .catch(() => {})
  }, [driver?.id, token])

  if (!driver) return null

  const scoreColor = driver.score > 70 ? '#00ff88' : driver.score > 40 ? '#ffd700' : '#ff3b3b'

  const sendFeedback = async () => {
    if (!feedbackText.trim()) return
    setSending(true)
    try {
      await fetch(`/api/drivers/${driver.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: feedbackText }),
      })
      setFeedbackText('')
      if (onFeedbackSent) onFeedbackSent()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-sentinel-card border border-sentinel-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sentinel-border sticky top-0 bg-sentinel-card z-10">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{driver.photo}</span>
            <div>
              <h2 className="text-base font-bold text-white">{driver.name}</h2>
              <p className="text-xs text-gray-500">{driver.id} · {driver.vehicle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Tab switcher */}
            <div className="flex rounded-lg border border-sentinel-border overflow-hidden">
              {[
                { id: 'profile', icon: MessageSquare, label: 'Profile' },
                { id: 'report', icon: FileText, label: 'Report' },
              ].map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold transition-colors
                    ${activeTab === t.id ? 'bg-sentinel-accent/10 text-sentinel-accent' : 'text-gray-500 hover:text-gray-300'}`}>
                  <t.icon size={11} />{t.label}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors ml-1">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {activeTab === 'profile' && (<>
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            <InfoCard label="License" value={driver.license} />
            <InfoCard label="License Expiry" value={driver.license_expiry ?? '—'} />
            <InfoCard label="Age" value={`${driver.age} years`} />
            <InfoCard label="Experience" value={`${driver.experience_years ?? '—'} years`} />
            <InfoCard label="Phone" value={driver.phone} />
            <InfoCard label="Shift" value={driver.shift ?? '—'} />
            <InfoCard label="Address" value={driver.address ?? '—'} />
            <InfoCard label="Total Trips" value={driver.trips ?? 0} />
          </div>

          {/* Route & Bus info */}
          {(driver.route || driver.bus_info) && (
            <div className="bg-sentinel-bg rounded-xl border border-sentinel-border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                🚌 Assigned Bus & Route
              </p>
              <div className="grid grid-cols-2 gap-3">
                <InfoCard label="Route" value={driver.route ?? '—'} />
                <InfoCard label="Bus Number" value={driver.bus_info?.number ?? driver.vehicle} />
                <InfoCard label="Bus Type" value={driver.bus_info?.type ?? '—'} />
                <InfoCard label="Capacity" value={driver.bus_info?.capacity ? `${driver.bus_info.capacity} seats` : '—'} />
                <InfoCard label="Bus Year" value={driver.bus_info?.year ?? '—'} />
                <InfoCard label="Bus Status" value={driver.bus_info?.status ?? 'Active'} />
              </div>
            </div>
          )}

          {/* Performance */}
          <div className="bg-sentinel-bg rounded-xl border border-sentinel-border p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Performance Overview</p>
            <div className="grid grid-cols-3 gap-3">
              <PerfCard label="Safety Score" value={driver.score} color={scoreColor} suffix="/100" />
              <PerfCard label="Incidents" value={driver.incidents} color={driver.incidents > 5 ? '#ff3b3b' : '#00ff88'} />
              <PerfCard label="Speed Max" value={`${driver.speed_max ?? 0}`} color="#00d4ff" suffix=" km/h" />
            </div>

            {/* Score bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Safety Score</span>
                <span style={{ color: scoreColor }}>{driver.score}%</span>
              </div>
              <div className="w-full bg-sentinel-border rounded-full h-2">
                <div className="h-2 rounded-full transition-all duration-700"
                  style={{ width: `${driver.score}%`, backgroundColor: scoreColor, boxShadow: `0 0 8px ${scoreColor}` }}
                />
              </div>
            </div>
          </div>

          {/* Rating */}
          <div className="bg-sentinel-bg rounded-xl border border-sentinel-border p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Driver Rating</p>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <StarRating rating={driver.rating ?? 5} />
                <RatingLabel rating={driver.rating ?? 5} />
              </div>
              <div className="text-right">
                <p className="text-4xl font-bold" style={{ color: scoreColor }}>{(driver.rating ?? 5).toFixed(1)}</p>
                <p className="text-xs text-gray-500">out of 5.0</p>
              </div>
            </div>
          </div>

          {/* Feedback history */}
          {driver.feedback?.length > 0 && (
            <div className="bg-sentinel-bg rounded-xl border border-sentinel-border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                <MessageSquare size={12} /> Feedback History
              </p>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {driver.feedback.map((f, i) => (
                  <p key={i} className="text-xs text-gray-300 bg-sentinel-card rounded px-3 py-2 border border-sentinel-border">
                    {f}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Recent incidents */}
          {driver.incident_history?.length > 0 && (
            <div className="bg-sentinel-bg rounded-xl border border-sentinel-border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                <AlertTriangle size={12} /> Recent Incidents
              </p>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {driver.incident_history.slice(0, 8).map((inc, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded border
                    ${inc.severity === 'critical' ? 'border-sentinel-red/30 text-sentinel-red bg-sentinel-red/5' : 'border-yellow-800/30 text-sentinel-yellow bg-yellow-900/10'}`}>
                    <span className="text-gray-500">{inc.timestamp}</span>
                    <span>{inc.type?.replace(/_/g, ' ')}</span>
                    <span className="text-gray-400 truncate">— {inc.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add feedback */}
          <div className="bg-sentinel-bg rounded-xl border border-sentinel-border p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1">
              <Send size={12} /> Add Admin Feedback
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendFeedback()}
                placeholder="Write feedback for this driver..."
                className="flex-1 bg-sentinel-card border border-sentinel-border rounded-lg px-3 py-2
                  text-sm text-white placeholder-gray-600 focus:border-sentinel-accent focus:outline-none"
              />
              <button
                onClick={sendFeedback}
                disabled={sending || !feedbackText.trim()}
                className="px-4 py-2 rounded-lg bg-sentinel-accent/10 border border-sentinel-accent
                  text-sentinel-accent text-sm hover:bg-sentinel-accent/20 transition-colors disabled:opacity-40"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
          </>)}

          {/* ── REPORT TAB ── */}
          {activeTab === 'report' && (
            <DriverReport report={report} driver={driver} />
          )}
        </div>
      </div>
    </div>
  )
}

function InfoCard({ label, value }) {
  return (
    <div className="bg-sentinel-bg rounded-lg px-3 py-2 border border-sentinel-border">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-white mt-0.5">{value}</p>
    </div>
  )
}

function PerfCard({ label, value, color, suffix = '' }) {
  return (
    <div className="text-center bg-sentinel-card rounded-lg p-3 border border-sentinel-border">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold" style={{ color }}>{value}{suffix}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Driver Report
// ---------------------------------------------------------------------------
const INCIDENT_LABELS = {
  DROWSINESS: 'Drowsiness', YAWNING: 'Yawning', YAWN_WARN: 'Yawn Warning',
  HARSH_BRAKING: 'Harsh Braking', HARSH_ACCELERATION: 'Harsh Accel',
  SHARP_TURN: 'Sharp Turn', OVERSPEED: 'Overspeed',
}

function DriverReport({ report, driver }) {
  if (!report) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
        Loading report...
      </div>
    )
  }

  const scoreColor = report.current_score > 70 ? '#00ff88' : report.current_score > 40 ? '#ffd700' : '#ff3b3b'

  return (
    <div className="space-y-4">
      {/* Grade card */}
      <div className="flex items-center justify-between bg-sentinel-bg rounded-xl border border-sentinel-border p-5">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Performance Grade</p>
          <p className="text-5xl font-bold" style={{ color: report.grade_color }}>{report.grade}</p>
          <p className="text-xs text-gray-500 mt-1">{report.name} · {report.vehicle}</p>
        </div>
        <div className="text-right space-y-1">
          <p className="text-xs text-gray-500">Route</p>
          <p className="text-xs text-white">{report.route}</p>
          <p className="text-xs text-gray-500 mt-2">Shift</p>
          <p className="text-xs text-white">{report.shift}</p>
        </div>
      </div>

      {/* Speed stats */}
      <div className="bg-sentinel-bg rounded-xl border border-sentinel-border p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1">
          <TrendingUp size={12} /> Speed Analysis
        </p>
        <div className="grid grid-cols-3 gap-3">
          <ReportStat label="Avg Speed" value={`${report.avg_speed}`} unit="km/h" color="#00d4ff" />
          <ReportStat label="Max Speed" value={`${report.max_speed}`} unit="km/h"
            color={report.max_speed > 80 ? '#ff3b3b' : '#ffd700'} />
          <ReportStat label="Overspeed Events" value={report.overspeed_count} unit="times"
            color={report.overspeed_count > 0 ? '#ff3b3b' : '#00ff88'} />
        </div>
      </div>

      {/* Score stats */}
      <div className="bg-sentinel-bg rounded-xl border border-sentinel-border p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Score Summary</p>
        <div className="grid grid-cols-3 gap-3">
          <ReportStat label="Current Score" value={report.current_score} unit="/100" color={scoreColor} />
          <ReportStat label="Points Lost" value={report.points_lost} unit="pts"
            color={report.points_lost > 30 ? '#ff3b3b' : '#ffd700'} />
          <ReportStat label="Total Trips" value={report.trips} unit="trips" color="#00d4ff" />
        </div>

        {/* Score bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Avg Ride Score</span>
            <span style={{ color: scoreColor }}>{report.avg_ride_score}/100</span>
          </div>
          <div className="w-full bg-sentinel-border rounded-full h-2">
            <div className="h-2 rounded-full transition-all duration-700"
              style={{ width: `${report.avg_ride_score}%`, backgroundColor: scoreColor,
                       boxShadow: `0 0 6px ${scoreColor}` }} />
          </div>
        </div>
      </div>

      {/* Incident breakdown */}
      {Object.keys(report.incident_breakdown).length > 0 && (
        <div className="bg-sentinel-bg rounded-xl border border-sentinel-border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Incident Breakdown</p>
          <div className="space-y-2">
            {Object.entries(report.incident_breakdown).map(([type, count]) => {
              const maxCount = Math.max(...Object.values(report.incident_breakdown))
              const pct = (count / maxCount) * 100
              const color = type === 'OVERSPEED' || type === 'DROWSINESS' ? '#ff3b3b' : '#ffd700'
              return (
                <div key={type} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-32 flex-shrink-0">
                    {INCIDENT_LABELS[type] || type}
                  </span>
                  <div className="flex-1 bg-sentinel-border rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  <span className="text-xs font-bold w-6 text-right" style={{ color }}>{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent incidents */}
      {report.recent_incidents?.length > 0 && (
        <div className="bg-sentinel-bg rounded-xl border border-sentinel-border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1">
            <AlertTriangle size={12} /> Recent Incidents
          </p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {report.recent_incidents.map((inc, i) => (
              <div key={i} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded border
                ${inc.severity === 'critical'
                  ? 'border-sentinel-red/30 text-sentinel-red bg-sentinel-red/5'
                  : 'border-yellow-800/30 text-sentinel-yellow bg-yellow-900/10'}`}>
                <span className="text-gray-500 flex-shrink-0">{inc.timestamp}</span>
                <span className="font-semibold flex-shrink-0">{inc.type?.replace(/_/g, ' ')}</span>
                <span className="text-gray-400 truncate">— {inc.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ReportStat({ label, value, unit, color }) {
  return (
    <div className="text-center bg-sentinel-card rounded-lg p-3 border border-sentinel-border">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs text-gray-600">{unit}</p>
    </div>
  )
}
