interface OshaliLoaderProps {
  variant?: 'fullscreen' | 'overlay' | 'inline'
  message?: string
}

export default function OshaliLoader({ variant = 'fullscreen', message }: OshaliLoaderProps) {
  const isInline = variant === 'inline'
  const stageSize = isInline ? 100 : 160
  const ringSize = isInline ? 100 : 160
  const strokeWidth = isInline ? 8 : 12
  const r = isInline ? 44 : 70
  const circumference = 2 * Math.PI * r
  const dashArray = isInline ? `${circumference * 0.74} ${circumference * 0.26}` : '260 92'

  const stage = (
    <div style={{
      position: 'relative',
      width: stageSize,
      height: stageSize,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <style>{`
        @keyframes oshali-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes oshali-pulse {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.08); }
        }
      `}</style>

      {/* Spinning ring — absolute so it doesn't affect flex flow */}
      <div style={{
        position: 'absolute',
        inset: 0,
        animation: 'oshali-spin 2.2s linear infinite',
        transformOrigin: 'center center',
      }}>
        <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} fill="none">
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={r}
            stroke="#1a3a6b"
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            strokeLinecap="round"
          />
          {/* Golden leading dot */}
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2 - r}
            r={isInline ? 4 : 6}
            fill="#f5a623"
          />
        </svg>
      </div>

      {/* Oil drop — normal flex child, centers naturally inside the stage */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'oshali-pulse 2s ease-in-out infinite',
      }}>
        {isInline ? (
          <svg width="36" height="44" viewBox="0 0 52 64" style={{ display: 'block' }} fill="none">
            <path d="M26 2 C26 2 3 30 3 43 C3 55.7 13.4 63 26 63 C38.6 63 49 55.7 49 43 C49 30 26 2 26 2Z" fill="#f5a623"/>
            <path d="M26 16 C26 16 10 36 10 45 C10 53.5 17.2 59 26 59 C34.8 59 42 53.5 42 45 C42 36 26 16 26 16Z" fill="#ffc947" opacity="0.45"/>
            <ellipse cx="19" cy="38" rx="4" ry="6" fill="white" opacity="0.22" transform="rotate(-18 19 38)"/>
          </svg>
        ) : (
          <svg width="64" height="78" viewBox="0 0 52 64" style={{ display: 'block' }} fill="none">
            <path d="M26 2 C26 2 3 30 3 43 C3 55.7 13.4 63 26 63 C38.6 63 49 55.7 49 43 C49 30 26 2 26 2Z" fill="#f5a623"/>
            <path d="M26 16 C26 16 10 36 10 45 C10 53.5 17.2 59 26 59 C34.8 59 42 53.5 42 45 C42 36 26 16 26 16Z" fill="#ffc947" opacity="0.45"/>
            <ellipse cx="19" cy="38" rx="4" ry="6" fill="white" opacity="0.22" transform="rotate(-18 19 38)"/>
          </svg>
        )}
      </div>
    </div>
  )

  if (variant === 'fullscreen') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ backgroundColor: '#0a1628' }}>
        {stage}
        {message && (
          <p className="mt-6 text-sm text-white/60">{message}</p>
        )}
      </div>
    )
  }

  if (variant === 'overlay') {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm rounded-inherit">
        {stage}
        {message && (
          <p className="mt-6 text-sm text-white/60">{message}</p>
        )}
      </div>
    )
  }

  // inline
  return (
    <div className="flex flex-col items-center justify-center py-6">
      {stage}
      {message && (
        <p className="mt-3 text-xs text-gray-400">{message}</p>
      )}
    </div>
  )
}
