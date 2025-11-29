import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, User, MoreHorizontal, Trash2, Edit2, X, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

export function TaskComments({ taskId }: { taskId: string }) {
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const { toast } = useToast();

  useEffect(() => {
    // Get current user ID to show edit/delete buttons only for own comments
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
    fetchComments();
  }, [taskId]);

  const fetchComments = async () => {
    const { data } = await supabase
      .from("task_comments")
      .select(`
        id,
        content,
        created_at,
        user_id,
        profiles:user_id ( full_name )
      `)
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });

    if (data) setComments(data);
  };

  const handleSend = async () => {
    if (!newComment.trim()) return;
    setLoading(true);

    const { error } = await supabase.from("task_comments").insert({
      task_id: taskId,
      user_id: userId, // We already fetched this in useEffect
      content: newComment
    });

    if (error) {
      toast({ title: "Error", description: "Failed to post comment", variant: "destructive" });
    } else {
      setNewComment("");
      fetchComments();
    }
    setLoading(false);
  };

  const startEditing = (id: string, currentContent: string) => {
    setEditingId(id);
    setEditContent(currentContent);
  };

  const saveEdit = async (id: string) => {
    if (!editContent.trim()) return;
    
    const { error } = await supabase
      .from("task_comments")
      .update({ content: editContent })
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to update comment", variant: "destructive" });
    } else {
      setEditingId(null);
      fetchComments();
    }
  };

  const deleteComment = async (id: string) => {
    const { error } = await supabase.from("task_comments").delete().eq("id", id);
    
    if (error) {
      toast({ title: "Error", description: "Failed to delete comment", variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Comment removed" });
      fetchComments();
    }
  };

  return (
    <div className="flex flex-col h-[300px]">
      <ScrollArea className="flex-1 pr-4">
        <div className="space-y-4">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3 text-sm group">
              <Avatar className="h-6 w-6 mt-1">
                <AvatarFallback>{c.profiles?.full_name?.[0] || <User className="h-3 w-3"/>}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{c.profiles?.full_name}</span>
                    <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleTimeString()}</span>
                  </div>
                  
                  {/* Show Actions only if it's YOUR comment */}
                  {userId === c.user_id && editingId !== c.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => startEditing(c.id, c.content)}>
                          <Edit2 className="h-3 w-3 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => deleteComment(c.id)} className="text-red-600">
                          <Trash2 className="h-3 w-3 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* View Mode vs Edit Mode */}
                {editingId === c.id ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Input 
                      value={editContent} 
                      onChange={(e) => setEditContent(e.target.value)} 
                      className="h-8 text-xs"
                      autoFocus
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => saveEdit(c.id)}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-0.5">{c.content}</p>
                )}
              </div>
            </div>
          ))}
          {comments.length === 0 && <div className="text-center text-xs text-muted-foreground pt-10">No comments yet.</div>}
        </div>
      </ScrollArea>
      
      <div className="mt-4 flex gap-2">
        <Input 
          value={newComment} 
          onChange={(e) => setNewComment(e.target.value)} 
          placeholder="Add a comment..." 
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <Button size="icon" onClick={handleSend} disabled={loading}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}