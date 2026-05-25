export interface Recording {
  id?: string;
  userId: string;
  timestamp: string;
  vibe: string;
  vibeScore: number;
  summary: string;
  transcript: string;
}

export type VibeCategory = "Calm" | "Anxious" | "Excited" | "Fatigued" | "Signal Low";

export interface VibeTheme {
  name: VibeCategory;
  color: string; // Hex or tailwind class
  glowColor: string; // Shadow styling
  textColor: string;
  bgGradient: string;
}
