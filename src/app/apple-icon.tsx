import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const size = {
  width: 180,
  height: 180,
}
export const contentType = 'image/png'

export default function AppleIcon() {
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
        }}
      >
        <div
          style={{
            background: 'rgba(52, 211, 153, 0.15)',
            width: '75%',
            height: '75%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '24px',
            color: '#34d399',
            fontSize: 80,
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
