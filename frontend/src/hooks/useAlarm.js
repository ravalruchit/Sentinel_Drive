import { useRef, useEffect, useCallback } from 'react'

/**
 * Web Audio API alarm system.
 * startAlarm()    — continuous beeping + voice (drowsiness)
 * stopAlarm()     — stop the continuous alarm
 * playWarnHorn()  — single 1-second warning horn + voice (yawning)
 */
export function useAlarm() {
  const ctxRef = useRef(null)
  const intervalRef = useRef(null)
  const activeRef = useRef(false)

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    return ctxRef.current
  }, [])

  const beep = useCallback((frequency = 880, duration = 0.18, volume = 0.9) => {
    try {
      const ctx = getCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'square'
      osc.frequency.setValueAtTime(frequency, ctx.currentTime)
      gain.gain.setValueAtTime(volume, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + duration)
    } catch (e) {}
  }, [getCtx])

  // Continuous alarm — drowsiness
  const startAlarm = useCallback(() => {
    if (activeRef.current) return
    activeRef.current = true

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
      const utt = new SpeechSynthesisUtterance(
        'Attention! Fatigue detected. Please pull over safely and take a rest.'
      )
      utt.rate = 0.85; utt.pitch = 1.1; utt.volume = 1
      window.speechSynthesis.speak(utt)
    }

    const doBeep = () => {
      beep(880, 0.15, 0.9)
      setTimeout(() => beep(660, 0.15, 0.7), 200)
    }
    doBeep()
    intervalRef.current = setInterval(doBeep, 800)
  }, [beep])

  const stopAlarm = useCallback(() => {
    if (!activeRef.current) return
    activeRef.current = false
    clearInterval(intervalRef.current)
    intervalRef.current = null
    if (window.speechSynthesis) window.speechSynthesis.cancel()
  }, [])

  // Single warning horn — yawning phase 1
  const playWarnHorn = useCallback(() => {
    try {
      const ctx = getCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(440, ctx.currentTime)
      osc.frequency.linearRampToValueAtTime(550, ctx.currentTime + 0.5)
      osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 1.0)
      gain.gain.setValueAtTime(0.75, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 1.0)
    } catch (e) {}

    setTimeout(() => {
      if (window.speechSynthesis) {
        const utt = new SpeechSynthesisUtterance('Are you tired? Please stay alert.')
        utt.rate = 0.9; utt.pitch = 1; utt.volume = 1
        window.speechSynthesis.speak(utt)
      }
    }, 600)
  }, [getCtx])

  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current)
      ctxRef.current?.close()
    }
  }, [])

  return { startAlarm, stopAlarm, playWarnHorn }
}
