import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const size = {
  width: 512,
  height: 512,
}
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0a0a0f',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '12px solid #1e293b',
          borderRadius: '120px',
        }}
      >
        <div
          style={{
            background: 'rgba(52, 211, 153, 0.15)',
            width: '65%',
            height: '65%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '80px',
            color: '#34d399',
            fontSize: 220,
            fontWeight: 800,
            fontFamily: 'system-ui, "Inter", sans-serif',
          }}
        >
          O
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
