import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mic, Send, Sparkles, LogOut, User, Plus, MessageSquare, Trash2, Menu, X, Volume2, StopCircle } from "lucide-react"; 
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import VoiceRecorder from "@/components/VoiceRecorder";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  session_id?: string;
};

type Session = {
  id: string;
  title: string;
  created_at: string;
};

const Chat = () => {
  const workspaceId = localStorage.getItem("activeWorkspaceId");

  const [user, setUser] = useState<any>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  
  // TTS State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synth = window.speechSynthesis;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
      } else {
        navigate("/auth");
      }
    });
  }, [navigate]);

  useEffect(() => {
    if (user?.id && workspaceId) {
      fetchSessions(user.id, workspaceId);
    }
  }, [user, workspaceId]);

  useEffect(() => {
    return () => {
        if (synth.speaking) synth.cancel();
    };
  }, []);

  const fetchSessions = async (userId: string, wsId: string) => {
    const { data, error } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setSessions(data);
    }
  };

  const selectSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setMessages(data as any);
    }
  };

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
  };

  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const { error } = await supabase.from("chat_sessions").delete().eq("id", sessionId);
    if (!error) {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId) handleNewChat();
      toast({ title: "Chat deleted" });
    }
  };

  const deleteMessage = async (messageId: string) => {
    const { error } = await supabase.from("chat_messages").delete().eq("id", messageId);
    if (!error) {
      setMessages(prev => prev.filter(m => m.id !== messageId));
      toast({ title: "Message removed" });
    }
  };

  const speakText = (text: string) => {
    synth.cancel();
    setIsSpeaking(false);

    setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1; 
        utterance.pitch = 1;
        
        const voices = synth.getVoices();
        const preferredVoice = voices.find(v => v.name.includes("Google") && v.lang.startsWith("en")) || voices.find(v => v.lang.startsWith("en"));
        if (preferredVoice) utterance.voice = preferredVoice;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        
        synth.speak(utterance);
    }, 10);
  };

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;
    
    if (!workspaceId) {
        toast({ title: "No Workspace", description: "Please select a workspace first.", variant: "destructive" });
        return;
    }

    const userContent = messageText;
    setInput("");
    setIsLoading(true);

    try {
      let activeSessionId = currentSessionId;

      if (!activeSessionId) {
        const title = userContent.slice(0, 30) + (userContent.length > 30 ? "..." : "");
        const { data: newSession, error: sessionError } = await supabase
          .from("chat_sessions")
          .insert({ 
            user_id: user.id, 
            workspace_id: workspaceId,
            title: title 
          })
          .select()
          .single();

        if (sessionError) throw sessionError;
        activeSessionId = newSession.id;
        setCurrentSessionId(activeSessionId);
        setSessions(prev => [newSession, ...prev]);
      }

      const tempId = crypto.randomUUID();
      const tempMsg: Message = { id: tempId, role: "user", content: userContent };
      setMessages(prev => [...prev, tempMsg]);

      const { data: savedUserMsg, error: msgError } = await supabase
        .from("chat_messages")
        .insert({ 
            role: "user", 
            content: userContent, 
            user_id: user.id, 
            workspace_id: workspaceId,
            session_id: activeSessionId
        })
        .select()
        .single();

      if (msgError) throw msgError;

      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: savedUserMsg.id } : m));

      const { data, error } = await supabase.functions.invoke("chat", {
        body: { 
            messages: [...messages, { role: "user", content: userContent }], 
            user_id: user.id,
            workspace_id: workspaceId 
        },
      });

      if (error) throw error;

      if (data?.reply) {
        const { data: savedAiMsg } = await supabase
          .from("chat_messages")
          .insert({ 
              role: "assistant", 
              content: data.reply, 
              user_id: user.id, 
              workspace_id: workspaceId,
              session_id: activeSessionId
          })
          .select()
          .single();

        setMessages(prev => [...prev, { 
            id: savedAiMsg?.id || crypto.randomUUID(), 
            role: "assistant", 
            content: data.reply 
        }]);
      }
    } catch (error: any) {
      console.error("Chat error:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    localStorage.removeItem("activeWorkspaceId");
    await supabase.auth.signOut();
    navigate("/auth");
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const SidebarList = () => (
    <div className="flex flex-col h-full">
      <Button onClick={handleNewChat} className="w-full justify-start gap-2 mb-4" variant="outline">
        <Plus className="w-4 h-4" /> New Chat
      </Button>
      <ScrollArea className="flex-1">
        {sessions.length === 0 && <div className="text-xs text-muted-foreground text-center mt-4">No history</div>}
        <div className="space-y-1 pr-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => selectSession(session.id)}
              className={`group flex items-center justify-between p-2 rounded-lg text-sm cursor-pointer hover:bg-accent transition-colors ${
                currentSessionId === session.id ? "bg-accent font-medium" : "text-muted-foreground"
              }`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <MessageSquare className="w-4 h-4 shrink-0" />
                <span className="truncate">{session.title}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => deleteSession(e, session.id)}
              >
                <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );

  if (!user) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <div className="hidden md:flex w-64 flex-col border-r bg-card/30 p-4">
        <div className="flex items-center gap-2 mb-6 px-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="font-semibold">USWA AI</span>
        </div>
        <SidebarList />
        <div className="mt-auto pt-4 border-t flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Avatar className="w-6 h-6"><AvatarFallback><User className="w-3 h-3" /></AvatarFallback></Avatar>
            <span className="truncate max-w-[100px]">{user.email}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleSignOut}><LogOut className="w-3 h-3" /></Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full relative">
        <header className="md:hidden border-b p-4 flex items-center justify-between bg-background z-10">
          <Sheet>
            <SheetTrigger asChild><Button variant="ghost" size="icon"><Menu className="w-5 h-5" /></Button></SheetTrigger>
            <SheetContent side="left" className="w-64 p-4"><SidebarList /></SheetContent>
          </Sheet>
          <span className="font-semibold">USWA Assistant</span>
          <div className="w-8" /> 
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-50">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">How can I help you?</h3>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`group flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "assistant" && (
                  <Avatar className="w-8 h-8 mt-1"><AvatarFallback><Sparkles className="w-4 h-4 text-primary" /></AvatarFallback></Avatar>
                )}
                <div className={`relative max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                  message.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border"
                }`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  
                  {/* FIX: Buttons moved BELOW the text, cleaner look */}
                  <div className={`flex items-center gap-2 mt-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    
                    {/* Speak Button (Assistant Only) */}
                    {message.role === 'assistant' && (
                        <button 
                            onClick={() => speakText(message.content)}
                            className="p-1 rounded hover:bg-black/5 transition-colors"
                            title="Read Aloud"
                        >
                            {isSpeaking ? <StopCircle className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4 opacity-50 hover:opacity-100" />}
                        </button>
                    )}
                    
                    {/* Delete Button */}
                    <button 
                        onClick={() => deleteMessage(message.id)}
                        className={`p-1 rounded transition-colors ${
                            message.role === 'user' 
                            ? 'hover:bg-white/20 text-primary-foreground/70 hover:text-primary-foreground' 
                            : 'hover:bg-black/5 opacity-50 hover:opacity-100 hover:text-destructive'
                        }`}
                        title="Delete Message"
                    >
                        {/* Using Trash2 as it is more semantic for delete than X */}
                        <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {message.role === "user" && (
                   <Avatar className="w-8 h-8 mt-1"><AvatarFallback><User className="w-4 h-4" /></AvatarFallback></Avatar>
                )}
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex gap-3">
              <Avatar className="w-8 h-8 mt-1"><AvatarFallback><Sparkles className="w-4 h-4 text-primary" /></AvatarFallback></Avatar>
              <div className="rounded-2xl px-4 py-3 bg-card border flex items-center">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-background/80 backdrop-blur-sm border-t">
          <form 
            onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} 
            className="max-w-3xl mx-auto relative flex gap-2"
          >
            <div className="relative flex-1">
              <Input 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                placeholder="Ask AI or create task..." 
                disabled={isLoading}
                className="pr-10"
              />
              <Button 
                type="button" 
                variant="ghost" 
                size="icon" 
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-primary"
                onClick={() => setShowVoiceRecorder(true)}
              >
                <Mic className="w-4 h-4" />
              </Button>
            </div>
            <Button type="submit" disabled={isLoading || !input.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
      {showVoiceRecorder && <VoiceRecorder onTranscript={(t) => { setInput(t); sendMessage(t); setShowVoiceRecorder(false); }} onClose={() => setShowVoiceRecorder(false)} />}
    </div>
  );
};

export default Chat;