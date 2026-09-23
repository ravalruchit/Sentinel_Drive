import { useEffect, useRef, useState, useCallback } from 'react'
import { Phone, PhoneOff, MapPin, AlertTriangle } from 'lucide-react'

const COUNTDOWN_START = 10   // seconds before auto-call
const EMERGENCY_NUMBER = '108'  // ambulance India
const POLICE_NUMBER    = '100'  // police India

export default function EmergencyCall({ fatigueSeconds, fatigueActive, driverName, gpsPosition }) {
  const [phase, setPhase] = useState('idle')   // idle | countdown | calling | cancelled
  const [countdown, setCountdown] = useState(COUNTDOWN_START)
  const [calledNumber, setCalledNumber] = useState(null)
  const intervalRef = useRef(null)
  const hasTriggeredRef = useRef(false)

  const cancel = useCallback(() => {
    clearInterval(intervalRef.current)
    setPhase('cancelled')
    hasTriggeredRef.current = false
    setTimeout(() => setPhase('idle'), 4000)
  }, [])

  const triggerCall = useCallback((number) => {
    clearInterval(intervalRef.current)
    setCalledNumber(number)
    setPhase('calling')

    // Speak emergency alert
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
      const loc = gpsPosition
        ? `Location: latitude ${gpsPosition.lat.toFixed(4)}, longitude ${gpsPosition.lon.toFixed(4)}.`
        : 'Location unavailable.'
      const utt = new SpeechSynthesisUtterance(
        `Emergency! Driver ${driverName || 'unknown'} is unresponsive. Calling ${number}. ${loc}`
      )
      utt.rate = 0.85; utt.pitch = 1.1; utt.volume = 1
      window.speechSynthesis.speak(utt)
    }

    // Open phone dialer
    setTimeout(() => {
      window.location.href = `tel:${number}`
    }, 800)

    hasTriggeredRef.current = false
  }, [driverName, gpsPosition])

  // Watch fatigue seconds — trigger countdown at 9s
  useEffect(() => {
    if (!fatigueActive) {
      // Driver woke up — cancel if still counting down
      if (phase === 'countdown') {
        cancel()
      }
      hasTriggeredRef.current = false
      return
    }

    if (fatigueSeconds >= 9 && !hasTriggeredRef.current && phase === 'idle') {
      hasTriggeredRef.current = true
      setPhase('countdown')
      setCountdown(COUNTDOWN_START)

      intervalRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current)
            triggerCall(EMERGENCY_NUMBER)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
  }, [fatigueSeconds, fatigueActive, phase, cancel, triggerCall])

  useEffect(() => () => clearInterval(intervalRef.current), [])

  if (phase === 'idle') return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className={`w-full max-w-sm rounded-2xl border-2 p-6 text-center space-y-4
        ${phase === 'countdown' ? 'border-sentinel-red bg-sentinel-red/10 animate-pulse' :
          phase === 'calling'   ? 'border-sentinel-red bg-sentinel-red/20' :
          'border-sentinel-green bg-green-900/20'}`}>

        {phase === 'countdown' && (
          <>
            <div className="text-5xl animate-bounce">🚨</div>
            <h2 className="text-xl font-bold text-sentinel-red tracking-wide uppercase">
              Driver Unresponsive!
            </h2>
            <p className="text-sm text-gray-300">
              {driverName} has been drowsy for <span className="text-sentinel-red font-bold">{Math.round(fatigueSeconds)}s</span>
            </p>

            {/* Countdown ring */}
            <div className="relative w-28 h-28 mx-auto">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#1f2937" strokeWidth="8" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="#ff3b3b" strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={264}
                  strokeDashoffset={264 - (countdown / COUNTDOWN_START) * 264}
                  style={{ transition: 'stroke-dashoffset 1s linear',
                           filter: 'drop-shadow(0 0 8px #ff3b3b)' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-sentinel-red">{countdown}</span>
                <span className="text-xs text-gray-400">seconds</span>
              </div>
            </div>

            <p className="text-sm text-sentinel-red font-semibold">
              Calling <span className="text-2xl">📞</span> {EMERGENCY_NUMBER} (Ambulance) automatically...
            </p>

            {gpsPosition && (
              <div className="flex items-center justify-center gap-1 text-xs text-gray-400">
                <MapPin size={11} />
                {gpsPosition.lat.toFixed(5)}, {gpsPosition.lon.toFixed(5)}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={cancel}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                  border border-sentinel-green text-sentinel-green hover:bg-sentinel-green/10 transition-colors font-semibold">
                <PhoneOff size={16} /> I'm Awake — Cancel
              </button>
              <button onClick={() => triggerCall(POLICE_NUMBER)}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                  border border-sentinel-red bg-sentinel-red/20 text-sentinel-red hover:bg-sentinel-red/30 transition-colors font-semibold">
                <Phone size={16} /> Call Police ({POLICE_NUMBER})
              </button>
            </div>
          </>
        )}

        {phase === 'calling' && (
          <>
            <div className="text-5xl">📞</div>
            <h2 className="text-xl font-bold text-sentinel-red">Calling {calledNumber}...</h2>
            <p className="text-sm text-gray-300">Emergency services have been notified</p>
            {gpsPosition && (
              <div className="flex items-center justify-center gap-1 text-xs text-sentinel-accent">
                <MapPin size={11} />
                Location shared: {gpsPosition.lat.toFixed(5)}, {gpsPosition.lon.toFixed(5)}
              </div>
            )}
            <button onClick={() => setPhase('idle')}
              className="w-full py-3 rounded-xl border border-sentinel-border text-gray-400 hover:text-white transition-colors text-sm">
              Dismiss
            </button>
          </>
        )}

        {phase === 'cancelled' && (
          <>
            <div className="text-5xl">✅</div>
            <h2 className="text-xl font-bold text-sentinel-green">Alert Cancelled</h2>
            <p className="text-sm text-gray-400">Driver is awake. Stay alert!</p>
          </>
        )}
      </div>
    </div>
  )
}
