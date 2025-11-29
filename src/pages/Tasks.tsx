import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WorkspaceContext {
  currentWorkspace: { id: string; name: string } | null;
}

const Tasks = () => {
  const { currentWorkspace } = useOutletContext<WorkspaceContext>();
  const [tasks, setTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchTasks = async () => {
    // If workspace isn't ready, don't fetch yet
    if (!currentWorkspace?.id) return;

    setIsLoading(true);
    try {
      console.log("Fetching tasks for workspace:", currentWorkspace.id);
      
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTasks(data || []);
    } catch (error: any) {
      console.error("Task Error:", error);
      toast({ title: "Error", description: "Could not load tasks.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();

    if (currentWorkspace?.id) {
        const channel = supabase
        .channel("public:tasks")
        .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `workspace_id=eq.${currentWorkspace.id}` }, 
        () => fetchTasks())
        .subscribe();

        return () => { supabase.removeChannel(channel); };
    }
  }, [currentWorkspace?.id]);

  const onDragEnd = async (result: any) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;

    const newTasks = tasks.map(t => t.id === draggableId ? { ...t, status: destination.droppableId } : t);
    setTasks(newTasks);

    await supabase.from("tasks").update({ status: destination.droppableId }).eq("id", draggableId);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("tasks").delete().eq("id", id);
  };

  const getTasksByStatus = (status: string) => tasks.filter(t => t.status === status);

  if (!currentWorkspace) return <div className="flex h-full items-center justify-center text-muted-foreground">Loading workspace...</div>;

  return (
    <div className="h-full flex flex-col space-y-6 container mx-auto p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Tasks</h2>
        <Button><Plus className="mr-2 h-4 w-4" /> New Task</Button>
      </div>

      {isLoading && tasks.length === 0 ? (
        <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full min-h-[500px]">
            {["todo", "in_progress", "done"].map((status) => (
              <div key={status} className="flex flex-col h-full bg-muted/30 rounded-xl p-4 border">
                <h3 className="font-semibold mb-4 capitalize flex items-center justify-between">
                  {status.replace("_", " ")} <Badge variant="secondary">{getTasksByStatus(status).length}</Badge>
                </h3>
                <Droppable droppableId={status}>
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="flex-1 space-y-3 min-h-[100px]">
                      {getTasksByStatus(status).map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(provided) => (
                            <Card ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className="hover:shadow-md">
                              <CardHeader className="p-4 pb-2">
                                <div className="flex justify-between items-start">
                                  <CardTitle className="text-sm font-medium">{task.title}</CardTitle>
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(task.id)}>
                                    <Trash2 className="h-3 w-3 hover:text-destructive" />
                                  </Button>
                                </div>
                              </CardHeader>
                              <CardContent className="p-4 pt-0">
                                <Badge variant="outline" className="text-[10px] mt-2">{task.priority}</Badge>
                              </CardContent>
                            </Card>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      )}
    </div>
  );
};

export default Tasks;n