import { ImageResponse } from 'next/og';

// Route segment config
export const runtime = 'edge';

// Image metadata
export const size = {
  width: 32,
  height: 32,
};

export const contentType = 'image/png';

// Image generation
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0a0a0f',
          borderRadius: '8px',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="rgba(255,255,255,0.1)" />
          <path d="M8 8h16v4h-6v12h-4V12H8V8z" fill="white" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}