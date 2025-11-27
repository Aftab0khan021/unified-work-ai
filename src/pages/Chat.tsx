import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mic, Send, Sparkles, LogOut, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import VoiceRecorder from "@/components/VoiceRecorder";

type Message = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

const Chat = () => {
  const [user, setUser] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  // FIX: Use state to track workspace ID so it updates dynamically
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    localStorage.getItem("activeWorkspaceId")
  );

  // FIX: Listen for storage changes (Workspace switches)
  useEffect(() => {
    const handleStorageChange = () => {
      setWorkspaceId(localStorage.getItem("activeWorkspaceId"));
    };
    
    // Check every second if workspace changed (Simple polling for robustness)
    const interval = setInterval(handleStorageChange, 1000);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
      } else {
        navigate("/auth");
      }
    });
  }, [navigate]);

  // FIX: Re-fetch history whenever Workspace ID or User changes
  useEffect(() => {
    if (user && workspaceId) {
      fetchHistory(user.id, workspaceId);
    } else {
      setMessages([]); // Clear messages if no workspace
    }
  }, [user, workspaceId]);

  const fetchHistory = async (userId: string, wsId: string) => {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("user_id", userId)
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setMessages(data as any);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSignOut = async () => {
    localStorage.removeItem("activeWorkspaceId");
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const sendMessage = async (messageText: string) => {
    // FIX: Check current state, not just load time variable
    const currentWorkspaceId = localStorage.getItem("activeWorkspaceId"); 
    
    if (!messageText.trim() || isLoading) return;
    if (!currentWorkspaceId) {
        toast({ title: "No Workspace", description: "Select a workspace first", variant: "destructive" });
        return;
    }

    const userContent = messageText;
    setInput("");
    setIsLoading(true);

    try {
      // 1. Save User Message
      const { error: msgError } = await supabase
        .from("chat_messages")
        .insert({ 
            role: "user", 
            content: userContent, 
            user_id: user.id,
            workspace_id: currentWorkspaceId 
        });

      if (msgError) throw msgError;

      const tempUserMsg: Message = { role: "user", content: userContent };
      setMessages((prev) => [...prev, tempUserMsg]);

      // 2. Call AI
      const { data, error } = await supabase.functions.invoke("chat", {
        body: { 
            messages: [...messages, tempUserMsg],
            user_id: user.id,
            workspace_id: currentWorkspaceId // FIX: Pass fresh ID
        },
      });

      if (error) throw error;

      if (data?.reply) {
        // 3. Save Assistant Reply
        await supabase
          .from("chat_messages")
          .insert({ 
              role: "assistant", 
              content: data.reply, 
              user_id: user.id,
              workspace_id: currentWorkspaceId 
          });

        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
        
        if (user) fetchHistory(user.id, currentWorkspaceId);
      }
    } catch (error: any) {
      console.error("Chat error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to get response",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleVoiceTranscript = (transcript: string) => {
    sendMessage(transcript);
    setShowVoiceRecorder(false);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              USWA Assistant
            </h1>
          </div>
          <div className="flex items-center gap-3">
             <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
              <Avatar className="w-8 h-8">
                <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
              </Avatar>
              <span>{user.email}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto container mx-auto px-4 py-8">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4 text-center opacity-80">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Welcome to USWA</h2>
              <p className="text-muted-foreground max-w-md">
                {workspaceId ? "Ask about tasks or documents in this workspace." : "Please select a workspace to start."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-3xl mx-auto">
            {messages.map((message, i) => (
              <div key={i} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "assistant" && (
                  <Avatar className="w-8 h-8 mt-1"><AvatarFallback><Sparkles className="w-4 h-4 text-primary" /></AvatarFallback></Avatar>
                )}
                <div className={`rounded-2xl px-5 py-3 max-w-[80%] shadow-sm ${
                  message.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border"
                }`}>
                  <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
                </div>
                {message.role === "user" && (
                   <Avatar className="w-8 h-8 mt-1"><AvatarFallback><User className="w-4 h-4" /></AvatarFallback></Avatar>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <Avatar className="w-8 h-8 mt-1"><AvatarFallback><Sparkles className="w-4 h-4 text-primary" /></AvatarFallback></Avatar>
                <div className="rounded-2xl px-5 py-3 bg-card border flex items-center">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t bg-card/50 backdrop-blur-sm p-4">
        <form onSubmit={handleSubmit} className="flex gap-2 max-w-3xl mx-auto relative">
          <Input 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            placeholder="Type 'Create task: ...' or ask a question" 
            disabled={isLoading || !workspaceId}
            className="pr-12"
          />
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            className="absolute right-14 top-0 h-full text-muted-foreground hover:text-primary"
            onClick={() => setShowVoiceRecorder(true)}
            disabled={!workspaceId}
          >
            <Mic className="w-5 h-5" />
          </Button>
          <Button type="submit" disabled={isLoading || !input.trim() || !workspaceId}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>

      {showVoiceRecorder && (
        <VoiceRecorder onTranscript={handleVoiceTranscript} onClose={() => setShowVoiceRecorder(false)} />
      )}
    </div>
  );
};

export default Chat;