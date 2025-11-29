import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Hash, Send, User, Loader2, MoreVertical, Edit2, Trash2, X, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

type Message = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles: { full_name: string } | null;
};

type Channel = {
  id: string;
  name: string;
};

export default function TeamChat() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  
  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const workspaceId = localStorage.getItem("activeWorkspaceId");
  const [userId, setUserId] = useState<string>("");
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  // Fetch Channels
  useEffect(() => {
    if (!workspaceId) return;
    
    const fetchChannels = async () => {
      const { data } = await supabase
        .from("channels")
        .select("id, name")
        .eq("workspace_id", workspaceId);
      
      if (data && data.length > 0) {
        setChannels(data);
        // Default to first channel if none selected
        if (!activeChannel) setActiveChannel(data[0].id);
      }
    };
    fetchChannels();
  }, [workspaceId]);

  // Helper to fetch messages
  const fetchMessages = async () => {
    if (!activeChannel) return;
    const { data } = await supabase
      .from("channel_messages")
      .select(`
        id, content, created_at, user_id,
        profiles:user_id ( full_name )
      `)
      .eq("channel_id", activeChannel)
      .order("created_at", { ascending: true });
    
    if (data) {
        setMessages(data as any);
    }
  };

  // Auto-scroll on new messages (only if not editing)
  useEffect(() => {
    if (!editingId) {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
    }
  }, [messages.length, editingId]);

  // Fetch Messages & Realtime Subscription
  useEffect(() => {
    if (!activeChannel) return;

    fetchMessages();

    const channel = supabase
      .channel(`chat:${activeChannel}`)
      .on('postgres_changes', { 
        event: '*', // Listen to ALL events (Insert, Update, Delete)
        schema: 'public', 
        table: 'channel_messages',
        filter: `channel_id=eq.${activeChannel}`
      }, () => {
        fetchMessages();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeChannel]);

  const handleSend = async () => {
    if (!newMessage.trim() || !activeChannel || !userId) return;
    setSending(true);

    const { error } = await supabase.from("channel_messages").insert({
      channel_id: activeChannel,
      user_id: userId,
      content: newMessage
    });

    if (!error) {
        setNewMessage("");
        await fetchMessages(); 
    }
    setSending(false);
  };

  const startEditing = (id: string, currentContent: string) => {
    setEditingId(id);
    setEditContent(currentContent);
  };

  const saveEdit = async (id: string) => {
    if (!editContent.trim()) return;
    
    const { error } = await supabase
      .from("channel_messages")
      .update({ content: editContent })
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to update message", variant: "destructive" });
    } else {
      setEditingId(null);
      await fetchMessages();
    }
  };

  const deleteMessage = async (id: string) => {
    const { error } = await supabase.from("channel_messages").delete().eq("id", id);
    
    if (error) {
      toast({ title: "Error", description: "Failed to delete message", variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Message removed" });
      await fetchMessages();
    }
  };

  if (!workspaceId) return <div className="p-8 text-center">Please select a workspace.</div>;

  return (
    <div className="flex h-full border rounded-xl overflow-hidden bg-background">
      {/* Channels Sidebar */}
      <div className="w-64 border-r bg-muted/30 flex flex-col">
        <div className="p-4 border-b font-semibold">Channels</div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {channels.map(ch => (
              <button
                key={ch.id}
                onClick={() => setActiveChannel(ch.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  activeChannel === ch.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-muted-foreground"
                }`}
              >
                <Hash className="w-4 h-4" /> {ch.name}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b font-medium flex items-center gap-2">
           <Hash className="w-4 h-4 text-muted-foreground" />
           {channels.find(c => c.id === activeChannel)?.name || "Select a channel"}
        </div>
        
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 group ${msg.user_id === userId ? 'flex-row-reverse' : ''}`}>
                <Avatar className="w-8 h-8 mt-1">
                  <AvatarFallback>{msg.profiles?.full_name?.[0] || <User className="w-4 h-4" />}</AvatarFallback>
                </Avatar>
                
                <div className={`relative max-w-[70%] rounded-xl px-4 py-2 text-sm ${
                  msg.user_id === userId 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted'
                }`}>
                  
                  {/* Edit Mode */}
                  {editingId === msg.id ? (
                    <div className="flex items-center gap-2 min-w-[200px]">
                      <Input 
                        value={editContent} 
                        onChange={(e) => setEditContent(e.target.value)} 
                        className="h-8 text-xs bg-background text-foreground"
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(msg.id);
                            if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <button onClick={() => saveEdit(msg.id)} className="p-1 hover:bg-black/10 rounded"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingId(null)} className="p-1 hover:bg-black/10 rounded"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <>
                      {msg.user_id !== userId && (
                        <p className="text-xs font-semibold mb-1 opacity-70">{msg.profiles?.full_name}</p>
                      )}
                      <p>{msg.content}</p>
                      <p className="text-[10px] opacity-50 text-right mt-1">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </>
                  )}

                  {/* Actions Dropdown (Only for own messages) */}
                  {msg.user_id === userId && !editingId && (
                     <div className="absolute top-0 -left-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                             <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full bg-background border shadow-sm">
                               <MoreVertical className="h-3 w-3 text-muted-foreground" />
                             </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => startEditing(msg.id, msg.content)}>
                              <Edit2 className="h-3 w-3 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteMessage(msg.id)} className="text-red-600">
                              <Trash2 className="h-3 w-3 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                     </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="p-4 border-t bg-background">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex gap-2"
          >
            <Input 
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={`Message #${channels.find(c => c.id === activeChannel)?.name || '...'}`}
              disabled={sending}
            />
            <Button type="submit" size="icon" disabled={!newMessage.trim() || sending}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}