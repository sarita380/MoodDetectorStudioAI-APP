import React, { useState, useEffect, useRef } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { Recording, VibeCategory, VibeTheme } from "./types";
import { saveRecording, fetchRecordings, deleteRecording } from "./services/db";
import { WaveformCanvas } from "./components/WaveformCanvas";
import { MoodPulseChart } from "./components/MoodPulseChart";
import { motion, AnimatePresence } from "motion/react";
import { 
  Mic, 
  MicOff, 
  Database, 
  Power, 
  Terminal, 
  History, 
  User as UserIcon, 
  LogOut, 
  Trash2, 
  X, 
  ChevronRight, 
  Sparkles, 
  TrendingUp, 
  AlertTriangle,
  Info
} from "lucide-react";

export default function App() {
  // Auth and DB States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dbLoading, setDbLoading] = useState(false);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  
  // Edge Case Alert States
  const [dbError, setDbError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  // Active Scan state machinery
  const [isScanning, setIsScanning] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [currentVibe, setCurrentVibe] = useState<VibeCategory>("Calm");
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [intervalId, setIntervalId] = useState<any | null>(null);
  
  // Synthesis processing overlay
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [finalReport, setFinalReport] = useState<Omit<Recording, "userId" | "timestamp"> | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Archive & Navigation Mobile Sidebar states
  const [activeTab, setActiveTab] = useState<"scan" | "charts">("scan");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<Recording | null>(null);

  const consoleEndRef = useRef<HTMLDivElement | null>(null);

  // Vibe styling maps according to biometrics theme
  const vibeThemes: Record<VibeCategory, VibeTheme> = {
    "Calm": {
      name: "Calm",
      color: "#00f3ff",
      glowColor: "rgba(0, 243, 255, 0.45)",
      textColor: "text-[#00f3ff]",
      bgGradient: "from-[#00f3ff]/10 to-[#0a0a0a]"
    },
    "Anxious": {
      name: "Anxious",
      color: "#bc00ff",
      glowColor: "rgba(188, 0, 255, 0.45)",
      textColor: "text-[#bc00ff]",
      bgGradient: "from-[#bc00ff]/10 to-[#0a0a0a]"
    },
    "Excited": {
      name: "Excited",
      color: "#ff007f",
      glowColor: "rgba(255, 0, 127, 0.45)",
      textColor: "text-[#ff007f]",
      bgGradient: "from-[#ff007f]/10 to-[#0a0a0a]"
    },
    "Fatigued": {
      name: "Fatigued",
      color: "#e0e0e0",
      glowColor: "rgba(224, 224, 224, 0.3)",
      textColor: "text-[#e0e0e0]",
      bgGradient: "from-white/5 to-[#0a0a0a]"
    },
    "Signal Low": {
      name: "Signal Low",
      color: "#4a4a4a",
      glowColor: "rgba(74, 74, 74, 0.25)",
      textColor: "text-[#8a8a8a]",
      bgGradient: "from-[#4a4a4a]/10 to-[#0a0a0a]"
    }
  };

  const activeTheme = vibeThemes[currentVibe] || vibeThemes["Calm"];

  // Initialize Auth ecosystem and pull Firestore records
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
      setDbError(null);
      if (user) {
        setDbLoading(true);
        try {
          const list = await fetchRecordings(user.uid);
          setRecordings(list);
        } catch (err: any) {
          console.error("Telemetry query failed:", err);
          setDbError("Telemetry Sync is unavailable. Past vocal trend archives could not be loaded.");
        } finally {
          setDbLoading(false);
        }
      } else {
        setRecordings([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Maintain autoscroll on live transcription terminal
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [liveTranscript]);

  // Connect Google accounts
  const handleSignIn = async () => {
    try {
      setDbError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Google login failed:", error);
      // Fail gracefully if terms are not accepted yet or provider configs are being initialized
      setDbError("Telemetry synchronization is currently unavailable. Ensure secure connections.");
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setRecordings([]);
      setSelectedHistoryItem(null);
    } catch (e) {
      console.error("Identity sign-out failed:", e);
    }
  };

  // Utility to map a browser Blob into standard base64 formatted string
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          const raw = reader.result.split(",")[1];
          resolve(raw);
        } else {
          reject(new Error("Failed to format sound bytes to base64"));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Starts the microphone streams and chunk synthesis looping
  const handleStartScan = async () => {
    try {
      setMicError(null);
      setDbError(null);

      // Access vocal channel
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioStream(stream);

      // Construct Web Audio Analyser
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtxClass();
      const sourceNode = audioContext.createMediaStreamSource(stream);
      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 256;
      sourceNode.connect(analyserNode);
      setAnalyser(analyserNode);

      // Reset states
      setIsScanning(true);
      setLiveTranscript("");
      setCurrentVibe("Calm");

      // Set up recurring sliced telemetry scanning
      const chunkDuration = 4000; // 4 seconds chunk intervals
      
      const captureAndAnalyzeChunk = () => {
        if (!stream.active) return;

        // Try standard audio formats supported natively in Vite-express or fallback
        const mimeOption = MediaRecorder.isTypeSupported("audio/webm") 
          ? "audio/webm" 
          : "audio/ogg";

        const tempRecorder = new MediaRecorder(stream, { mimeType: mimeOption });
        const dataChunks: Blob[] = [];

        tempRecorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            dataChunks.push(ev.data);
          }
        };

        tempRecorder.onstop = async () => {
          if (dataChunks.length === 0) return;
          const mergedBlob = new Blob(dataChunks, { type: mimeOption });
          try {
            const rawBase64 = await blobToBase64(mergedBlob);
            
            const response = await fetch("/api/analyze-chunk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audioData: rawBase64, mimeType: mimeOption })
            });

            if (!response.ok) throw new Error("Chunk telemetry synchronization declined");
            const data = await response.json();

            // Append chunk text and update vocal color indicators live
            if (data.transcription && data.transcription.trim() !== "" && data.transcription !== "...") {
              setLiveTranscript((prev) => prev ? `${prev} ${data.transcription}` : data.transcription);
            }
            if (data.primary_vibe) {
              setCurrentVibe(data.primary_vibe as VibeCategory);
            }
          } catch (e) {
            console.warn("Vocal chunk analyzed as low signal or failed connection", e);
          }
        };

        tempRecorder.start();
        setTimeout(() => {
          if (tempRecorder.state !== "inactive") {
            tempRecorder.stop();
          }
        }, chunkDuration - 150); // stop slightly early to ensure gapless transition
      };

      // Trigger first immediately and start loop
      captureAndAnalyzeChunk();
      const localInterval = setInterval(captureAndAnalyzeChunk, chunkDuration);
      setIntervalId(localInterval);

    } catch (error: any) {
      console.error("Camera/Microphone connection failed:", error);
      setMicError("Sensor Link Offline: Microphone access was denied or audio device is missing. Check browser site permissions.");
    }
  };

  // Stops vocal scans and compiles the full text via Gemini 3.5 Flash overview synthesis
  const handleStopScan = async () => {
    // Clear chunk scheduler
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }

    // Release microphone tracks safely
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
      setAudioStream(null);
    }
    setAnalyser(null);
    setIsScanning(false);

    const checkTranscript = liveTranscript.trim();
    if (checkTranscript.length === 0) {
      // Short capture baseline
      setFinalReport({
        vibe: "Signal Low",
        vibeScore: 2,
        summary: "Vocal duration was too quiet or short to establish emotional resonance patterns.",
        transcript: "Insufficient speech signal collected."
      });
      setShowModal(true);
      return;
    }

    setIsSummarizing(true);
    try {
      const summaryResponse = await fetch("/api/final-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: checkTranscript })
      });

      if (!summaryResponse.ok) throw new Error("Synthesis query declined");
      const summaryResult = await summaryResponse.json();

      setFinalReport({
        vibe: summaryResult.vibe,
        vibeScore: Number(summaryResult.vibeScore),
        summary: summaryResult.summary,
        transcript: checkTranscript
      });

      // Commit to cloud database if signed in
      if (currentUser) {
        try {
          const payload = {
            userId: currentUser.uid,
            timestamp: new Date().toISOString(),
            vibe: summaryResult.vibe,
            vibeScore: Number(summaryResult.vibeScore),
            summary: summaryResult.summary,
            transcript: checkTranscript
          };
          const savedReport = await saveRecording(payload);
          // Insert inside our history pipeline in memory
          setRecordings((prev) => [savedReport, ...prev]);
        } catch (dbErr) {
          console.error("Firestore write failed:", dbErr);
          setDbError("Telemetry Sync is unavailable. Telemetry reports could not be synced with firestore.");
        }
      }

      setShowModal(true);

    } catch (e: any) {
      console.error("Final compilation text failed:", e);
      setDbError("Vibe Synthesis network disrupted. Displaying backup summary card.");
      // Render backup standard card
      setFinalReport({
        vibe: currentVibe,
        vibeScore: 5,
        summary: "Automated telemetry: User completed vocal feed scanning. Local offline encryption baseline complete.",
        transcript: checkTranscript
      });
      setShowModal(true);
    } finally {
      setIsSummarizing(false);
    }
  };

  // Delete historic session records
  const handleDeleteItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteRecording(id);
      setRecordings((prev) => prev.filter(r => r.id !== id));
      if (selectedHistoryItem?.id === id) {
        setSelectedHistoryItem(null);
      }
    } catch (err) {
      console.error("Delete failed:", err);
      setDbError("Telemetry Sync is unavailable. Unable to clear local cloud record.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] font-sans antialiased overflow-x-hidden selection:bg-[#00f3ff]/30 selection:text-white">
      
      {/* GLOW ATMOSPHERE ACCENTS */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#00f3ff]/5 rounded-full filter blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-[#bc00ff]/4 rounded-full filter blur-[150px] pointer-events-none" />

      {/* MINIMALIST TOP BAR */}
      <header className="sticky top-0 z-40 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-[#222]/50 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative w-8 h-8 rounded-lg bg-gradient-to-tr from-[#bc00ff] to-[#00f3ff] p-[1.5px] shadow-[0_0_15px_rgba(0,243,255,0.25)]">
            <div className="w-full h-full bg-[#0a0a0a] rounded-[6px] flex items-center justify-center">
              <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#00f3ff] to-[#bc00ff] text-xs">VS</span>
            </div>
          </div>
          <div>
            <h1 className="text-sm font-black tracking-widest text-[#e0e0e0]">VIBE-SYNTH</h1>
            <p className="text-[9px] font-mono tracking-tight text-[#a0a0a0]">VOCAL MENTAL STATE SCANNER</p>
          </div>
        </div>

        {/* Identity Authorization controls */}
        <div className="flex items-center gap-2">
          {authLoading ? (
            <div className="w-4 h-4 rounded-full border border-t-[#00f3ff] border-[#222] animate-spin" />
          ) : currentUser ? (
            <div className="flex items-center gap-2 bg-[#111] border border-[#222] py-1 px-2 rounded-lg">
              {currentUser.photoURL ? (
                <img referrerPolicy="no-referrer" src={currentUser.photoURL} alt="User" className="w-5 h-5 rounded-full border border-[#00f3ff]/50" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-[#bc00ff]/20 border border-[#bc00ff] flex items-center justify-center">
                  <UserIcon className="w-3 h-3 text-[#bc00ff]" />
                </div>
              )}
              <span className="hidden sm:inline font-mono text-[10px] text-[#e0e0e0] max-w-[80px] truncate">{currentUser.displayName || currentUser.email}</span>
              <button 
                id="signout-button"
                onClick={handleSignOut} 
                className="p-1 hover:text-[#ff0055] transition-colors cursor-pointer"
                title="Disconnect identity"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              id="signin-button"
              onClick={handleSignIn}
              className="px-3.5 py-1.5 bg-gradient-to-r from-[#00f3ff]/10 to-[#bc00ff]/10 border border-[#00f3ff]/60 hover:border-[#00f3ff] text-[#00f3ff] text-xs font-mono font-semibold hover:shadow-[0_0_15px_rgba(0,243,255,0.3)] transition-all rounded-lg active:scale-95 cursor-pointer uppercase tracking-wider"
            >
              Sync Identity
            </button>
          )}

          {/* Collapsible sidebar lever on mobile */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-1.5 border border-[#222] rounded-lg hover:border-[#444] transition-colors"
          >
            <History className="w-4 h-4 text-[#e0e0e0]" />
          </button>
        </div>
      </header>

      {/* CORE ALERTS OVERLAY DOCK */}
      <div className="max-w-7xl mx-auto px-4 mt-3 space-y-2">
        {micError && (
          <div className="bg-[#ff0055]/10 border border-[#ff0055]/50 px-4 py-2 rounded-xl flex items-center gap-3 text-xs text-[#ff3b75] shadow-[0_0_15px_rgba(255,0,85,0.1)]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="font-mono">{micError}</span>
          </div>
        )}
        {dbError && (
          <div className="bg-[#bc00ff]/10 border border-[#bc00ff]/40 px-4 py-2 rounded-xl flex items-center gap-3 text-xs text-[#d24dff] shadow-[0_0_15px_rgba(188,0,255,0.1)]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="font-mono">{dbError}</span>
          </div>
        )}
      </div>

      {/* DUAL SCREEN COLUMN GRID - Desktop pins sidebar, Mobile toggles tabs */}
      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        
        {/* CENTER SCROLL / RECORDER HUB  (Takes columns on wide desktop) */}
        <section className="md:col-span-2 lg:col-span-3 flex flex-col gap-6">
          
          {/* TAB BAR FOR MOBILE COMPATIBILITY */}
          <div className="flex md:hidden bg-[#111] p-1 rounded-xl border border-[#222]">
            <button
               onClick={() => setActiveTab("scan")}
               className={`flex-1 py-2 text-xs font-bold tracking-wider uppercase font-sans rounded-lg transition-all ${
                 activeTab === "scan" ? "bg-[#00f3ff]/10 border border-[#00f3ff]/40 text-[#00f3ff]" : "text-gray-400"
               }`}
            >
              Orbital Scanner
            </button>
            <button
               onClick={() => setActiveTab("charts")}
               className={`flex-1 py-2 text-xs font-bold tracking-wider uppercase font-sans rounded-lg transition-all ${
                 activeTab === "charts" ? "bg-[#bc00ff]/10 border border-[#bc00ff]/40 text-[#bc00ff]" : "text-gray-400"
               }`}
            >
              Archived Pulse
            </button>
          </div>

          {/* ACTIVE GRAPHIC SCANNER PANEL */}
          <div className={`${activeTab === "scan" ? "block" : "hidden inline md:block"} flex flex-col items-center justify-center p-6 sm:p-10 rounded-2xl bg-[#111111]/40 border border-[#222]/80 backdrop-blur-md relative overflow-hidden`}>
            
            <div className={`absolute top-0 right-0 p-4 font-mono text-[9px] tracking-widest text-[#a0a0a0] flex items-center gap-2`}>
              <span>ENVELOPE DECAY</span>
              <span className={`w-1.5 h-1.5 rounded-full ${isScanning ? "bg-[#00f3ff] animate-ping" : "bg-[#4a4a4a]"}`} />
            </div>

            {/* CIRCULAR RECORDING HUB */}
            <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
              
              {/* Radial Sweep effect when active */}
              {isScanning && (
                <div className="absolute inset-0 rounded-full border border-dashed border-[#00f3ff]/40 animate-[spin_10s_linear_infinite]" />
              )}
              
              {/* Waveform Drawing Layer */}
              <div className="absolute inset-2 bg-gradient-to-b from-[#0a0a0a] to-[#121212] rounded-full border border-[#222]/80 flex items-center justify-center overflow-hidden">
                <WaveformCanvas isScanning={isScanning} analyser={analyser} />
              </div>

              {/* Central Indicator Text */}
              <div className="absolute pointer-events-none flex flex-col items-center select-none text-center">
                <span className="text-[10px] font-mono tracking-[0.2em] text-[#a0a0a0]">VOCAL VIBE</span>
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={currentVibe}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                    className={`text-xl font-black tracking-wide ${activeTheme.textColor} uppercase drop-shadow-[0_0_8px_rgba(0,243,255,0.3)]`}
                  >
                    {currentVibe}
                  </motion.span>
                </AnimatePresence>
                {isScanning && (
                  <span className="text-[9px] font-mono text-[#00f3ff] mt-1 animate-pulse tracking-wide">CONNECTING...</span>
                )}
              </div>
            </div>

            {/* CONTROL HUB HUB & SWITCHES */}
            <div className="mt-8 flex flex-col items-center gap-3 w-full max-w-sm">
              <AnimatePresence mode="wait">
                {!isScanning ? (
                  <motion.button
                    key="start-btn"
                    id="start-scan-button"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    onClick={handleStartScan}
                    disabled={isSummarizing}
                    className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-xl font-bold uppercase tracking-widest font-sans text-sm border bg-[#0a0a0a] border-[#00f3ff] text-[#00f3ff] hover:bg-[#00f3ff]/10 hover:shadow-[0_0_20px_rgba(0,243,255,0.4)] hover:text-white transition-all transform hover:-translate-y-[1px] active:scale-95 disabled:opacity-40 cursor-pointer"
                  >
                    <Mic className="w-5 h-5" />
                    <span>INITIALIZE SCAN</span>
                  </motion.button>
                ) : (
                  <motion.button
                    key="stop-btn"
                    id="stop-scan-button"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    onClick={handleStopScan}
                    className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-xl font-bold uppercase tracking-widest font-sans text-sm border bg-[#0a0a0a] border-[#ff0055] text-[#ff0055] hover:bg-[#ff0055]/10 hover:shadow-[0_0_20px_rgba(255,0,85,0.4)] hover:text-white transition-all transform hover:-translate-y-[1px] active:scale-95 cursor-pointer"
                  >
                    <MicOff className="w-5 h-5 animate-pulse" />
                    <span>SYNTHESIZE SPEECH TYPE</span>
                  </motion.button>
                )}
              </AnimatePresence>

              {/* Ambient status text */}
              <p className="text-[10px] font-mono text-center text-[#777] uppercase tracking-wide">
                {!isScanning 
                  ? "Initialize vocal biosensor link to begin vibe analysis" 
                  : "Scanning continuous audio channels. Speak naturally to profile vocal timbre."}
              </p>
            </div>
          </div>

          {/* DUAL PROCESS PROGRESS OVERLAY (TRANSCRIPTION AND CONSOLE LOG) */}
          <div className={`${activeTab === "scan" ? "block" : "hidden inline md:block"} flex flex-col rounded-2xl border border-[#222]/80 bg-[#111111]/30 p-4 relative h-64`}>
            
            {/* Console HUD banner */}
            <div className="flex items-center justify-between border-b border-[#222]/60 pb-2 mb-3">
              <div className="flex items-center gap-1.5 font-mono text-xs text-[#00f3ff] tracking-wider uppercase font-bold">
                <Terminal className="w-4 h-4" />
                <span>Vocal Stream Telemetry Window</span>
              </div>
              <span className="font-mono text-[9px] text-gray-500">SAMPLE FREQ: 16000HZ</span>
            </div>

            {/* Active text terminal scroll content */}
            <div className="flex-1 overflow-y-auto font-mono text-xs leading-relaxed text-[#c0c0c0] pr-2 space-y-2 select-text custom-scrollbar">
              {isSummarizing ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-center text-gray-500 animate-pulse">
                  <span className="w-6 h-6 rounded-full border border-t-[#bc00ff] border-gray-800 animate-spin" />
                  <span>SYNTHESIZING VOCAL SPECTRUM FOR DECOMPOSITION SUMMARY...</span>
                </div>
              ) : isScanning ? (
                <div className="space-y-2">
                  <div className="text-gray-500 border-l border-cyan-500 pl-2 text-[10px] uppercase">
                    [SENSOR LINK STABLE - CAPTURING LIVE SPECIALLY FILTERED SPEECH NODAL CHUNKS]
                  </div>
                  {liveTranscript ? (
                    <p className="text-[#00f3ff] filter drop-shadow-[0_0_1px_rgba(0,243,255,0.4)]">
                      {liveTranscript}
                      <span className="inline-block w-2 h-4 ml-1 bg-[#00f3ff] animate-[ping_1.5s_infinite]" />
                    </p>
                  ) : (
                    <p className="text-gray-600 italic">Waiting for voice input to populate telemetry terminal...</p>
                  )}
                </div>
              ) : (
                <div className="text-gray-600 flex flex-col items-center justify-center h-full text-center gap-1">
                  <Sparkles className="w-5 h-5 text-[#222] mb-1" />
                  <span className="uppercase tracking-widest text-[10px] text-gray-500">[Dormant telemetry recorder]</span>
                  <p className="text-[11px] max-w-xs leading-snug text-gray-600">Vocal acoustics appear flat. Click start and speak to trigger live digital signal transcription.</p>
                </div>
              )}
              <div ref={consoleEndRef} />
            </div>
          </div>

          {/* PULSE INTERACTIVE HISTOGRAM LINE CHART */}
          <div className={`${activeTab === "charts" ? "block" : "hidden inline md:block"} flex flex-col gap-3 rounded-2xl border border-[#222]/80 bg-[#111111]/30 p-4`}>
            <div className="flex items-center gap-1.5 font-mono text-xs text-[#bc00ff] uppercase tracking-wider font-bold">
              <TrendingUp className="w-4 h-4" />
              <span>Vocal Rhythm Core Vibe Trend (7 Sessions)</span>
            </div>
            
            <MoodPulseChart 
              recordings={recordings} 
              isAuthenticated={!!currentUser} 
              onSignInClick={handleSignIn} 
            />
          </div>

        </section>

        {/* SIDEBAR HISTORY PANEL - Pinned on desktop, collapser on mobile */}
        <section className="hidden md:block md:col-span-1 border border-[#222]/80 bg-[#111111]/20 backdrop-blur-md rounded-2xl p-4 flex flex-col h-[calc(100vh-130px)] sticky top-[90px] overflow-hidden">
          
          <div className="flex items-center justify-between border-b border-[#222]/50 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[#bc00ff]" />
              <h2 className="text-xs font-bold font-sans uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#e0e0e0] to-gray-500">Telemetry Archive</h2>
            </div>
            <span className="bg-[#bc00ff]/10 text-[#bc00ff] text-[9px] font-mono px-1.5 py-0.5 rounded border border-[#bc00ff]/20">
              {recordings.length} SESSIONS
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
            {dbLoading ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-500 animate-pulse text-xs font-mono">
                <span className="w-4 h-4 rounded-full border border-t-[#bc00ff] border-gray-800 animate-spin" />
                <span>CONSTRUCTING SECURE MATRIX...</span>
              </div>
            ) : recordings.length === 0 ? (
              <div className="text-center py-10 px-2 flex flex-col items-center justify-center text-gray-600 gap-1.5">
                <Info className="w-5 h-5 text-gray-700" />
                <p className="font-mono text-[10px] uppercase">No archives on file</p>
                <p className="text-[10px] leading-relaxed max-w-[160px]">
                  {currentUser ? "Complete a scan to record your first session." : "Sync identity to store emotional telemetry."}
                </p>
              </div>
            ) : (
              recordings.map((recording) => {
                const isSelected = selectedHistoryItem?.id === recording.id;
                const formattedDate = new Date(recording.timestamp).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });
                
                const themeVal = vibeThemes[recording.vibe as VibeCategory] || vibeThemes["Calm"];

                return (
                  <div
                    key={recording.id}
                    onClick={() => setSelectedHistoryItem(recording)}
                    className={`group relative p-3 border rounded-xl cursor-pointer transition-all ${
                      isSelected 
                        ? `bg-gradient-to-br ${themeVal.bgGradient} border-[${themeVal.color}]/70 border` 
                        : "bg-[#111111]/70 border-[#222] hover:bg-[#151515] hover:border-gray-800"
                    }`}
                    style={{ borderColor: isSelected ? themeVal.color : undefined }}
                  >
                    
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[9px] text-gray-500">{formattedDate}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-bold uppercase font-sans ${themeVal.textColor}`}>
                          {recording.vibe}
                        </span>
                        <span className="text-[9px] bg-red-100 bg-opacity-5 border border-red-500/10 font-mono text-gray-400 px-1 rounded">
                          {recording.vibeScore}/10
                        </span>
                      </div>
                    </div>

                    <p className="text-xs font-sans text-gray-300 font-medium tracking-tight line-clamp-1 group-hover:text-white transition-colors">
                      {recording.summary}
                    </p>

                    <p className="text-[10px] font-mono text-gray-500 line-clamp-1 italic mt-1 bg-black/25 p-1 rounded border border-[#222]/30">
                      &ldquo;{recording.transcript}&rdquo;
                    </p>

                    {/* Delete action */}
                    <button
                      onClick={(e) => handleDeleteItem(e, recording.id!)}
                      className="absolute bottom-2.5 right-2 text-gray-600 hover:text-[#ff0055] opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-[#222]/40"
                      title="Erase session"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>

      </main>

      {/* DETAILED RECORDING FOCUS CARD (SLIDEOUT PANEL/GRID POSITION IF ACTIVE) */}
      <AnimatePresence>
        {selectedHistoryItem && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-30 bg-[#121212] border border-[#222] rounded-2xl p-5 shadow-[0_15px_40px_rgba(0,0,0,0.8)]"
          >
            <div className="flex items-center justify-between border-b border-[#222]/50 pb-2 mb-3">
              <span className="font-mono text-[10px] text-gray-500">
                {new Date(selectedHistoryItem.timestamp).toLocaleString()}
              </span>
              <button 
                onClick={() => setSelectedHistoryItem(null)} 
                className="text-gray-500 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1">
                <span className="font-sans text-xs font-semibold text-gray-400">DECIPHERED VIBE:</span>
                <span className={`font-bold text-xs uppercase ${vibeThemes[selectedHistoryItem.vibe as VibeCategory]?.textColor || "text-gray-400"}`}>
                  {selectedHistoryItem.vibe}
                </span>
              </div>
              <span className="font-mono text-xs text-transparent bg-clip-text bg-gradient-to-r from-[#00f3ff] to-[#bc00ff] font-bold">
                SCORE: {selectedHistoryItem.vibeScore}/10
              </span>
            </div>

            <p className="text-xs font-sans font-medium text-gray-300 leading-relaxed bg-[#1d1d1d]/40 p-3 rounded-xl border border-gray-800">
              {selectedHistoryItem.summary}
            </p>

            <div className="mt-4">
              <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest block mb-1">ACOUSTIC TRANSCRIPT FEED:</span>
              <div className="max-h-24 overflow-y-auto font-mono text-[11px] text-[#a0a0a0] leading-normal bg-black/60 p-2.5 rounded border border-[#222] select-text">
                &ldquo;{selectedHistoryItem.transcript}&rdquo;
              </div>
            </div>

            <button
              onClick={(e) => {
                handleDeleteItem(e, selectedHistoryItem.id!);
                setSelectedHistoryItem(null);
              }}
              className="w-full mt-4 py-2 bg-[#ff0055]/10 border border-[#ff0055]/30 hover:border-[#ff0055] hover:bg-[#ff0055]/20 text-[#ff0055] text-xs font-mono uppercase tracking-wider rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>ERASE RECORD FROM MATRIX</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MOBILE HISTORY COLLAPSED PANEL SENSOR (Toggles slide-out) */}
      <AnimatePresence>
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 flex justify-end md:hidden">
            
            {/* Backdrop lock */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />

            {/* Panel box */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative w-80 max-w-full bg-[#0d0d0d] border-l border-[#222] h-full p-4 flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[#222]/50 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#00f3ff]" />
                  <h2 className="text-xs font-semibold tracking-widest uppercase font-sans text-gray-300">Archives</h2>
                </div>
                <button 
                  onClick={() => setSidebarOpen(false)} 
                  className="p-1 text-gray-500 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                {recordings.length === 0 ? (
                  <div className="text-center py-20 px-2 text-gray-600 flex flex-col items-center gap-2">
                    <Info className="w-5 h-5 text-gray-700" />
                    <p className="font-mono text-[9px] uppercase tracking-wide">No recordings yet</p>
                  </div>
                ) : (
                  recordings.map((recording) => {
                    const themeVal = vibeThemes[recording.vibe as VibeCategory] || vibeThemes["Calm"];
                    return (
                      <div
                        key={recording.id}
                        onClick={() => {
                          setSelectedHistoryItem(recording);
                          setSidebarOpen(false);
                        }}
                        className="p-3 bg-[#111] border border-[#222] hover:border-gray-800 rounded-xl transition-all"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-mono text-[8px] text-gray-500">
                            {new Date(recording.timestamp).toLocaleDateString()}
                          </span>
                          <span className={`text-[8px] font-bold uppercase ${themeVal.textColor}`}>
                            {recording.vibe}
                          </span>
                        </div>
                        <p className="text-xs font-sans text-[#e0e0e0] font-medium leading-tight truncate">
                          {recording.summary}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FUTURISTIC SPECTRUM COMPILATION REPORT MODAL */}
      <AnimatePresence>
        {showModal && finalReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            
            {/* Modal backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />

            {/* Matrix modal body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              className="relative w-full max-w-lg bg-[#0e0e0e] border border-cyan-500/30 rounded-2xl p-6 shadow-[0_0_50px_rgba(0,243,255,0.15)] overflow-hidden"
            >
              {/* Retro top corner tech widgets */}
              <div className="absolute top-0 left-0 w-8 h-[1.5px] bg-[#00f3ff]" />
              <div className="absolute top-0 left-0 w-[1.5px] h-8 bg-[#00f3ff]" />
              <div className="absolute top-0 right-0 w-8 h-[1.5px] bg-[#00f3ff]" />
              <div className="absolute top-0 right-0 w-[1.5px] h-8 bg-[#00f3ff]" />
              
              {/* Neon Cyan dynamic scanline sweep overlay */}
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#00f3ff]/40 to-transparent animate-[sweep_2s_ease-in-out_infinite] pointer-events-none" />

              {/* Title Header */}
              <div className="text-center mb-6">
                <div className="mx-auto w-10 h-10 rounded-full bg-cyan-950/40 border border-[#00f3ff]/40 flex items-center justify-center text-[#00f3ff] mb-2 shadow-[0_0_15px_rgba(0,243,255,0.2)]">
                  <Sparkles className="w-5 h-5 animate-[spin_10s_linear_infinite]" />
                </div>
                <h3 className="font-extrabold text-[#e0e0e0] uppercase tracking-widest text-sm">Vibe Analysis Synthesis Complete</h3>
                <p className="font-mono text-[9px] text-[#a0a0a0] update-vandal max-w-xs mx-auto">Vocal bio-metrics mapped against Gemini semantic patterns</p>
              </div>

              {/* Core vibe grid display */}
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="p-3.5 rounded-xl bg-black/40 border border-[#222] text-center flex flex-col justify-center">
                  <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest block mb-1">PRIMARY VIBE</span>
                  <span className={`text-lg font-black tracking-widest ${vibeThemes[finalReport.vibe as VibeCategory]?.textColor || "text-gray-400"} uppercase`}>
                    {finalReport.vibe}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-black/40 border border-[#222] text-center flex flex-col justify-center">
                  <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest block mb-1">INTENSITY SCORE</span>
                  <span className="text-lg font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#00f3ff] to-[#bc00ff]">
                    {finalReport.vibeScore}/10
                  </span>
                </div>
              </div>

              {/* State Summary statement */}
              <div className="p-4 rounded-xl border border-[#222] bg-gradient-to-b from-[#111111]/90 to-transparent mb-5 relative">
                <div className="absolute top-2.5 left-2.5 font-mono text-[8px] text-[#00f3ff] tracking-wider uppercase">[SEMANTIC REPORT]</div>
                <p className="text-xs text-gray-200 font-sans leading-relaxed pt-4 font-medium italic">
                  &ldquo;{finalReport.summary}&rdquo;
                </p>
              </div>

              {/* Transcription log widget */}
              <div className="mb-6">
                <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest block mb-1.5">SPEECH DECRYPTION DICTIONARY:</span>
                <div className="max-h-24 overflow-y-auto bg-black p-3 rounded-lg border border-[#222] text-[11px] font-mono leading-normal text-gray-400 scroll-smooth">
                  &ldquo;{finalReport.transcript}&rdquo;
                </div>
              </div>

              {/* Dismiss / Save notification */}
              <div className="space-y-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="w-full py-3 bg-[#0a0a0a] border border-[#00f3ff]/60 hover:border-[#00f3ff] text-[#00f3ff] hover:text-white hover:bg-[#00f3ff]/10 text-xs font-mono font-bold uppercase tracking-wider rounded-xl hover:shadow-[0_0_15px_rgba(0,243,255,0.25)] transition-all cursor-pointer active:scale-95"
                >
                  DISMISS AND CLOSE REPORT
                </button>
                
                {!currentUser && (
                  <p className="text-[10px] font-mono text-gray-500 text-center uppercase tracking-wide">
                    ⚠️ Sync identity inside top banner to archive these session trends.
                  </p>
                )}
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes sweep {
          0% { top: 0%; opacity: 0.1; }
          50% { top: 100%; opacity: 0.8; }
          100% { top: 0%; opacity: 0.1; }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.1);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(225,225,225,0.06);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0,243,255,0.3);
        }
      `}</style>

    </div>
  );
}
