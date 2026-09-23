import { useEffect, useRef, useState, useCallback } from 'react'
import LoginPage from './components/LoginPage'
import DriverProfile from './components/DriverProfile'
import IncidentClips from './components/IncidentClips'
import SafeStops from './components/SafeStops'
import EmergencyCall from './components/EmergencyCall'
import SafetyScore from './components/SafetyScore'
import { useAlarm } from './hooks/useAlarm'
import {
  LayoutDashboard, Monitor, Bell, Users, BarChart2,
  FileText, Settings, LogOut, Radio, RefreshCw,
  Smartphone, BellOff, Camera, Eye, Brain, Mic,
  Shield, MapPin, Bus, AlertTriangle, TrendingUp,
  ChevronRight, Activity
} from 'lucide-react'

const WS_URL = 'ws://localhost:8000/ws/monitor'

// ── Fatigue trend history (last 40 readings) ──────────────────────────────
const MAX_TREND = 40

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('sd_token') || '')
  const [adminName, setAdminName] = useState(() => localStorage.getItem('sd_admin_name') || '')
  const [tokenChecked, setTokenChecked] = useState(false)

  // Validate stored token on mount
  useEffect(() => {
    const stored = localStorage.getItem('sd_token')
    if (!stored) { setTokenChecked(true); return }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${stored}` } })
      .then(r => {
        if (!r.ok) { localStorage.removeItem('sd_token'); localStorage.removeItem('sd_admin_name'); setToken('') }
        setTokenChecked(true)
      })
      .catch(() => setTokenChecked(true))
  }, [])

  const wsRef = useRef(null)
  const [wsStatus, setWsStatus] = useState('disconnected')

  const { startAlarm, stopAlarm, playWarnHorn } = useAlarm()
  const [fatigueActive, setFatigueActive] = useState(false)
  const [fatigueSeconds, setFatigueSeconds] = useState(0)
  const [yawnActive, setYawnActive] = useState(false)
  const [distractionActive, setDistractionActive] = useState(false)
  const alarmActiveRef = useRef(false)
  const hornPlayedRef = useRef(false)

  const [frame, setFrame] = useState(null)
  const [ear, setEar] = useState(0)
  const [mar, setMar] = useState(0)
  const [faceDetected, setFaceDetected] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [safetyScore, setSafetyScore] = useState(100)
  const [incidents, setIncidents] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [speed, setSpeed] = useState({})
  const [zone, setZone] = useState({ zone: 'unknown', label: 'Unknown Area', limit_kmh: 50, color: '#9ca3af' })
  const [aiData, setAiData] = useState({})
  // Default location: Vasna Keliya, Gujarat (village area near Rai University)
  const DEFAULT_LOCATION = { lat: 22.8171, lon: 72.4738 }
  const [gpsPosition, setGpsPosition] = useState(DEFAULT_LOCATION)

  // Zone areas with speed limits — driver selects manually
  const ZONE_OPTIONS = [
    { key: 'village',  label: '🌾 Village Area',  limit: 25,  color: '#ff9500' },
    { key: 'local',    label: '🏘️ Local Area',    limit: 30,  color: '#ffd700' },
    { key: 'city',     label: '🏙️ City Area',     limit: 50,  color: '#00ff88' },
    { key: 'highway',  label: '🛣️ Highway',       limit: 80,  color: '#00d4ff' },
  ]
  const [selectedZoneKey, setSelectedZoneKey] = useState('highway')
  const [fatigueTrend, setFatigueTrend] = useState([])
  const [calibrating, setCalibrating] = useState(true)
  const [calibPct, setCalibPct] = useState(0)
  const [engineOn, setEngineOn] = useState(false)
  const [noFaceWarning, setNoFaceWarning] = useState(false)
  const [noFaceCountdown, setNoFaceCountdown] = useState(null)
  const [speedReduction, setSpeedReduction] = useState({ speed_reduction_active: false, reduction_pct: 0, speed_limit_kmh: null })

  const [navTab, setNavTab] = useState('dashboard')
  const [selectedDriverId, setSelectedDriverId] = useState(null)
  const [selectedDriverData, setSelectedDriverData] = useState(null)
  const [alertCount, setAlertCount] = useState(0)
  const activeDriverId = 'DRV-001'

  // ── Auth ──────────────────────────────────────────────────────────────────
  const handleLogin = (tok, name) => { setToken(tok); setAdminName(name) }
  const logout = () => {
    localStorage.removeItem('sd_token'); localStorage.removeItem('sd_admin_name')
    setToken(''); wsRef.current?.close()
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'engine_state') {
        setEngineOn(data.engine_on)
        if (data.safety_score !== undefined) setSafetyScore(data.safety_score)
        if (data.leaderboard) setLeaderboard(data.leaderboard)
        return
      }
      if (data.type === 'frame') {
        setFrame(data.frame); setEar(data.ear); setMar(data.mar)
        setFaceDetected(data.face_detected); setAlerts(data.alerts || [])
        setSafetyScore(data.safety_score); setIncidents(data.incident_log || [])
        setLeaderboard(data.leaderboard || []); setSpeed(data.speed || {})
        if (data.zone) setZone(data.zone)
        setAiData(data.ai || {})
        setDistractionActive(data.distraction_active === true)
        setCalibrating(data.calibrating === true)
        setCalibPct(data.calib_pct ?? 100)
        setNoFaceWarning(data.no_face_warning === true)
        setNoFaceCountdown(data.face_detected ? null : (data.no_face_countdown ?? null))
        setSpeedReduction(data.speed_reduction || { speed_reduction_active: false, reduction_pct: 0, speed_limit_kmh: null })
        // If backend auto-shut the engine (no face 5s), reflect it
        if (data.auto_shutdown) setEngineOn(false)

        const isFatigued = data.fatigue_active === true
        setFatigueActive(isFatigued)
        setFatigueSeconds(data.fatigue_seconds ?? 0)
        if (isFatigued && !alarmActiveRef.current) { alarmActiveRef.current = true; startAlarm() }
        else if (!isFatigued && alarmActiveRef.current) { alarmActiveRef.current = false; stopAlarm() }

        const isYawning = data.yawn_active === true
        setYawnActive(isYawning)
        if (data.yawn_play_horn && !hornPlayedRef.current) { hornPlayedRef.current = true; playWarnHorn() }
        if (!isYawning) hornPlayedRef.current = false

        if ((data.alerts || []).length > 0) setAlertCount(c => c + 1)

        // Fatigue trend
        const score = data.ai?.fatigue_score ?? 0
        setFatigueTrend(prev => {
          const next = [...prev, { t: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }), v: score }]
          return next.slice(-MAX_TREND)
        })
      }
      if (data.type === 'sensor_alert') {
        setSafetyScore(data.safety_score); setIncidents(data.incident_log || [])
        setLeaderboard(data.leaderboard || []); setSpeed(data.speed || {})
        if (data.zone) setZone(data.zone)
      }
    } catch (e) { console.error(e) }
  }, [startAlarm, stopAlarm, playWarnHorn])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    setWsStatus('connecting')
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws
    ws.onopen = () => setWsStatus('connected')
    ws.onmessage = handleMessage
    ws.onclose = () => setWsStatus('disconnected')
    ws.onerror = () => setWsStatus('error')
  }, [handleMessage])

  useEffect(() => { if (token) connect(); return () => wsRef.current?.close() }, [token, connect])

  const openDriver = async (driverId) => {
    try {
      const res = await fetch(`/api/drivers/${driverId}`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) { setSelectedDriverData(await res.json()); setSelectedDriverId(driverId) }
    } catch (e) {}
  }

  const reset = async () => {
    await fetch('/api/reset', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    setSafetyScore(100); setIncidents([]); setAlerts([]); setAlertCount(0); setFatigueTrend([])
    setCalibrating(true); setCalibPct(0)
  }

  const recalibrate = async () => {
    await fetch('/api/recalibrate', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    setCalibrating(true); setCalibPct(0)
  }

  const toggleEngine = async () => {
    const endpoint = engineOn ? '/api/engine/stop' : '/api/engine/start'
    await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    setEngineOn(!engineOn)
    if (!engineOn) { setCalibrating(true); setCalibPct(0) }
  }

  if (!tokenChecked) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <div className="w-8 h-8 border-2 border-[#00d4ff] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading SentinelDrive...</span>
        </div>
      </div>
    )
  }
  if (!token) return <LoginPage onLogin={handleLogin} />

  const activeDriver = leaderboard.find(d => d.id === activeDriverId) || {}
  const fatigue = aiData.fatigue_score ?? 0
  const alertLevel = aiData.alert_level ?? 'normal'
  const predMin = aiData.prediction_minutes

  return (
    <div className="flex h-screen bg-[#0a0e1a] text-white overflow-hidden font-mono">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 bg-[#0d1117] border-r border-[#1f2937] flex flex-col">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-[#1f2937]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#00d4ff]/10 border border-[#00d4ff]/40 flex items-center justify-center">
              <Bus size={18} className="text-[#00d4ff]" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-wider text-white">SentinelDrive</p>
              <p className="text-xs text-gray-500">AI Safety System</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {[
            { id: 'dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'monitoring',  icon: Monitor,         label: 'Live Monitoring' },
            { id: 'alerts',      icon: Bell,            label: 'Alerts',    badge: alertCount > 0 ? alertCount : null },
            { id: 'drivers',     icon: Users,           label: 'Drivers' },
            { id: 'analytics',   icon: BarChart2,       label: 'Analytics' },
            { id: 'reports',     icon: FileText,        label: 'Reports' },
            { id: 'settings',    icon: Settings,        label: 'Settings' },
          ].map(item => (
            <button key={item.id} onClick={() => setNavTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all
                ${navTab === item.id
                  ? 'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
              <item.icon size={16} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge && (
                <span className="bg-[#ff3b3b] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* System status */}
        <div className="px-4 py-4 border-t border-[#1f2937]">
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">System Status</p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
            <span className="text-xs text-[#00ff88] font-semibold">All Systems</span>
          </div>
          <p className="text-xs text-[#00ff88]">Operational</p>
          <p className="text-xs text-gray-600 mt-1">Last updated: {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}</p>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-[#1f2937] bg-[#0d1117] flex-shrink-0">
          <div>
            <h1 className="text-base font-bold tracking-wide">Driver Fatigue Detection System</h1>
            <p className="text-xs text-gray-500">AI-Powered Driver Monitoring & Safety Alerts</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Live badge */}
            <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-semibold
              ${wsStatus === 'connected' ? 'border-[#00ff88]/30 text-[#00ff88] bg-[#00ff88]/5' : 'border-[#ff3b3b]/30 text-[#ff3b3b] bg-[#ff3b3b]/5'}`}>
              <span className={`w-2 h-2 rounded-full ${wsStatus === 'connected' ? 'bg-[#00ff88] animate-pulse' : 'bg-[#ff3b3b]'}`} />
              {wsStatus === 'connected' ? 'Live' : 'Offline'}
            </div>

            {/* Alert bell */}
            <button onClick={() => setNavTab('alerts')} className="relative text-gray-400 hover:text-white transition-colors">
              <Bell size={18} />
              {alertCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#ff3b3b] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              )}
            </button>

            {/* Driver mode */}
            <a href="/driver.html" target="_blank"
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/10 transition-colors">
              <Smartphone size={12} /> Driver Mode
            </a>

            {/* Recalibrate */}
            <button onClick={recalibrate}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-[#ffd700]/30 text-[#ffd700] hover:bg-[#ffd700]/10 transition-colors"
              title="Re-calibrate face detection for current driver">
              🎯 Recalibrate
            </button>

            {/* Engine Start/Stop */}
            <button onClick={toggleEngine}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-bold transition-all
                ${engineOn
                  ? 'border-[#ff3b3b]/50 text-[#ff3b3b] bg-[#ff3b3b]/10 hover:bg-[#ff3b3b]/20'
                  : 'border-[#00ff88]/50 text-[#00ff88] bg-[#00ff88]/10 hover:bg-[#00ff88]/20'}`}>
              {engineOn ? '🔴 Stop Engine' : '🟢 Start Engine'}
            </button>

            {/* Admin */}
            <div className="flex items-center gap-2 pl-3 border-l border-[#1f2937]">
              <div className="w-8 h-8 rounded-full bg-[#1f2937] border border-[#374151] flex items-center justify-center text-sm">👤</div>
              <div>
                <p className="text-xs font-semibold text-white">{adminName}</p>
                <p className="text-xs text-gray-500">Admin</p>
              </div>
              <button onClick={logout} className="text-gray-600 hover:text-[#ff3b3b] transition-colors ml-1">
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4">

          {/* ── DASHBOARD TAB ─────────────────────────────────────────── */}
          {navTab === 'dashboard' && (
            <DashboardView
              frame={frame} ear={ear} mar={mar} faceDetected={faceDetected}
              alerts={alerts} safetyScore={safetyScore} incidents={incidents}
              leaderboard={leaderboard} speed={speed} aiData={aiData}
              fatigueActive={fatigueActive} fatigueSeconds={fatigueSeconds}
              yawnActive={yawnActive} distractionActive={distractionActive}
              fatigueTrend={fatigueTrend} gpsPosition={gpsPosition}
              token={token} activeDriverId={activeDriverId}
              onDriverClick={openDriver} onReset={reset}
              stopAlarm={stopAlarm} alarmActiveRef={alarmActiveRef}
              calibrating={calibrating} calibPct={calibPct}
              engineOn={engineOn} onToggleEngine={toggleEngine}
              noFaceWarning={noFaceWarning} noFaceCountdown={noFaceCountdown}
              speedReduction={speedReduction}
              zone={zone}
              onSetGpsPosition={setGpsPosition}
              selectedZoneKey={selectedZoneKey}
              onZoneChange={setSelectedZoneKey}
              zoneOptions={ZONE_OPTIONS}
            />
          )}

          {/* ── LIVE MONITORING TAB ───────────────────────────────────── */}
          {navTab === 'monitoring' && (
            <MonitoringView
              frame={frame} ear={ear} mar={mar} faceDetected={faceDetected}
              alerts={alerts} fatigueActive={fatigueActive} yawnActive={yawnActive}
              distractionActive={distractionActive} calibrating={calibrating} calibPct={calibPct}
              aiData={aiData} incidents={incidents} safetyScore={safetyScore}
              stopAlarm={stopAlarm} alarmActiveRef={alarmActiveRef}
            />
          )}

          {/* ── ALERTS TAB ────────────────────────────────────────────── */}
          {navTab === 'alerts' && (
            <AlertsView incidents={incidents} onClear={() => { setAlertCount(0) }} />
          )}

          {/* ── DRIVERS TAB ───────────────────────────────────────────── */}
          {navTab === 'drivers' && (
            <DriversView drivers={leaderboard} onDriverClick={openDriver} />
          )}

          {/* ── ANALYTICS TAB ─────────────────────────────────────────── */}
          {navTab === 'analytics' && (
            <AnalyticsView fatigueTrend={fatigueTrend} leaderboard={leaderboard} incidents={incidents} />
          )}

          {/* ── REPORTS TAB ───────────────────────────────────────────── */}
          {navTab === 'reports' && (
            <ReportsView token={token} />
          )}

          {/* ── SETTINGS TAB ──────────────────────────────────────────── */}
          {navTab === 'settings' && (
            <SettingsView onReset={reset} wsStatus={wsStatus} />
          )}
        </main>
      </div>

      {/* Modals */}
      {selectedDriverId && selectedDriverData && (
        <DriverProfile driver={selectedDriverData} token={token}
          onClose={() => { setSelectedDriverId(null); setSelectedDriverData(null) }}
          onFeedbackSent={() => openDriver(selectedDriverId)} />
      )}
      <EmergencyCall fatigueSeconds={fatigueSeconds} fatigueActive={fatigueActive}
        driverName={leaderboard.find(d => d.id === activeDriverId)?.name || 'Driver'}
        gpsPosition={gpsPosition} />
    </div>
  )
}

// ── Dashboard View ────────────────────────────────────────────────────────
function DashboardView({
  frame, ear, mar, faceDetected, alerts, safetyScore, incidents,
  leaderboard, speed, aiData, fatigueActive, fatigueSeconds,
  yawnActive, distractionActive, fatigueTrend, gpsPosition,
  token, activeDriverId, onDriverClick, onReset, stopAlarm, alarmActiveRef,
  calibrating, calibPct,
  engineOn, onToggleEngine, noFaceWarning, noFaceCountdown, speedReduction,
  zone, onSetGpsPosition, selectedZoneKey, onZoneChange, zoneOptions
}) {
  const fatigue = aiData.fatigue_score ?? 0
  const alertLevel = aiData.alert_level ?? 'normal'
  const components = aiData.components ?? {}
  const eyeClosure = ear > 0 ? Math.round((1 - ear / 0.35) * 100) : 0
  const activeDriver = leaderboard.find(d => d.id === activeDriverId) || {}
  const activeAlert = fatigueActive ? { title: 'EARLY FATIGUE DETECTED', msg: 'Driver showing signs of fatigue. Stay alert and take a break soon.', color: '#ff3b3b' }
    : yawnActive ? { title: 'YAWNING DETECTED', msg: 'Driver is yawning. Score is dropping.', color: '#ffd700' }
    : distractionActive ? { title: 'PHONE USAGE DETECTED', msg: 'Driver not looking at road.', color: '#00d4ff' }
    : null

  const scoreColor = safetyScore > 70 ? '#00ff88' : safetyScore > 40 ? '#ffd700' : '#ff3b3b'
  const fatigueColor = fatigue > 60 ? '#ff3b3b' : fatigue > 30 ? '#ffd700' : '#00ff88'
  const fatigueLabel = fatigue > 60 ? 'HIGH RISK' : fatigue > 30 ? 'MODERATE' : 'NORMAL'

  // Engine off screen
  if (!engineOn) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
        <div className="w-24 h-24 rounded-full bg-[#1f2937] border-2 border-[#374151] flex items-center justify-center text-5xl">
          🔴
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-300 mb-2">Engine Stopped</p>
          <p className="text-sm text-gray-500">Face scanning is inactive. Start the engine to begin monitoring.</p>
        </div>
        <button onClick={onToggleEngine}
          className="flex items-center gap-3 px-8 py-4 rounded-2xl border-2 border-[#00ff88]/60 text-[#00ff88] bg-[#00ff88]/10 hover:bg-[#00ff88]/20 transition-all text-lg font-bold">
          🟢 Start Engine
        </button>
        <p className="text-xs text-gray-600">Starting engine will activate camera and begin face detection</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Night mode banner */}
      {/* No-face warning banner — shows countdown as soon as face disappears */}
      {noFaceCountdown !== null && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 animate-pulse
          ${noFaceCountdown <= 5 ? 'border-[#ff3b3b]/60 bg-[#ff3b3b]/10' : 'border-[#ffd700]/60 bg-[#ffd700]/10'}`}>
          <span className="text-2xl">{noFaceCountdown <= 5 ? '🚨' : '⚠️'}</span>
          <div className="flex-1">
            <p className={`text-sm font-bold ${noFaceCountdown <= 5 ? 'text-[#ff3b3b]' : 'text-[#ffd700]'}`}>
              No Driver Detected!
            </p>
            <p className="text-xs text-gray-300">
              Engine auto-stops in <span className={`font-bold ${noFaceCountdown <= 5 ? 'text-[#ff3b3b]' : 'text-[#ffd700]'}`}>{noFaceCountdown}s</span> — please sit in front of the camera
            </p>
          </div>
          <span className={`text-2xl font-black ${noFaceCountdown <= 5 ? 'text-[#ff3b3b]' : 'text-[#ffd700]'}`}>
            {noFaceCountdown}s
          </span>
        </div>
      )}

      {/* Zone speed selector + live speed alert */}
      {(() => {
        const sel = zoneOptions?.find(z => z.key === selectedZoneKey) || zoneOptions?.[0]
        const curSpeed = speed?.current ?? 0
        const isOver = curSpeed > (sel?.limit ?? 25)
        return sel ? (
          <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all
            ${isOver ? 'border-[#ff3b3b]/70 bg-[#ff3b3b]/8 animate-pulse' : 'border-[#1f2937] bg-[#0d1117]'}`}>
            <span className="text-xl flex-shrink-0">{sel.label.split(' ')[0]}</span>
            <div className="flex-1 flex items-center gap-3 flex-wrap">
              {/* Dropdown */}
              <select
                value={selectedZoneKey}
                onChange={e => onZoneChange(e.target.value)}
                className="bg-[#111827] border border-[#374151] text-white text-xs rounded-lg px-2 py-1.5 outline-none cursor-pointer"
                style={{ color: sel.color }}>
                {zoneOptions.map(z => (
                  <option key={z.key} value={z.key} style={{ color: z.color }}>
                    {z.label} — max {z.limit} km/h
                  </option>
                ))}
              </select>
              <span className="text-xs text-gray-500">
                Speed limit: <span className="font-bold" style={{ color: sel.color }}>{sel.limit} km/h</span>
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
              <span className="text-lg font-black" style={{ color: isOver ? '#ff3b3b' : '#00ff88' }}>
                {curSpeed} <span className="text-xs font-normal text-gray-500">km/h</span>
              </span>
              {isOver ? (
                <span className="text-xs font-bold text-[#ff3b3b]">
                  ⚠ Slow down! +{Math.round(curSpeed - sel.limit)} over
                </span>
              ) : (
                <span className="text-xs text-[#00ff88]">✓ Within limit</span>
              )}
            </div>
          </div>
        ) : null
      })()}

      {/* Speed reduction banner */}
      {speedReduction?.speed_reduction_active && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-[#ffd700]/60 bg-[#ffd700]/10">
          <span className="text-2xl">🚨</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-[#ffd700]">AUTO SPEED REDUCTION ACTIVE</p>
            <p className="text-xs text-gray-300">Driver unresponsive — speed reduced by <span className="font-bold text-[#ffd700]">{speedReduction.reduction_pct}%</span> · Limit: <span className="font-bold text-[#ffd700]">{speedReduction.speed_limit_kmh} km/h</span></p>
          </div>
          <span className="text-xs font-bold text-[#ffd700] border border-[#ffd700]/40 px-2 py-1 rounded">INTERVENING</span>
        </div>
      )}

      {/* Calibration banner */}
      {calibrating && (
        <div className="flex items-center gap-4 px-4 py-3 rounded-xl border border-[#00d4ff]/30 bg-[#00d4ff]/5">
          <span className="text-xl">🎯</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-[#00d4ff]">Calibrating face detection for this driver...</p>
            <p className="text-xs text-gray-400 mb-2">Look straight at the camera with eyes open and mouth closed</p>
            <div className="w-full bg-[#1f2937] rounded-full h-2">
              <div className="h-2 rounded-full bg-[#00d4ff] transition-all duration-300"
                style={{ width: `${calibPct}%`, boxShadow: '0 0 8px #00d4ff' }} />
            </div>
          </div>
          <span className="text-sm font-bold text-[#00d4ff]">{calibPct}%</span>
        </div>
      )}

      {/* Row 1: Feed + Driver Status + Active Alert */}
      <div className="grid grid-cols-12 gap-4">

        {/* Live Driver Feed */}
        <div className="col-span-12 lg:col-span-5 bg-[#0d1117] border border-[#1f2937] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1f2937]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
              <span className="text-xs font-semibold text-white">Live Driver Feed</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <Camera size={13} />
              <span className="text-xs">Camera 01 - Live</span>
            </div>
          </div>
          <div className="relative aspect-video bg-black">
            {frame ? (
              <img src={`data:image/jpeg;base64,${frame}`} alt="feed" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
                <Camera size={32} />
                <span className="text-sm">Connecting to camera...</span>
              </div>
            )}
            {fatigueActive && <div className="absolute inset-0 border-4 border-[#ff3b3b] animate-pulse pointer-events-none" />}
            {/* EAR/MAR overlay */}
            {frame && (
              <div className="absolute bottom-2 left-2 flex gap-2">
                <span className={`text-xs px-2 py-0.5 rounded border font-mono ${ear < 0.25 ? 'border-[#ff3b3b] text-[#ff3b3b] bg-[#ff3b3b]/10' : 'border-[#1f2937] text-[#00d4ff] bg-black/60'}`}>EAR {ear.toFixed(3)}</span>
                <span className={`text-xs px-2 py-0.5 rounded border font-mono ${mar > 0.75 ? 'border-[#ffd700] text-[#ffd700] bg-[#ffd700]/10' : 'border-[#1f2937] text-[#00d4ff] bg-black/60'}`}>MAR {mar.toFixed(3)}</span>
              </div>
            )}
            {/* Speed overlay — top right of feed */}
            {frame && (
              <div className={`absolute top-2 right-2 flex flex-col items-end gap-1`}>
                <span className={`text-lg font-black px-3 py-1 rounded-lg border font-mono
                  ${(speed?.current ?? 0) > 80 ? 'border-[#ff3b3b] text-[#ff3b3b] bg-black/80' :
                    (speed?.current ?? 0) > 60 ? 'border-[#ffd700] text-[#ffd700] bg-black/80' :
                    'border-[#00ff88]/40 text-[#00ff88] bg-black/70'}`}>
                  {speed?.current ?? 0} <span className="text-xs font-normal">km/h</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Driver Status */}
        <div className="col-span-12 lg:col-span-4 bg-[#0d1117] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Driver Status</p>

          {/* Fatigue + Safety Score rings side by side */}
          <div className="flex justify-around items-center mb-4">
            {/* Fatigue ring */}
            <div className="flex flex-col items-center">
              <div className="relative w-24 h-24">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#1f2937" strokeWidth="10" />
                  <circle cx="50" cy="50" r="42" fill="none" stroke={fatigueColor} strokeWidth="10"
                    strokeLinecap="round" strokeDasharray={264}
                    strokeDashoffset={264 - (fatigue / 100) * 264}
                    style={{ transition: 'all 0.8s ease', filter: `drop-shadow(0 0 6px ${fatigueColor})` }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold" style={{ color: fatigueColor }}>{Math.round(fatigue)}</span>
                  <span className="text-xs text-gray-500">Fatigue</span>
                </div>
              </div>
              <p className="text-xs font-bold mt-1" style={{ color: fatigueColor }}>{fatigueLabel}</p>
            </div>

            {/* Safety Score ring */}
            <div className="flex flex-col items-center">
              <div className="relative w-24 h-24">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#1f2937" strokeWidth="10" />
                  <circle cx="50" cy="50" r="42" fill="none" stroke={scoreColor} strokeWidth="10"
                    strokeLinecap="round" strokeDasharray={264}
                    strokeDashoffset={264 - (safetyScore / 100) * 264}
                    style={{ transition: 'all 0.8s ease', filter: `drop-shadow(0 0 6px ${scoreColor})` }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold" style={{ color: scoreColor }}>{safetyScore}</span>
                  <span className="text-xs text-gray-500">Safety</span>
                </div>
              </div>
              <p className="text-xs font-bold mt-1" style={{ color: scoreColor }}>
                {safetyScore > 70 ? 'SAFE' : safetyScore > 40 ? 'CAUTION' : 'DANGER'}
              </p>
            </div>
          </div>

          <p className="text-xs text-center text-gray-500 mb-3">
            {fatigueActive ? '⚠ Driver is Drowsy' : yawnActive ? '🥱 Yawning Detected' : '✓ Driver is Alert'}
          </p>

          {/* Stats */}
          <div className="space-y-2">
            <StatRow icon="👁️" label="Eye Closure" value={`${Math.min(eyeClosure, 100)}%`}
              color={eyeClosure > 50 ? '#ff3b3b' : '#00ff88'} bar={eyeClosure} />
            <StatRow icon="🕐" label="Driving Time"
              value={`${String(Math.floor((aiData.drive_duration_min ?? 0) / 60)).padStart(2,'0')}:${String(Math.round((aiData.drive_duration_min ?? 0) % 60)).padStart(2,'0')}:00`}
              color="#00d4ff" />
          </div>
        </div>

        {/* Right column: Active Alert + Live Location + Phone Usage */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-3">
          {/* Active Alert */}
          <div className={`rounded-xl border p-3 ${activeAlert ? 'border-[#ff3b3b]/40 bg-[#ff3b3b]/5' : 'border-[#1f2937] bg-[#0d1117]'}`}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={13} className={activeAlert ? 'text-[#ff3b3b]' : 'text-gray-600'} />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Active Alert</span>
            </div>
            {activeAlert ? (
              <>
                <p className="text-xs font-bold mb-1" style={{ color: activeAlert.color }}>{activeAlert.title}</p>
                <p className="text-xs text-gray-400 leading-relaxed">{activeAlert.msg}</p>
                <p className="text-xs text-gray-600 mt-1">{new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}</p>
                {fatigueActive && (
                  <button onClick={() => { stopAlarm(); alarmActiveRef.current = false }}
                    className="mt-2 w-full text-xs py-1.5 rounded border border-[#ff3b3b]/40 text-[#ff3b3b] hover:bg-[#ff3b3b]/10 transition-colors">
                    Silence Alarm
                  </button>
                )}
              </>
            ) : (
              <p className="text-xs text-[#00ff88]">✓ No active alerts</p>
            )}
          </div>

          {/* Live Location */}
          <div className="rounded-xl border border-[#1f2937] bg-[#0d1117] p-3 flex-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <MapPin size={13} className="text-[#00d4ff]" />
                <span className="text-xs font-semibold text-white">Live Location</span>
              </div>
              <span className="text-xs text-[#00ff88] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
                GPS Active
              </span>
            </div>
            <div className="rounded-lg bg-[#111827] border border-[#1f2937] h-20 flex items-center justify-center mb-2 relative overflow-hidden">
              <div className="absolute inset-0 opacity-20"
                style={{ backgroundImage: 'linear-gradient(#00d4ff 1px,transparent 1px),linear-gradient(90deg,#00d4ff 1px,transparent 1px)', backgroundSize: '20px 20px' }} />
              <div className="relative flex flex-col items-center gap-1">
                <Bus size={20} className="text-[#00d4ff]" />
                <span className="text-xs text-[#00d4ff]">
                  {gpsPosition ? `${gpsPosition.lat.toFixed(5)}, ${gpsPosition.lon.toFixed(5)}` : 'Requesting location...'}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-2">Route: {activeDriver.route?.split('—')[1]?.trim() || 'Naroda → Maninagar'}</p>
            {gpsPosition ? (
              <a href={`https://www.google.com/maps/@${gpsPosition.lat},${gpsPosition.lon},17z`}
                target="_blank" rel="noreferrer"
                className="w-full flex items-center justify-between text-xs text-[#00d4ff] hover:text-white transition-colors py-1.5 px-2 rounded border border-[#00d4ff]/20 hover:bg-[#00d4ff]/10">
                <span>🗺️ View on Google Maps</span><ChevronRight size={12} />
              </a>
            ) : (
              <p className="text-xs text-[#ffd700] text-center py-1">⏳ Allow location in browser to enable map</p>
            )}
          </div>

          {/* Phone Usage */}
          <div className={`rounded-xl border p-3 ${distractionActive ? 'border-[#00d4ff]/40 bg-[#00d4ff]/5' : 'border-[#1f2937] bg-[#0d1117]'}`}>
            <div className="flex items-center gap-2 mb-1">
              <Smartphone size={13} className={distractionActive ? 'text-[#00d4ff]' : 'text-gray-600'} />
              <span className="text-xs font-semibold text-white">Phone Usage</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${distractionActive ? 'bg-[#ff3b3b] animate-pulse' : 'bg-[#00ff88]'}`} />
              <span className={`text-xs font-bold ${distractionActive ? 'text-[#ff3b3b]' : 'text-[#00ff88]'}`}>
                {distractionActive ? 'DETECTED' : 'NOT DETECTED'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Status: {distractionActive ? 'Driver distracted' : 'Clear'}</p>
          </div>
        </div>
      </div>

      {/* Row 2: Status cards */}
      <div className="grid grid-cols-5 gap-3">
        <StatusCard icon={<Eye size={22} />} label="Eye Status"
          value={ear < 0.25 && faceDetected ? 'CLOSED' : 'OPEN'}
          sub={`Blink Rate: ${faceDetected ? '15/min' : '—'}`}
          color={ear < 0.25 && faceDetected ? '#ff3b3b' : '#00ff88'} />
        <StatusCard icon={<span className="text-2xl">🧍</span>} label="Head Pose"
          value={distractionActive ? 'DISTRACTED' : 'NORMAL'}
          sub="Position: Center"
          color={distractionActive ? '#ff3b3b' : '#00ff88'} />
        <StatusCard icon={<span className="text-2xl">😮</span>} label="Yawning"
          value={yawnActive ? 'DETECTED' : 'NOT DETECTED'}
          sub={`Status: ${yawnActive ? 'Fatigue' : 'Clear'}`}
          color={yawnActive ? '#ffd700' : '#00ff88'} />
        <StatusCard icon={<Shield size={22} />} label="Safety Score"
          value={`${safetyScore}/100`}
          sub={safetyScore > 70 ? 'Status: Good' : safetyScore > 40 ? 'Status: Caution' : 'Status: Critical'}
          color={scoreColor} />
        <StatusCard
          icon={<span className="text-2xl">🚌</span>}
          label="Vehicle Speed"
          value={`${speed?.current ?? 0} km/h`}
          sub={`Limit: ${zoneOptions?.find(z => z.key === selectedZoneKey)?.limit ?? 25} km/h · ${zoneOptions?.find(z => z.key === selectedZoneKey)?.label?.replace(/^.+ /, '') ?? 'Village Area'}`}
          color={(speed?.current ?? 0) > (zoneOptions?.find(z => z.key === selectedZoneKey)?.limit ?? 25) ? '#ff3b3b' : '#00ff88'} />
      </div>

      {/* Row 3: Fatigue Trend + Recent Alerts + Fleet Overview */}
      <div className="grid grid-cols-12 gap-4">
        {/* Fatigue Trend */}
        <div className="col-span-12 lg:col-span-5 bg-[#0d1117] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs font-semibold text-white mb-3">Fatigue Trend (Today)</p>
          <FatigueTrendChart data={fatigueTrend} />
        </div>

        {/* Recent Alerts */}
        <div className="col-span-12 lg:col-span-4 bg-[#0d1117] border border-[#1f2937] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-white">Recent Alerts</p>
            <button className="text-xs text-[#00d4ff] hover:text-white transition-colors">View All</button>
          </div>
          <div className="space-y-2 max-h-44 overflow-y-auto">
            {incidents.slice(0, 10).map((inc, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-[#1f2937]/50">
                <span className="text-xs text-gray-500 flex-shrink-0 w-12">{inc.timestamp}</span>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold truncate ${inc.severity === 'critical' ? 'text-[#ff3b3b]' : 'text-[#ffd700]'}`}>
                    {inc.type?.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{inc.driver_name} · {inc.message?.slice(0, 40)}</p>
                </div>
              </div>
            ))}
            {incidents.length === 0 && <p className="text-xs text-gray-600 text-center py-4">No recent alerts</p>}
          </div>
        </div>

        {/* Fleet Overview */}
        <div className="col-span-12 lg:col-span-3 bg-[#0d1117] border border-[#1f2937] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-white">Fleet Overview</p>
            <button className="text-xs text-[#00d4ff] hover:text-white transition-colors">View Report</button>
          </div>
          <FleetOverview leaderboard={leaderboard} onDriverClick={onDriverClick} />
        </div>
      </div>

      {/* Row 4: Incident Recordings + Safe Stops */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6">
          <IncidentClips token={token} />
        </div>
        <div className="col-span-12 lg:col-span-6">
          <SafeStops token={token} driverId={activeDriverId} visible={true} />
        </div>
      </div>
    </div>
  )
}

