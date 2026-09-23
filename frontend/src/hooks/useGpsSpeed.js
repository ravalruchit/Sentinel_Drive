import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Uses browser navigator.geolocation to get real GPS speed.
 * Posts speed to backend every 2 seconds.
 * Works on mobile (GPS chip) and laptop (WiFi/IP positioning — less accurate).
 */
export function useGpsSpeed(driverId = 'DRV-001', enabled = true) {
  const [gpsSpeed, setGpsSpeed] = useState(null)   // km/h or null
  const [gpsStatus, setGpsStatus] = useState('idle') // idle | watching | error | unsupported
  const [accuracy, setAccuracy] = useState(null)
  const watchIdRef = useRef(null)
  const lastPostRef = useRef(0)

  const postSpeed = useCallback(async (speedKmh, lat, lon, acc) => {
    const now = Date.now()
    if (now - lastPostRef.current < 2000) return  // throttle to 2s
    lastPostRef.current = now
    try {
      await fetch('/api/gps-speed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_id: driverId,
          speed_kmh: speedKmh,
          latitude: lat,
          longitude: lon,
          accuracy: acc,
        }),
      })
    } catch (e) {
      // Network error — ignore silently
    }
  }, [driverId])

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus('unsupported')
      return
    }
    setGpsStatus('watching')

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const speedMs = pos.coords.speed  // m/s or null
        const speedKmh = speedMs != null ? Math.round(speedMs * 3.6 * 10) / 10 : null
        const acc = Math.round(pos.coords.accuracy)

        setGpsSpeed(speedKmh)
        setAccuracy(acc)

        if (speedKmh != null) {
          postSpeed(speedKmh, pos.coords.latitude, pos.coords.longitude, acc)
        }
      },
      (err) => {
        console.warn('GPS error:', err.message)
        setGpsStatus('error')
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
    )
  }, [postSpeed])

  const stop = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setGpsStatus('idle')
    setGpsSpeed(null)
  }, [])

  useEffect(() => {
    if (enabled) start()
    return () => stop()
  }, [enabled, start, stop])

  return { gpsSpeed, gpsStatus, accuracy, start, stop }
}
