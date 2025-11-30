import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, X, Activity, Volume2 } from "lucide-react";
import { toast } from "sonner";

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  onClose: () => void;
}

const VoiceRecorder = ({ onTranscript, onClose }: VoiceRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGreeting, setIsGreeting] = useState(true); // NEW: Track greeting state
  const [volume, setVolume] = useState(0); 
  const [micError, setMicError] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // Timers
  const silenceStartRef = useRef<number>(0);
  const recordingStartRef = useRef<number>(0);
  const hasSpokenRef = useRef<boolean>(false); 

  useEffect(() => {
    // Start with the greeting, then record
    playGreeting();
    
    return () => {
      window.speechSynthesis.cancel(); // Stop talking if closed
      stopRecordingAndCleanup();
    };
  }, []);

  // NEW: Greeting Logic
  const playGreeting = () => {
    const hour = new Date().getHours();
    let greeting = "Good morning";
    if (hour >= 12) greeting = "Good afternoon";
    if (hour >= 17) greeting = "Good evening";
    
    const text = `${greeting}, how can I help you?`;
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Attempt to pick a decent voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang.startsWith("en"));
    if (preferredVoice) utterance.voice = preferredVoice;

    // Start recording when speech ends
    utterance.onend = () => {
      setIsGreeting(false);
      startRecording();
    };

    // Safety fallback: if TTS fails or hangs, start recording anyway after 3s
    const safetyTimer = setTimeout(() => {
        if (mediaRecorderRef.current?.state !== 'recording') {
            setIsGreeting(false);
            startRecording();
        }
    }, 4000);

    utterance.onstart = () => clearTimeout(safetyTimer);
    utterance.onerror = () => {
        setIsGreeting(false);
        startRecording();
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const startRecording = async () => {
    if (mediaRecorderRef.current?.state === 'recording') return; // Prevent double start

    try {
      setMicError(false);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
            echoCancellation: true, 
            noiseSuppression: true,
            autoGainControl: true
        } 
      });
      
      const mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      hasSpokenRef.current = false; 
      recordingStartRef.current = performance.now();

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
        
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        
        if (audioBlob.size > 500) { 
            await handleUpload(audioBlob, ext);
        } else {
            onClose();
        }
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(100); 
      setIsRecording(true);
      
      setupSilenceDetection(stream);

    } catch (err) {
      console.error("Mic Error:", err);
      setMicError(true);
      toast.error("Could not access microphone.");
    }
  };

  const setupSilenceDetection = async (stream: MediaStream) => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    audioContextRef.current = audioCtx;
    
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024; 
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    silenceStartRef.current = performance.now(); 

    const detect = () => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") return;

      analyser.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for(let i = 10; i < 200; i++) {
        sum += dataArray[i];
      }
      const average = sum / 190;
      
      setVolume(Math.min(100, average * 5));

      const THRESHOLD = 1.5; 
      const now = performance.now();
      const recordingDuration = now - recordingStartRef.current;

      if (average > THRESHOLD) {
        silenceStartRef.current = now; 
        hasSpokenRef.current = true; 
      } else {
        const silentDuration = now - silenceStartRef.current;
        
        // Wait 3s before enforcing silence checks
        if (recordingDuration > 3000) {
            // Stop if silent for 2s (after speaking) or 8s (total timeout)
            if ((hasSpokenRef.current && silentDuration > 2000) || silentDuration > 8000) {
                stopRecording();
                return;
            }
        }
      }

      animationFrameRef.current = requestAnimationFrame(detect);
    };

    detect();
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
      stopRecordingAndCleanup();
    }
  };

  const stopRecordingAndCleanup = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
    }
  };

  const handleUpload = async (audioBlob: Blob, ext: string) => {
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, `voice.${ext}`);

      const { data, error } = await supabase.functions.invoke("transcribe", {
        body: formData,
      });

      if (error) throw error;

      const cleanText = data?.text?.trim() || "";
      const hallucinations = ["you", "thank you", "thanks", "subtitles by", "watching", "mb", "."];
      const isHallucination = hallucinations.includes(cleanText.toLowerCase().replace(/[.,!]/g, ''));

      if (cleanText && !isHallucination) {
        onTranscript(cleanText);
      } else {
        toast.error("I couldn't hear you. Please try again.");
        onClose(); 
      }
    } catch (error) {
      console.error("Transcription error:", error);
      toast.error("Voice processing failed.");
    } finally {
      setIsProcessing(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-background border rounded-2xl p-6 shadow-xl flex flex-col items-center gap-6 w-80 relative animate-in fade-in zoom-in duration-200">
        <button 
          onClick={() => { stopRecordingAndCleanup(); onClose(); }}
          className="absolute top-4 right-4 p-1 hover:bg-muted rounded-full transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        <div className="text-center space-y-2">
          <h3 className="font-semibold text-lg">
            {isGreeting ? "Assistant" : isProcessing ? "Processing..." : isRecording ? "Listening..." : "Voice Input"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isGreeting 
              ? "Speaking..." 
              : isProcessing 
                ? "Transcribing your voice..." 
                : "Speak now. I'll auto-send in 2s."}
          </p>
        </div>

        <div className="relative flex items-center justify-center h-20 w-20">
          {/* Greeting Animation */}
          {isGreeting && (
             <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                <Volume2 className="w-8 h-8 text-primary" />
             </div>
          )}

          {/* Recording Animation */}
          {isRecording && (
            <span 
                className="absolute inset-0 rounded-full bg-primary/20 transition-all duration-75" 
                style={{ transform: `scale(${1 + (volume / 30)})` }}
            />
          )}
          
          {!isGreeting && isProcessing && (
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}

          {!isGreeting && !isProcessing && isRecording && (
            <Button
              size="lg"
              variant="destructive"
              className="h-16 w-16 rounded-full shadow-lg z-10"
              onClick={stopRecording}
            >
              <Square className="w-6 h-6 fill-current" />
            </Button>
          )}
        </div>
        
        {isRecording && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="w-3 h-3 animate-pulse text-green-500" />
                {volume > 2 ? "Voice Detected" : "Listening..."}
            </div>
        )}

        {micError && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 p-2 rounded">
                <AlertCircle className="w-4 h-4" />
                Check browser permissions
            </div>
        )}
      </div>
    </div>
  );
};

export default VoiceRecorder;