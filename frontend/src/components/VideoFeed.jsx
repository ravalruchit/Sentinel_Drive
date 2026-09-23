import { Camera, WifiOff } from 'lucide-react'

export default function VideoFeed({ frame, ear, mar, faceDetected, alerts }) {
  const hasCritical = alerts?.some(a => a.severity === 'critical')

  return (
    <div className={`relative rounded-xl overflow-hidden border scanline
      ${hasCritical ? 'border-sentinel-red glow-red' : 'border-sentinel-border glow-accent'}
      bg-sentinel-card`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-sentinel-border">
        <div className="flex items-center gap-2 text-xs text-sentinel-accent font-semibold tracking-widest uppercase">
          <Camera size={14} />
          Live Driver Feed
        </div>
        <div className={`flex items-center gap-1.5 text-xs ${faceDetected ? 'text-sentinel-green' : 'text-gray-500'}`}>
          <span className={`w-2 h-2 rounded-full ${faceDetected ? 'bg-sentinel-green animate-pulse' : 'bg-gray-600'}`} />
          {faceDetected ? 'Face Detected' : 'No Face'}
        </div>
      </div>

      {/* Video */}
      <div className="relative aspect-video bg-black flex items-center justify-center">
        {frame ? (
          <img
            src={`data:image/jpeg;base64,${frame}`}
            alt="Driver feed"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-gray-600">
            <WifiOff size={40} />
            <span className="text-sm">Connecting to camera...</span>
          </div>
        )}

        {/* Alert overlay */}
        {hasCritical && (
          <div className="absolute inset-0 border-4 border-sentinel-red pulse-red pointer-events-none rounded" />
        )}

        {/* Metrics overlay */}
        {frame && (
          <div className="absolute bottom-3 left-3 flex gap-3">
            <MetricBadge label="EAR" value={ear?.toFixed(3)} warn={ear < 0.25} />
            <MetricBadge label="MAR" value={mar?.toFixed(3)} warn={mar > 0.6} />
          </div>
        )}
      </div>

      {/* Alert banner */}
      {alerts?.length > 0 && (
        <div className="px-4 py-2 bg-sentinel-red/10 border-t border-sentinel-red/30">
          {alerts.map((a, i) => (
            <p key={i} className="text-xs text-sentinel-red font-semibold tracking-wide">
              ⚠ {a.message}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function MetricBadge({ label, value, warn }) {
  return (
    <div className={`px-2 py-1 rounded text-xs font-mono border
      ${warn ? 'bg-sentinel-red/20 border-sentinel-red text-sentinel-red' : 'bg-black/60 border-sentinel-border text-sentinel-accent'}`}
    >
      {label}: {value ?? '—'}
    </div>
  )
}
