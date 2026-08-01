import { useEffect, useRef } from 'react';

interface AudioWaveformProps {
  isActive: boolean;
  color?: string;
}

export default function AudioWaveform({ isActive, color = '#ffffff' }: AudioWaveformProps) {
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive && barsRef.current) {
      const bars = barsRef.current.querySelectorAll('.wave-bar');
      bars.forEach((bar) => {
        (bar as HTMLElement).style.animationPlayState = 'running';
      });
    } else if (barsRef.current) {
      const bars = barsRef.current.querySelectorAll('.wave-bar');
      bars.forEach((bar) => {
        (bar as HTMLElement).style.animationPlayState = 'paused';
      });
    }
  }, [isActive]);

  return (
    <div ref={barsRef} className="waveform-container">
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          key={index}
          className="wave-bar"
          style={{
            backgroundColor: color,
            animationDelay: `${index * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}