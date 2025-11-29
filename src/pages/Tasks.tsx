import { TaskBoard } from "@/components/TaskBoard";
import { CreateTaskDialog } from "@/components/CreateTaskDialog";

const Tasks = () => {
  const workspaceId = localStorage.getItem("activeWorkspaceId");

  return (
    <div className="h-full flex flex-col space-y-6 container mx-auto p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">My Tasks</h2>
        {/* Fixed: Replaced hidden button with functional Create Dialog */}
        <CreateTaskDialog workspaceId={workspaceId} />
      </div>
      <div className="flex-1 h-full min-h-0">
        <TaskBoard />
      </div>
    </div>
  );
};

export default Tasks;