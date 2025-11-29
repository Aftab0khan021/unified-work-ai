import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mic, Send, Sparkles, LogOut, User, Plus, MessageSquare, Trash2, Menu, X } from "lucide-react";
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
  const [user, setUser] = useState<any>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const workspaceId = localStorage.getItem("activeWorkspaceId");

  // 1. Init User & Fetch Sessions
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        if (workspaceId) {
          fetchSessions(session.user.id, workspaceId);
          subscribeToSessions(workspaceId); // <--- REALTIME LISTENER
        } else {
            console.warn("No activeWorkspaceId found in localStorage");
        }
      } else {
        navigate("/auth");
      }
    });
  }, [navigate, workspaceId]);

  // 2. Fetch Sessions List (The "Sidebar")
  const fetchSessions = async (userId: string, wsId: string) => {
    console.log("Fetching sessions for workspace:", wsId);
    
    // Check if RLS is hiding them
    const { data, error } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching sessions:", error);
    } else {
      console.log("Sessions found:", data?.length);
      setSessions(data || []);
    }
  };

  // 3. Realtime Subscription (Updates sidebar automatically)
  const subscribeToSessions = (wsId: string) => {
    const channel = supabase
      .channel('public:chat_sessions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_sessions', filter: `workspace_id=eq.${wsId}` },
        (payload) => {
            console.log("Session update received:", payload);
            // Refresh full list to keep sort order correct
            if (user?.id) fetchSessions(user.id, wsId);
        }
      )
      .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
  };

  // 4. Select a Session
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

  // 5. Delete Session (Trash Icon)
  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const { error } = await supabase.from("chat_sessions").delete().eq("id", sessionId);
    if (!error) {
      // Realtime will handle the update, but we can do optimistic too
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

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;
    if (!workspaceId) {
        toast({ title: "Error", description: "No workspace selected.", variant: "destructive" });
        return;
    }

    const userContent = messageText;
    setInput("");
    setIsLoading(true);

    try {
      let activeSessionId = currentSessionId;

      // Create Session if needed
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
        // Note: Realtime subscription will also pick this up
      }

      // Optimistic Update
      const tempId = crypto.randomUUID();
      const tempMsg: Message = { id: tempId, role: "user", content: userContent };
      setMessages(prev => [...prev, tempMsg]);

      // Save User Message
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

      // Update ID
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: savedUserMsg.id } : m));

      // Call AI
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Sidebar List Component
  const SidebarList = () => (
    <div className="flex flex-col h-full">
      <Button onClick={handleNewChat} className="w-full justify-start gap-2 mb-4" variant="outline">
        <Plus className="w-4 h-4" /> New Chat
      </Button>
      <ScrollArea className="flex-1">
        {sessions.length === 0 && (
            <p className="text-xs text-muted-foreground text-center mt-4">No recent chats</p>
        )}
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
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 flex-col border-r bg-card/30 p-4">
        <div className="flex items-center gap-2 mb-6 px-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="font-semibold">USWA AI</span>
        </div>
        <SidebarList />
      </div>

      {/* Main Chat Area */}
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
                  <button 
                    onClick={() => deleteMessage(message.id)}
                    className={`absolute -top-2 ${message.role === 'user' ? '-left-2' : '-right-2'} p-1 rounded-full bg-background border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive`}
                  >
                    <X className="w-3 h-3" />
                  </button>
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
                placeholder="Message USWA..." 
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