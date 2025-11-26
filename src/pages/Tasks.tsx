import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, CheckCircle2, Circle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Task = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
};

const Tasks = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Fetch Tasks
  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching tasks:", error);
    } else {
      setTasks(data as Task[]);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // Add Task
  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setIsLoading(true);

    const { error } = await supabase.from("tasks").insert([
      {
        title: newTaskTitle,
        status: "todo",
        priority: "medium",
      },
    ]);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setNewTaskTitle("");
      fetchTasks();
      toast({ title: "Success", description: "Task added!" });
    }
    setIsLoading(false);
  };

  // Toggle Status
  const toggleStatus = async (task: Task) => {
    const newStatus = task.status === "done" ? "todo" : "done";
    setTasks(tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t)); // Optimistic update

    const { error } = await supabase
      .from("tasks")
      .update({ status: newStatus })
      .eq("id", task.id);

    if (error) {
      fetchTasks(); // Revert on error
      toast({ title: "Error", description: "Update failed" });
    }
  };

  // Delete Task
  const deleteTask = async (id: string) => {
    setTasks(tasks.filter(t => t.id !== id)); // Optimistic delete
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      fetchTasks();
      toast({ title: "Error", description: "Delete failed" });
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
        My Tasks
      </h1>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Add New Task</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addTask} className="flex gap-2">
            <Input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="What needs to be done?"
              disabled={isLoading}
            />
            <Button type="submit" disabled={isLoading || !newTaskTitle}>
              <Plus className="w-4 h-4 mr-2" /> Add
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
                <span className={`truncate ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                  {task.title}
                </span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => deleteTask(task.id)}>
                <Trash2 className="w-4 h-4 text-destructive opacity-70 hover:opacity-100" />
              </Button>
            </div>
          </Card>
        ))}
        {tasks.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            No tasks yet. Add one above!
          </div>
        )}
      </div>
    </div>
  );
};

export default Tasks;