function StatRow({ icon, label, value, color, bar }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#1f2937]/50">
      <div className="flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {bar !== undefined && (
          <div className="w-16 bg-[#1f2937] rounded-full h-1">
            <div className="h-1 rounded-full" style={{ width: `${Math.min(bar, 100)}%`, backgroundColor: color }} />
          </div>
        )}
        <span className="text-xs font-bold" style={{ color }}>{value}</span>
      </div>
    </div>
  )
}

function StatusCard({ icon, label, value, sub, color }) {
  return (
    <div className="bg-[#0d1117] border border-[#1f2937] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color }} className="opacity-80">{icon}</span>
        <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-bold mb-1" style={{ color }}>{value}</p>
      <p className="text-xs text-gray-500">{sub}</p>
    </div>
  )
}

function FatigueTrendChart({ data }) {
  if (data.length < 2) {
    return (
      <div className="h-32 flex items-center justify-center text-xs text-gray-600">
        Collecting data...
      </div>
    )
  }
  const w = 400, h = 120, pad = 10
  const maxV = 100
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2)
    const y = h - pad - (d.v / maxV) * (h - pad * 2)
    return `${x},${y}`
  })
  const polyline = pts.join(' ')
  const lastPt = pts[pts.length - 1]?.split(',')
  const lastVal = data[data.length - 1]?.v ?? 0
  const lineColor = lastVal > 60 ? '#ff3b3b' : lastVal > 30 ? '#ffd700' : '#00ff88'

  // Gradient fill
  const fillPts = `${pad},${h - pad} ${polyline} ${w - pad},${h - pad}`

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32">
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(v => {
          const y = h - pad - (v / maxV) * (h - pad * 2)
          return <line key={v} x1={pad} y1={y} x2={w - pad} y2={y} stroke="#1f2937" strokeWidth="1" />
        })}
        {/* Y labels */}
        {[0, 50, 100].map(v => {
          const y = h - pad - (v / maxV) * (h - pad * 2)
          return <text key={v} x={pad - 2} y={y + 3} fontSize="8" fill="#4b5563" textAnchor="end">{v}</text>
        })}
        {/* Fill */}
        <polygon points={fillPts} fill="url(#trendGrad)" />
        {/* Line */}
        <polyline points={polyline} fill="none" stroke={lineColor} strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${lineColor})` }} />
        {/* Last point dot */}
        {lastPt && (
          <>
            <circle cx={lastPt[0]} cy={lastPt[1]} r="4" fill={lineColor}
              style={{ filter: `drop-shadow(0 0 4px ${lineColor})` }} />
            <text x={parseFloat(lastPt[0]) + 6} y={parseFloat(lastPt[1]) + 3}
              fontSize="9" fill={lineColor} fontWeight="bold">{Math.round(lastVal)}</text>
          </>
        )}
      </svg>
      {/* X labels */}
      <div className="flex justify-between text-xs text-gray-600 px-2 -mt-1">
        {[data[0], data[Math.floor(data.length / 4)], data[Math.floor(data.length / 2)],
          data[Math.floor(data.length * 3 / 4)], data[data.length - 1]]
          .filter(Boolean).map((d, i) => <span key={i}>{d.t}</span>)}
      </div>
    </div>
  )
}

function FleetOverview({ leaderboard, onDriverClick }) {
  const total = leaderboard.length || 6
  const active = leaderboard.filter(d => d.score > 40).length
  const inactive = leaderboard.filter(d => d.score <= 40 && d.score > 0).length
  const maintenance = total - active - inactive

  const circumference = 2 * Math.PI * 36
  const activeArc = (active / total) * circumference
  const inactiveArc = (inactive / total) * circumference

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Donut */}
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="36" fill="none" stroke="#1f2937" strokeWidth="10" />
          <circle cx="40" cy="40" r="36" fill="none" stroke="#00ff88" strokeWidth="10"
            strokeDasharray={`${activeArc} ${circumference}`} strokeLinecap="round" />
          <circle cx="40" cy="40" r="36" fill="none" stroke="#ffd700" strokeWidth="10"
            strokeDasharray={`${inactiveArc} ${circumference - activeArc}`}
            strokeDashoffset={-activeArc} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-white">{total}</span>
          <span className="text-xs text-gray-500">Total Buses</span>
        </div>
      </div>
      <div className="w-full space-y-1.5">
        <LegendRow color="#00ff88" label="Active" count={active} />
        <LegendRow color="#ffd700" label="Inactive" count={inactive} />
        <LegendRow color="#ff3b3b" label="In Maintenance" count={Math.max(0, maintenance)} />
      </div>
    </div>
  )
}

function LegendRow({ color, label, count }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-gray-400">{count} {label}</span>
      </div>
    </div>
  )
}

// ── Alerts View ───────────────────────────────────────────────────────────
function AlertsView({ incidents, onClear }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">All Alerts</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#1f2937] text-gray-400">
            {incidents.length} total
          </span>
          {incidents.length > 0 && (
            <span className="text-xs text-gray-500">· Newest first</span>
          )}
        </div>
        <button onClick={onClear} className="text-xs text-gray-500 hover:text-white transition-colors">Clear count</button>
      </div>
      <div className="bg-[#0d1117] border border-[#1f2937] rounded-xl overflow-hidden">
        {incidents.length === 0 ? (
          <div className="py-12 text-center text-gray-600 text-sm">No alerts recorded</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b border-[#1f2937]">
              <tr className="text-gray-500">
                <th className="text-left px-4 py-3">#</th>
                <th className="text-left px-4 py-3">Time</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Driver</th>
                <th className="text-left px-4 py-3">Message</th>
                <th className="text-left px-4 py-3">Severity</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc, i) => (
                <tr key={i} className={`border-b border-[#1f2937]/40 hover:bg-white/2 ${i === 0 ? 'bg-[#00d4ff]/3' : ''}`}>
                  <td className="px-4 py-2.5">
                    {i === 0 ? (
                      <span className="text-xs font-bold text-[#00d4ff] bg-[#00d4ff]/10 px-1.5 py-0.5 rounded">LATEST</span>
                    ) : (
                      <span className="text-gray-600">{i + 1}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 font-mono">{inc.timestamp}</td>
                  <td className="px-4 py-2.5 font-semibold text-white">{inc.type?.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2.5 text-gray-400">{inc.driver_name}</td>
                  <td className="px-4 py-2.5 text-gray-400 max-w-xs truncate">{inc.message}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase
                      ${inc.severity === 'critical' ? 'bg-[#ff3b3b]/10 text-[#ff3b3b]' : 'bg-[#ffd700]/10 text-[#ffd700]'}`}>
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

// ── Drivers View ──────────────────────────────────────────────────────────
function DriversView({ drivers, onDriverClick }) {
  const [qrDriver, setQrDriver] = useState(null)
  const host = window.location.hostname

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-white uppercase tracking-wider">Fleet Drivers</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {drivers.map(d => {
          const sc = d.score > 70 ? '#00ff88' : d.score > 40 ? '#ffd700' : '#ff3b3b'
          return (
            <div key={d.id} className="bg-[#0d1117] border border-[#1f2937] rounded-xl p-4">
              <button onClick={() => onDriverClick(d.id)} className="w-full text-left">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{d.photo || '👤'}</span>
                  <div>
                    <p className="text-sm font-semibold text-white">{d.name}</p>
                    <p className="text-xs text-gray-500">{d.vehicle} · {d.shift}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-600 mb-3 truncate">🚌 {d.route}</p>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">Safety Score</span>
                  <span style={{ color: sc }}>{d.score}</span>
                </div>
                <div className="w-full bg-[#1f2937] rounded-full h-1.5 mb-3">
                  <div className="h-1.5 rounded-full" style={{ width: `${d.score}%`, backgroundColor: sc }} />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>⭐ {(d.rating ?? 5).toFixed(1)}</span>
                  <span>⚠ {d.incidents} incidents</span>
                  <span>⚡ {d.current_speed ?? 0} km/h</span>
                </div>
              </button>
              {/* QR button */}
              <button onClick={() => setQrDriver(qrDriver === d.id ? null : d.id)}
                className="mt-3 w-full text-xs py-1.5 rounded border border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/10 transition-colors">
                📱 {qrDriver === d.id ? 'Hide' : 'Show'} Passenger QR
              </button>
              {qrDriver === d.id && (
                <div className="mt-3 flex flex-col items-center gap-2 p-3 bg-[#0a0e1a] rounded-lg border border-[#1f2937]">
                  <img src={`/api/passenger/${d.id}/qr?host=${host}`} alt="QR Code"
                    className="w-32 h-32 rounded" />
                  <p className="text-xs text-gray-500 text-center">Scan to view driver safety status</p>
                  <a href={`/passenger.html?driver=${d.id}`} target="_blank" rel="noreferrer"
                    className="text-xs text-[#00d4ff] hover:text-white transition-colors">
                    Open Passenger Page →
                  </a>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Analytics View ────────────────────────────────────────────────────────
function AnalyticsView({ fatigueTrend, leaderboard, incidents }) {
  const totalIncidents = incidents.length
  const critical = incidents.filter(i => i.severity === 'critical').length
  const avgScore = leaderboard.length
    ? Math.round(leaderboard.reduce((s, d) => s + d.score, 0) / leaderboard.length)
    : 100

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-white uppercase tracking-wider">Analytics</h2>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Incidents', value: totalIncidents, color: '#ff3b3b' },
          { label: 'Critical Alerts', value: critical, color: '#ff3b3b' },
          { label: 'Fleet Avg Score', value: avgScore, color: avgScore > 70 ? '#00ff88' : '#ffd700' },
        ].map(s => (
          <div key={s.label} className="bg-[#0d1117] border border-[#1f2937] rounded-xl p-5 text-center">
            <p className="text-3xl font-bold mb-1" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wider">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-[#0d1117] border border-[#1f2937] rounded-xl p-4">
        <p className="text-xs font-semibold text-white mb-3">Fatigue Score Trend</p>
        <FatigueTrendChart data={fatigueTrend} />
      </div>
    </div>
  )
}

// ── Reports View ──────────────────────────────────────────────────────────
function ReportsView({ token }) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-white uppercase tracking-wider">Incident Recordings</h2>
      <IncidentClips token={token} />
    </div>
  )
}

// ── Settings View ─────────────────────────────────────────────────────────
function SettingsView({ onReset, wsStatus }) {
  return (
    <div className="space-y-4 max-w-lg">
      <h2 className="text-sm font-bold text-white uppercase tracking-wider">Settings</h2>
      <div className="bg-[#0d1117] border border-[#1f2937] rounded-xl divide-y divide-[#1f2937]">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm text-white">WebSocket Status</p>
            <p className="text-xs text-gray-500">Live camera feed connection</p>
          </div>
          <span className={`text-xs font-bold px-2 py-1 rounded ${wsStatus === 'connected' ? 'text-[#00ff88] bg-[#00ff88]/10' : 'text-[#ff3b3b] bg-[#ff3b3b]/10'}`}>
            {wsStatus.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm text-white">Emergency Number</p>
            <p className="text-xs text-gray-500">Auto-call on 9s drowsiness</p>
          </div>
          <span className="text-xs font-bold text-[#ff3b3b]">108 (Ambulance)</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm text-white">Reset All Data</p>
            <p className="text-xs text-gray-500">Clear scores, incidents and logs</p>
          </div>
          <button onClick={onReset}
            className="text-xs px-3 py-1.5 rounded border border-[#ff3b3b]/40 text-[#ff3b3b] hover:bg-[#ff3b3b]/10 transition-colors">
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
