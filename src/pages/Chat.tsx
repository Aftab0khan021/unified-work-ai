import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mic, Send, Sparkles, LogOut, User, Plus, MessageSquare, Trash2, Menu, Volume2, StopCircle, Share2, Copy, Pencil, X, Check } from "lucide-react"; 
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
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
  
  // EDIT STATE
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  // TTS State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
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
    setEditingMessageId(null); 
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
    setEditingMessageId(null);
    setMessages([]);
    setInput("");
  };

  const deleteSession = async (e: React.MouseEvent | null, sessionId: string) => {
    if (e) e.stopPropagation();
    const { error } = await supabase.from("chat_sessions").delete().eq("id", sessionId);
    if (!error) {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId) handleNewChat();
      toast({ title: "Chat deleted" });
    }
  };

  const shareSession = async (e: React.MouseEvent | null, sessionId: string) => {
    if (e) e.stopPropagation();
    
    const { data: msgs, error } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error || !msgs) {
        toast({ title: "Error", description: "Could not fetch chat.", variant: "destructive" });
        return;
    }

    const text = msgs.map(m => `[${m.role === 'user' ? 'User' : 'AI'}]: ${m.content}`).join('\n\n');
    try {
        await navigator.clipboard.writeText(text);
        toast({ title: "Copied!", description: "Chat history copied to clipboard." });
    } catch (err) {
        toast({ title: "Error", description: "Clipboard access failed.", variant: "destructive" });
    }
  };

  const deleteMessage = async (messageId: string) => {
    const { error } = await supabase.from("chat_messages").delete().eq("id", messageId);
    if (!error) {
      setMessages(prev => prev.filter(m => m.id !== messageId));
      if (editingMessageId === messageId) {
        setEditingMessageId(null);
        setInput("");
      }
      toast({ title: "Message removed" });
    }
  };

  const speakText = (text: string, messageId: string) => {
    if (speakingMessageId === messageId) {
        synth.cancel();
        setSpeakingMessageId(null);
        setIsSpeaking(false);
        return;
    }
    synth.cancel();
    setSpeakingMessageId(null);
    setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1; 
        const voices = synth.getVoices();
        const preferredVoice = voices.find(v => v.lang.startsWith(navigator.language || 'en')) || voices[0];
        if (preferredVoice) utterance.voice = preferredVoice;
        utterance.onstart = () => { setIsSpeaking(true); setSpeakingMessageId(messageId); };
        utterance.onend = () => { setIsSpeaking(false); setSpeakingMessageId(null); };
        utterance.onerror = () => { setIsSpeaking(false); setSpeakingMessageId(null); };
        synth.speak(utterance);
    }, 50);
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Text copied to clipboard." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to copy text.", variant: "destructive" });
    }
  };

  const handleEdit = (message: Message) => {
    setEditingMessageId(message.id);
    setInput(message.content);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setInput("");
  };

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;
    if (!workspaceId) { toast({ title: "Error", description: "No workspace selected.", variant: "destructive" }); return; }

    setIsLoading(true);

    try {
      // EDIT EXISTING MESSAGE
      if (editingMessageId) {
        const { error } = await supabase
          .from("chat_messages")
          .update({ content: messageText })
          .eq("id", editingMessageId);

        if (error) throw error;

        setMessages(prev => prev.map(m => m.id === editingMessageId ? { ...m, content: messageText } : m));
        setEditingMessageId(null);
        setInput("");
        setIsLoading(false);
        toast({ title: "Message updated" });
        return; 
      }

      // SEND NEW MESSAGE
      const userContent = messageText;
      setInput("");
      
      let activeSessionId = currentSessionId;
      if (!activeSessionId) {
        const title = userContent.slice(0, 30) + (userContent.length > 30 ? "..." : "");
        const { data: newSession, error: sessionError } = await supabase
          .from("chat_sessions")
          .insert({ user_id: user.id, workspace_id: workspaceId, title: title })
          .select().single();
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
        .insert({ role: "user", content: userContent, user_id: user.id, workspace_id: workspaceId, session_id: activeSessionId })
        .select().single();
      if (msgError) throw msgError;

      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: savedUserMsg.id } : m));

      const { data, error } = await supabase.functions.invoke("chat", {
        body: { messages: [...messages, { role: "user", content: userContent }], user_id: user.id, workspace_id: workspaceId },
      });
      if (error) throw error;

      if (data?.reply) {
        const { data: savedAiMsg } = await supabase
          .from("chat_messages")
          .insert({ role: "assistant", content: data.reply, user_id: user.id, workspace_id: workspaceId, session_id: activeSessionId })
          .select().single();
        setMessages(prev => [...prev, { id: savedAiMsg?.id || crypto.randomUUID(), role: "assistant", content: data.reply }]);
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

  // Reusable Sidebar Render
  const renderSidebarList = () => (
    <div className="flex flex-col h-full p-2 w-full">
       <div className="flex items-center gap-2 mb-4 px-2 pt-2 shrink-0">
          <Sparkles className="w-5 h-5 text-primary shrink-0" />
          <span className="font-semibold truncate">USWA AI</span>
        </div>
      <Button onClick={handleNewChat} className="w-full justify-start gap-2 mb-4 shrink-0" variant="outline">
        <Plus className="w-4 h-4 shrink-0" /> <span className="truncate">New Chat</span>
      </Button>
      <ScrollArea className="flex-1 -mx-2 px-2 w-full">
        {sessions.length === 0 && <div className="text-xs text-muted-foreground text-center mt-4">No history</div>}
        <div className="space-y-1 pb-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => selectSession(session.id)}
              className={`group flex items-center justify-between p-2 rounded-lg text-sm cursor-pointer hover:bg-accent transition-colors ${
                currentSessionId === session.id ? "bg-accent font-medium" : "text-muted-foreground"
              }`}
            >
              {/* FIX: Title shrinks (min-w-0), Buttons DO NOT shrink (shrink-0) */}
              <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0 mr-1">
                <MessageSquare className="w-4 h-4 shrink-0" />
                <span className="truncate">{session.title}</span>
              </div>
              
              {/* FIX: Removed opacity logic. Buttons are always visible. Added min-w-fit. */}
              <div className="flex items-center gap-1 shrink-0 min-w-fit">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={(e) => shareSession(e, session.id)} title="Share Chat">
                  <Share2 className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={(e) => deleteSession(e, session.id)} title="Delete Chat">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
       <div className="mt-auto pt-4 border-t flex items-center justify-between shrink-0 w-full overflow-hidden">
          <div className="flex items-center gap-2 text-xs text-muted-foreground overflow-hidden flex-1 min-w-0">
            <Avatar className="w-6 h-6 shrink-0"><AvatarFallback><User className="w-3 h-3" /></AvatarFallback></Avatar>
            <span className="truncate">{user.email}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 ml-2" onClick={handleSignOut}><LogOut className="w-3 h-3" /></Button>
        </div>
    </div>
  );

  // Reusable Chat Render
  const renderChatArea = () => (
    <div className="flex flex-col h-full w-full min-w-0">
        <header className="md:hidden border-b p-4 flex items-center justify-between bg-background z-10 shrink-0">
          <Sheet>
            <SheetTrigger asChild><Button variant="ghost" size="icon"><Menu className="w-5 h-5" /></Button></SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">{renderSidebarList()}</SheetContent>
          </Sheet>
          <span className="font-semibold">USWA Assistant</span>
          {currentSessionId ? (
             <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={(e) => shareSession(e, currentSessionId!)}><Share2 className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" onClick={(e) => deleteSession(e, currentSessionId!)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
             </div>
          ) : <div className="w-8" />}
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-6 overscroll-none w-full">
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
                  <Avatar className="w-8 h-8 mt-1 shrink-0"><AvatarFallback><Sparkles className="w-4 h-4 text-primary" /></AvatarFallback></Avatar>
                )}
                <div className={`relative max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                  message.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border"
                }`}>
                  <p className="whitespace-pre-wrap leading-relaxed break-words">{message.content}</p>
                  
                  {/* FIX: shrink-0 and min-w-fit ensures buttons NEVER disappear even if screen is narrow */}
                  <div className={`flex items-center gap-1 mt-2 shrink-0 min-w-fit flex-nowrap ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {message.role === 'assistant' && (
                        <button onClick={() => speakText(message.content, message.id)} className="p-1 rounded hover:bg-black/10 transition-colors" title={speakingMessageId === message.id ? "Stop" : "Read Aloud"}>
                            {speakingMessageId === message.id ? <StopCircle className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                    )}
                    <button onClick={() => handleCopy(message.content)} className="p-1 rounded hover:bg-black/10 transition-colors" title="Copy Text">
                        <Copy className="w-4 h-4" />
                    </button>
                    {message.role === 'user' && (
                         <button onClick={() => handleEdit(message)} className="p-1 rounded hover:bg-black/10 transition-colors" title="Edit Message">
                            <Pencil className="w-4 h-4" />
                         </button>
                    )}
                    <button onClick={() => deleteMessage(message.id)} className="p-1 rounded hover:bg-black/10 transition-colors hover:text-destructive" title="Delete Message">
                        <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {message.role === "user" && (
                   <Avatar className="w-8 h-8 mt-1 shrink-0"><AvatarFallback><User className="w-4 h-4" /></AvatarFallback></Avatar>
                )}
              </div>
            ))
          )}
          {isLoading && <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin" /></div>}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-background/80 backdrop-blur-sm border-t shrink-0 z-20 w-full">
          {editingMessageId && (
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 px-2">
                <span>Editing message...</span>
                <button onClick={cancelEdit} className="hover:text-primary flex items-center gap-1"><X className="w-3 h-3" /> Cancel</button>
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="max-w-3xl mx-auto relative flex gap-2">
            <div className="relative flex-1">
              <Input 
                autoFocus
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                placeholder={editingMessageId ? "Update your message..." : "Ask AI..."}
                disabled={isLoading} 
                className="pr-10" 
              />
              {!editingMessageId && (
                  <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setShowVoiceRecorder(true)}>
                    <Mic className="w-4 h-4" />
                  </Button>
              )}
            </div>
            <Button type="submit" disabled={isLoading || !input.trim()}>
                {editingMessageId ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
    </div>
  );

  if (!user) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="h-full w-full bg-background overflow-hidden">
        {/* DESKTOP: Resizable Layout */}
        <div className="hidden md:flex h-full w-full">
            <ResizablePanelGroup direction="horizontal" className="h-full w-full">
                {/* Fixed minSize to prevent disappearing content */}
                <ResizablePanel defaultSize={20} minSize={15} maxSize={40} className="border-r bg-muted/30">
                    {renderSidebarList()}
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={80}>
                    {renderChatArea()}
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>

        {/* MOBILE: Standard Layout */}
        <div className="md:hidden h-full flex flex-col w-full">
            {renderChatArea()}
        </div>

      {showVoiceRecorder && <VoiceRecorder onTranscript={(t) => { setInput(t); sendMessage(t); setShowVoiceRecorder(false); }} onClose={() => setShowVoiceRecorder(false)} />}
    </div>
  );
};

export default Chat;