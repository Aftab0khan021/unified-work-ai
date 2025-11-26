import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Mic, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface VoiceRecorderProps {
  onTranscript: (transcript: string) => void;
  onClose: () => void;
}

const VoiceRecorder = ({ onTranscript, onClose }: VoiceRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    startRecording();
    return () => {
      stopRecording();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        await processAudio(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
      toast({
        title: "Error",
        description: "Failed to access microphone",
        variant: "destructive",
      });
      onClose();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      reader.onloadend = async () => {
        const base64Audio = reader.result?.toString().split(",")[1];
        
        if (!base64Audio) {
          throw new Error("Failed to convert audio");
        }

        const { data, error } = await supabase.functions.invoke("transcribe", {
          body: { audio: base64Audio },
        });

        if (error) throw error;

        if (data?.text) {
          onTranscript(data.text);
        } else {
          throw new Error("No transcription received");
        }
      };
    } catch (error: any) {
      console.error("Transcription error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to transcribe audio",
        variant: "destructive",
      });
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStop = () => {
    stopRecording();
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-card border rounded-xl shadow-lg p-8 flex flex-col items-center space-y-6 max-w-sm w-full mx-4">
        {isProcessing ? (
          <>
            <Loader2 className="w-16 h-16 text-primary animate-spin" />
            <p className="text-lg font-medium">Processing audio...</p>
          </>
        ) : (
          <>
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center animate-pulse">
                <Mic className="w-12 h-12 text-white" />
              </div>
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">Recording...</p>
              <p className="text-sm text-muted-foreground">Speak clearly into your microphone</p>
            </div>
            <div className="flex gap-3 w-full">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleStop}>
                Stop
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VoiceRecorder;