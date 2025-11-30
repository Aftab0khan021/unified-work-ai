import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, X, Activity, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  onClose: () => void;
}

const VoiceRecorder = ({ onTranscript, onClose }: VoiceRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
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
    startRecording();
    return () => {
      stopRecordingAndCleanup();
    };
  }, []);

  const startRecording = async () => {
    try {
      setMicError(false);
      
      // FIX 1: Request enhanced audio to boost voice volume
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
            echoCancellation: true, 
            noiseSuppression: true,
            autoGainControl: true // Helps pick up soft voices
        } 
      });
      
      // FIX 2: Let browser pick the best container (no mimeType forced)
      // This prevents "File Corrupted" errors on Safari/Edge
      const mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      hasSpokenRef.current = false; 
      recordingStartRef.current = performance.now();

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        // Determine extension based on browser mimeType
        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
        
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        
        if (audioBlob.size > 500) { 
            await handleUpload(audioBlob, ext);
        } else {
            onClose();
        }
        // Stop mic hardware
        stream.getTracks().forEach((track) => track.stop());
      };

      // Collect data frequently to avoid losing the end of the sentence
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
      if (!isRecording && !mediaRecorderRef.current) return;

      analyser.getByteFrequencyData(dataArray);
      
      // Calculate Volume
      let sum = 0;
      // Focus on human voice frequency range (approx index 10 to 200 in 1024 FFT)
      for(let i = 10; i < 200; i++) {
        sum += dataArray[i];
      }
      const average = sum / 190;
      
      // Scale visual volume
      setVolume(Math.min(100, average * 5));

      // Threshold: Very sensitive (1.5)
      const THRESHOLD = 1.5; 
      const now = performance.now();
      const recordingDuration = now - recordingStartRef.current;

      if (average > THRESHOLD) {
        silenceStartRef.current = now; // Reset silence timer
        hasSpokenRef.current = true; 
      } else {
        const silentDuration = now - silenceStartRef.current;
        
        // FIX 3: "Warm Up" Period (3 seconds)
        // We ignore silence for the first 3 seconds to give you time to start speaking
        if (recordingDuration > 3000) {
            
            // FIX 4: Detection Logic
            // Stop if:
            // A) You spoke before, and now you've been silent for 2 seconds (Natural Pause)
            // B) You never spoke, and it's been 8 seconds (Timeout)
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
      // Send dynamically detected extension
      formData.append("file", audioBlob, `voice.${ext}`);

      const { data, error } = await supabase.functions.invoke("transcribe", {
        body: formData,
      });

      if (error) throw error;

      const cleanText = data?.text?.trim() || "";

      // FIX 5: Aggressive Hallucination Filter
      // Whisper often outputs these phrases when it hears silence
      const hallucinations = [
        "you", "thank you", "thanks", "subtitles by", "watching", "mb", "."
      ];
      
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
            {isProcessing ? "Processing..." : isRecording ? "Listening..." : "Voice Input"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {micError 
              ? "Microphone access denied" 
              : isProcessing 
                ? "Transcribing..." 
                : "Speak now. I'll wait 2s after you stop."}
          </p>
        </div>

        <div className="relative flex items-center justify-center h-20 w-20">
          {isRecording && (
            <span 
                className="absolute inset-0 rounded-full bg-primary/20 transition-all duration-75" 
                style={{ transform: `scale(${1 + (volume / 30)})` }}
            />
          )}
          
          {isProcessing ? (
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
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
                {volume > 2 ? "Detecting Voice..." : "Listening for speech..."}
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