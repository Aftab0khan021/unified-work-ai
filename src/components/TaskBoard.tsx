import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type TaskStatus = "todo" | "in_progress" | "review" | "done";
type TaskPriority = "low" | "medium" | "high" | "urgent";

interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string;
  creator_id: string;
  assignee_id?: string;
}

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: "todo", label: "To Do", color: "bg-slate-500/10 border-slate-500/20" },
  { id: "in_progress", label: "In Progress", color: "bg-blue-500/10 border-blue-500/20" },
  { id: "review", label: "Review", color: "bg-orange-500/10 border-orange-500/20" },
  { id: "done", label: "Done", color: "bg-green-500/10 border-green-500/20" },
];

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "bg-slate-200 text-slate-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

export function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const { toast } = useToast();

  const workspaceId = localStorage.getItem("activeWorkspaceId");

  const fetchTasks = async () => {
    if (!workspaceId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      
      // FIX: Removed "projects!inner" join so manual tasks (without projects) can show up.
      // FIX: Removed ".eq('creator_id', userId)" so Assignees can see tasks too.
      // The Database RLS policies will safely handle who sees what.
      const { data, error } = await supabase
        .from("tasks")
        .select("*") 
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTasks(data as any || []);
    } catch (error: any) {
      console.error("Board fetch error:", error);
      toast({ title: "Error", description: "Failed to load tasks" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    
    if (!workspaceId) return;

    // FIX: Subscribe to workspace changes so Assignees see updates instantly
    const channel = supabase
      .channel('board-realtime')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'tasks',
        filter: `workspace_id=eq.${workspaceId}` 
      }, () => {
        fetchTasks();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [workspaceId]);

  const updateTaskStatus = async (taskId: string, newStatus: TaskStatus) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));

    const { error } = await supabase
      .from("tasks")
      .update({ status: newStatus })
      .eq("id", taskId);

    if (error) {
      toast({ title: "Error", description: "Failed to update task", variant: "destructive" });
      fetchTasks();
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("taskId", id);
    setDraggingId(id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    if (taskId) {
      updateTaskStatus(taskId, status);
    }
    setDraggingId(null);
  };

  const deleteTask = async (id: string) => {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Delete failed" });
    } else {
      setTasks(prev => prev.filter(t => t.id !== id));
    }
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  if (!workspaceId) return <div className="text-center p-8 text-muted-foreground">Please select a workspace to view tasks.</div>;

  return (
    <div className="h-full flex gap-4 overflow-x-auto pb-4">
      {COLUMNS.map((col) => (
        <div 
          key={col.id} 
          className={`flex-1 min-w-[280px] rounded-xl border-2 border-dashed ${col.color} flex flex-col`}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, col.id)}
        >
          <div className="p-3 font-semibold flex justify-between items-center bg-background/50 backdrop-blur-sm rounded-t-xl">
            {col.label}
            <Badge variant="secondary">{tasks.filter(t => t.status === col.id).length}</Badge>
          </div>
          
          <ScrollArea className="flex-1 p-2">
            <div className="space-y-3">
              {tasks.filter(t => t.status === col.id).map((task) => (
                <Card 
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  className={`cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${draggingId === task.id ? 'opacity-50' : ''}`}
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-medium leading-tight">{task.title}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            <MoreHorizontal className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => deleteTask(task.id)} className="text-red-600 cursor-pointer">
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-0 ${PRIORITY_COLORS[task.priority]}`}>
                        {task.priority}
                      </Badge>
                      {task.due_date && (
                        <span className="text-[10px] text-muted-foreground">
                          Due {new Date(task.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      ))}
    </div>
  );
}