import React, { useEffect, useRef } from "react";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Title,
  Tooltip,
  Filler,
  ChartConfiguration
} from "chart.js";
import { Recording } from "../types";

// Register custom chart modules for lightweight tree-shaking
Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Title,
  Tooltip,
  Filler
);

interface MoodPulseChartProps {
  recordings: Recording[];
  isAuthenticated: boolean;
  onSignInClick: () => void;
}

export const MoodPulseChart: React.FC<MoodPulseChartProps> = ({
  recordings,
  isAuthenticated,
  onSignInClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Destruct existing chart to re-render clean state
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Prep data: Sort recordings by timestamp (oldest first for progression plot)
    const sortedRecordings = [...recordings]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-7); // take last 7 recordings

    // If empty and authenticated, show flat baseline
    const hasData = sortedRecordings.length > 0;
    
    // Labels formatting e.g., '05-18 14:30'
    const labels = hasData 
      ? sortedRecordings.map(r => {
          const d = new Date(r.timestamp);
          return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        })
      : ["Sensor-1", "Sensor-2", "Sensor-3", "Sensor-4", "Sensor-5", "Sensor-6", "Sensor-7"];

    const dataPoints = hasData
      ? sortedRecordings.map(r => r.vibeScore)
      : [5, 4, 7, 5, 8, 3, 6]; // Demo baseline if empty/unauthenticated

    const pointVibes = hasData
      ? sortedRecordings.map(r => r.vibe)
      : ["Calm", "Fatigued", "Excited", "Calm", "Anxious", "Fatigued", "Excited"];

    // Dynamic line gradients
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 300);
    gradient.addColorStop(0, "rgba(0, 243, 255, 0.25)");  // Glowing Neon Cyan
    gradient.addColorStop(0.5, "rgba(188, 0, 255, 0.1)");  // Electric Purple fading
    gradient.addColorStop(1, "rgba(10, 10, 10, 0)");

    const config: ChartConfiguration = {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Vibe Intensity",
            data: dataPoints,
            borderColor: "#00f3ff", // Neon Cyan
            borderWidth: 2,
            backgroundColor: gradient,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: "#bc00ff", // Electric Purple joints
            pointBorderColor: "#00f3ff",
            pointBorderWidth: 1.5,
            pointRadius: 5,
            pointHoverRadius: 8,
            pointHoverBackgroundColor: "#00f3ff",
            pointHoverBorderColor: "#bc00ff",
            pointHoverBorderWidth: 2,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            enabled: true,
            backgroundColor: "rgba(10, 10, 10, 0.95)",
            titleColor: "#e0e0e0",
            bodyColor: "#00f3ff",
            borderColor: "rgba(0, 243, 255, 0.3)",
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: (context) => {
                const index = context.dataIndex;
                const value = context.parsed.y;
                const vibe = pointVibes[index] || "Unassigned";
                return [
                  `Vibe Score: ${value}/10`,
                  `Frequency Tone: ${vibe}`
                ];
              }
            }
          }
        },
        scales: {
          y: {
            min: 0,
            max: 10,
            grid: {
              color: "rgba(224, 224, 224, 0.05)",
            },
            ticks: {
              color: "#e0e0e0",
              font: {
                family: "JetBrains Mono",
                size: 10
              },
              stepSize: 2
            }
          },
          x: {
            grid: {
              color: "rgba(224, 224, 224, 0.03)"
            },
            ticks: {
              color: "#e0e0e0",
              font: {
                family: "JetBrains Mono",
                size: 9
              },
              maxRotation: 45,
              minRotation: 0
            }
          }
        }
      }
    };

    chartInstanceRef.current = new Chart(ctx, config);

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [recordings]);

  return (
    <div className="relative w-full h-[220px] rounded-xl bg-[#111111]/70 border border-[#222]/80 p-4 overflow-hidden shadow-[inset_0_2px_12px_rgba(0,0,0,0.6)]">
      {/* Glow highlight */}
      <div className="absolute top-0 left-0 w-1/3 h-[2px] bg-gradient-to-r from-transparent via-[#00f3ff]/40 to-transparent" />
      
      {/* Unauthenticated Cover Overlay */}
      {!isAuthenticated && (
        <div className="absolute inset-0 bg-[#0a0a0a]/85 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-3 z-10">
          <div className="text-[#e0e0e0] font-sans font-medium text-sm mb-1 tracking-tight">
            Telemetry Archive Offline
          </div>
          <p className="text-xs text-[#a0a0a0] max-w-xs mb-3 font-mono leading-relaxed">
            Persistence and historical trend mapping require active quantum link.
          </p>
          <button
            id="chart-signin-button"
            onClick={onSignInClick}
            className="px-3.5 py-1.5 text-xs tracking-wider bg-transparent border border-[#00f3ff] text-[#00f3ff] hover:bg-[#00f3ff]/10 hover:shadow-[0_0_12px_rgba(0,243,255,0.35)] active:scale-95 transition-all rounded font-mono font-bold font-sans cursor-pointer uppercase"
          >
            Connect Sync Identity
          </button>
        </div>
      )}

      {/* Actual Chart Canvas */}
      <div className="w-full h-full">
        <canvas ref={canvasRef} id="vibe-trend-canvas" />
      </div>
    </div>
  );
};
