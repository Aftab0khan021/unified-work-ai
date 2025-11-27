import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, CheckCircle2, Circle, Trash2, Loader2, User as UserIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskBoard } from "@/components/TaskBoard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Task = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "review" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  assignee_id?: string;
  profiles?: { full_name: string } | null;
};

type Member = {
  user_id: string;
  profiles: {
    full_name: string;
  };
};

const Tasks = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [selectedAssignee, setSelectedAssignee] = useState<string>("me");
  const [isLoading, setIsLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const { toast } = useToast();

  const workspaceId = localStorage.getItem("activeWorkspaceId");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  // 1. Fetch Workspace Members (Fixed with Error Handling)
  useEffect(() => {
    const fetchMembers = async () => {
      if (!workspaceId) return;
      
      const { data, error } = await supabase
        .from("workspace_members")
        .select(`
          user_id, 
          profiles!workspace_members_user_id_fkey(full_name)
        `) // Explicitly using the Foreign Key we just created
        .eq("workspace_id", workspaceId);
      
      if (error) {
        console.error("Error fetching members:", error);
        // If the foreign key join fails, fallback to simple select or show error
        // toast({ title: "Member Load Error", description: error.message, variant: "destructive" });
      }
      
      if (data) {
        // Map data to ensure structure matches
        const formattedMembers = data.map((m: any) => ({
          user_id: m.user_id,
          profiles: m.profiles || { full_name: "Unknown User" }
        }));
        setMembers(formattedMembers);
      }
    };
    fetchMembers();
  }, [workspaceId]);

  const fetchTasks = async () => {
    if (!workspaceId) return;

    try {
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          *, 
          projects!inner(workspace_id),
          profiles:assignee_id(full_name)
        `)
        .eq("projects.workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTasks((data as any) || []);
    } catch (error: any) {
      console.error("Error fetching tasks:", error);
      setTasks([]);
    }
  };

  useEffect(() => {
    fetchTasks();
    const channel = supabase
      .channel('tasks-list-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, fetchTasks)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [workspaceId]);

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !workspaceId) return;
    setIsLoading(true);

    try {
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("workspace_id", workspaceId)
        .limit(1);
      
      let projectId = projects?.[0]?.id;

      if (!projectId) {
        const { data: newProject } = await supabase
          .from("projects")
          .insert({ name: "General", workspace_id: workspaceId })
          .select()
          .single();
        projectId = newProject?.id;
      }

      const finalAssignee = selectedAssignee === "me" ? currentUserId : selectedAssignee;

      const { error } = await supabase.from("tasks").insert([
        {
          title: newTaskTitle,
          status: "todo",
          priority: "medium",
          project_id: projectId,
          creator_id: currentUserId,
          assignee_id: finalAssignee
        },
      ]);

      if (error) throw error;

      setNewTaskTitle("");
      setSelectedAssignee("me");
      fetchTasks();
      toast({ title: "Success", description: "Task added!" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleStatus = async (task: Task) => {
    const newStatus = task.status === "done" ? "todo" : "done";
    setTasks(tasks.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    await supabase.from("tasks").update({ status: newStatus }).eq("id", task.id);
    fetchTasks();
  };

  const deleteTask = async (id: string) => {
    setTasks(tasks.filter((t) => t.id !== id));
    await supabase.from("tasks").delete().eq("id", id);
    fetchTasks();
  };

  return (
    <div className="container mx-auto px-4 py-8 h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          My Tasks
        </h1>
      </div>

      <Tabs defaultValue="list" className="flex-1 flex flex-col">
        <TabsList>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="board">Board</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="flex-1 mt-4 h-full overflow-hidden">
          <TaskBoard />
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-lg">Add New Task</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={addTask} className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  disabled={isLoading}
                  className="flex-1"
                />
                
                <Select value={selectedAssignee} onValueChange={setSelectedAssignee} disabled={isLoading}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Assign to..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="me">Assign to Me</SelectItem>
                    {members
                      .filter(m => m.user_id !== currentUserId)
                      .map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.profiles?.full_name || "Unknown User"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button type="submit" disabled={isLoading || !newTaskTitle}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />} 
                  Add
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {tasks.map((task) => (
              <Card key={task.id} className="hover:bg-accent/5 transition-colors">
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <button onClick={() => toggleStatus(task)}>
                      {task.status === "done" ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>
                    <div className="flex flex-col">
                        <span className={`truncate ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                        {task.title}
                        </span>
                        {task.assignee_id && task.assignee_id !== currentUserId && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <UserIcon className="w-3 h-3" /> 
                                {task.profiles?.full_name || "Unknown"}
                            </span>
                        )}
                         {task.assignee_id === currentUserId && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                (Personal)
                            </span>
                        )}
                    </div>
                  </div>
                  
                  <Button variant="ghost" size="icon" onClick={() => deleteTask(task.id)}>
                    <Trash2 className="w-4 h-4 text-destructive opacity-70 hover:opacity-100" />
                  </Button>
                </div>
              </Card>
            ))}
            {tasks.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No tasks found (Note: You only see tasks created by or assigned to you).
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Tasks;