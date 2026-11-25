import { useEffect, useRef } from 'react';

interface WaveformCanvasProps {
  readonly peaks: Float32Array;
  readonly progress: number;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly onSeek: (progress: number) => void;
}

export function WaveformCanvas({
  peaks,
  progress,
  selectionStart,
  selectionEnd,
  onSeek,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const draw = () => {
      const parent = canvas.parentElement;
      if (!parent) return;

      const width = Math.max(1, Math.floor(parent.clientWidth));
      const height = 132;
      const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(width * pixelRatio);
      canvas.height = Math.floor(height * pixelRatio);
      canvas.style.height = `${height}px`;

      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      const middle = height / 2;
      const barWidth = Math.max(1, width / Math.max(1, peaks.length) - 1);
      context.fillStyle = '#9296e8';

      for (let index = 0; index < peaks.length; index += 1) {
        const amplitude = Math.max(0.035, peaks[index] ?? 0);
        const barHeight = Math.max(3, amplitude * height * 0.82);
        const x = (index / peaks.length) * width;
        context.beginPath();
        context.roundRect(x, middle - barHeight / 2, barWidth, barHeight, 2);
        context.fill();
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    return () => observer.disconnect();
  }, [peaks]);

  const progressPercent = Math.min(100, Math.max(0, progress * 100));
  const boundedStart = Math.min(1, Math.max(0, selectionStart));
  const boundedEnd = Math.min(1, Math.max(boundedStart, selectionEnd));

  return (
    <div className="waveform-shell">
      <canvas
        ref={canvasRef}
        className="waveform-canvas"
        aria-hidden="true"
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (bounds.width <= 0) return;
          onSeek((event.clientX - bounds.left) / bounds.width);
        }}
      />
      <div
        className="waveform-selection"
        style={{
          left: `${boundedStart * 100}%`,
          width: `${(boundedEnd - boundedStart) * 100}%`,
        }}
        aria-hidden="true"
      />
      <div className="waveform-progress" style={{ left: `${progressPercent}%` }} />
    </div>
  );
}
