import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Configure body size parser for base64 sound chunks
app.use(express.json({ limit: "20mb" }));

// Lazy initializer for Gemini API client to prevent failure if API key is not yet set
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please set it in AI Studio Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
  }
  return aiClient;
}

// API endpoint for raw audio chunk transcription and real-time vibe classification
app.post("/api/analyze-chunk", async (req, res) => {
  try {
    const { audioData, mimeType } = req.body;
    if (!audioData) {
      return res.status(400).json({ error: "Missing audioData in request" });
    }

    const ai = getAI();

    const audioPart = {
      inlineData: {
        mimeType: mimeType || "audio/webm",
        data: audioData,
      },
    };

    const promptPart = {
      text: "Analyze the emotional vocal tone and speech content in this short audio. Transcribe the words exactly into the 'transcription' field. Determine the primary emotional tone in 'primary_vibe' as one of: 'Calm', 'Anxious', 'Excited', 'Fatigued'. If the audio contains only silent noise, low audio signal, or is unrecognizable, set the 'primary_vibe' to 'Signal Low' and make the transcription empty or '...'.",
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [audioPart, promptPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcription: {
              type: Type.STRING,
              description: "The transcribed speech text",
            },
            primary_vibe: {
              type: Type.STRING,
              description: "Vibe category: Calm, Anxious, Excited, Fatigued, or Signal Low",
            },
          },
          required: ["transcription", "primary_vibe"],
        },
      },
    });

    const resultText = response.text || "{}";
    const parsed = JSON.parse(resultText);
    res.json(parsed);
  } catch (error: any) {
    console.error("Error during real-time chunk analysis:", error);
    res.status(500).json({ error: error.message || "Telemetry Analysis Error" });
  }
});

// API endpoint for stopping a recording and building a final state summary report
app.post("/api/final-summary", async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript) {
      return res.status(400).json({ error: "Missing transcript data" });
    }

    const ai = getAI();

    const prompt = `Review this complete speech transcription representing a user's vocal thoughts: "${transcript}". Create a futuristic emotional tone report. Provide a 1-sentence synthesis summary of user mental/vocal state, a vibe intensity score from 1 (lowest energy/calmest/fatigued) to 10 (highest energy/nervous/shouting/excited), and assign the overarching vibe from these categories: 'Calm', 'Anxious', 'Excited', 'Fatigued', 'Signal Low'.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: "Futuristic 1-sentence mental state summary",
            },
            vibeScore: {
              type: Type.INTEGER,
              description: "Vocalization score between 1 and 10",
            },
            vibe: {
              type: Type.STRING,
              description: "One of: Calm, Anxious, Excited, Fatigued, Signal Low",
            },
          },
          required: ["summary", "vibeScore", "vibe"],
        },
      },
    });

    const resultText = response.text || "{}";
    const parsed = JSON.parse(resultText);
    res.json(parsed);
  } catch (error: any) {
    console.error("Error during final speech summary analysis:", error);
    res.status(500).json({ error: error.message || "Synthesis Analysis Error" });
  }
});

// Setup Vite Dev Server / Static Asset Router Bundle
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`VIBE-SYNTH telemetry server running on http://localhost:${PORT}`);
  });
}

startServer();
