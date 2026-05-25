import React, { useEffect, useRef } from "react";

interface WaveformCanvasProps {
  isScanning: boolean;
  analyser: AnalyserNode | null;
}

export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({ isScanning, analyser }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const phaseRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set dimensions based on current device screen size
    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Dynamic drawing loop
    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) {
        animationRef.current = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = Math.min(width, height) * 0.32;

      // Draw subtle background futuristic radial tech markings
      ctx.save();
      ctx.strokeStyle = "rgba(188, 0, 255, 0.08)"; // Electric Purple accents
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 1.25, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 0.75, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (isScanning && analyser) {
        // --- REAL MICROPHONE MODE (Active Sensor Scan) ---
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        // Sum amplitudes for a central breathing offset
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const volumeMultiplier = 1 + (average / 150);

        // Outer glow styling
        ctx.save();
        ctx.strokeStyle = "#00f3ff"; // Neon Cyan
        ctx.lineWidth = 3;
        ctx.shadowBlur = 18;
        ctx.shadowColor = "rgba(0, 243, 255, 0.8)";

        // Render circular/polar frequency waves
        ctx.beginPath();
        const numPoints = 80;
        for (let i = 0; i < numPoints; i++) {
          // Wrap around circularly
          const index = Math.floor((i / numPoints) * (bufferLength / 2));
          const amplitude = dataArray[index] || 0;
          
          // Extrapolate distance
          const offset = (amplitude / 255) * 35;
          const angle = (i / numPoints) * Math.PI * 2;
          const r = baseRadius * volumeMultiplier + offset;

          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.stroke();

        // Inner secondary particle cyber-dots
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(188, 0, 255, 0.6)"; // Electric Purple
        ctx.shadowBlur = 8;
        ctx.shadowColor = "#bc00ff";
        ctx.beginPath();
        for (let i = 0; i < numPoints; i++) {
          const index = Math.floor(((i + 20) % numPoints / numPoints) * (bufferLength / 3));
          const amplitude = dataArray[index] || 0;
          const offset = (amplitude / 255) * 20;
          const angle = (i / numPoints) * Math.PI * 2;
          const r = baseRadius * 0.85 + offset;

          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
      } else {
        // --- AMBIENT IDLE MODE (Dormant Wave) ---
        phaseRef.current += 0.02;

        ctx.save();
        ctx.strokeStyle = "rgba(0, 243, 255, 0.35)"; // Low intensity Neon Cyan
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = "rgba(0, 243, 255, 0.3)";

        // Soft, breathing ring using multiple sine harmonies
        ctx.beginPath();
        const numPoints = 120;
        for (let i = 0; i < numPoints; i++) {
          const angle = (i / numPoints) * Math.PI * 2;
          
          // Harmonious frequency offsets based on angle and phase
          const wave1 = Math.sin(angle * 6 + phaseRef.current) * 6;
          const wave2 = Math.cos(angle * 3 - phaseRef.current * 1.5) * 4;
          const pulse = Math.sin(phaseRef.current * 0.5) * 8;
          
          const r = baseRadius + wave1 + wave2 + pulse;

          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.stroke();

        // Inner glowing electric purple orb
        ctx.strokeStyle = "rgba(188, 0, 255, 0.25)";
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 6;
        ctx.shadowColor = "rgba(188, 0, 255, 0.25)";
        ctx.beginPath();
        for (let i = 0; i < numPoints; i++) {
          const angle = (i / numPoints) * Math.PI * 2;
          const wave = Math.sin(angle * 4 - phaseRef.current * 1.2) * 5;
          const r = baseRadius * 0.7 + wave;
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isScanning, analyser]);

  return (
    <canvas
      id="waveform-canvas"
      ref={canvasRef}
      className="w-full h-full block rounded-full"
    />
  );
};
