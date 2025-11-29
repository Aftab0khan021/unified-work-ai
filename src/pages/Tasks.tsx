import { TaskBoard } from "@/components/TaskBoard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const Tasks = () => {
  return (
    <div className="h-full flex flex-col space-y-6 container mx-auto p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">My Tasks</h2>
        <Button className="opacity-0 pointer-events-none"><Plus className="mr-2 h-4 w-4" /> New Task</Button>
      </div>
      <div className="flex-1 h-full min-h-0">
        <TaskBoard />
      </div>
    </div>
  );
};

export default Tasks;