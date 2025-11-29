import { useState } from "react";
import { TaskBoard } from "@/components/TaskBoard";
import { CreateTaskDialog } from "@/components/CreateTaskDialog";

const Tasks = () => {
  const workspaceId = localStorage.getItem("activeWorkspaceId");
  // State to trigger refresh
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="h-full flex flex-col space-y-6 container mx-auto p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">My Tasks</h2>
        
        {/* Pass the refresh callback to the Dialog */}
        <CreateTaskDialog 
          workspaceId={workspaceId} 
          onTaskCreated={() => setRefreshKey(k => k + 1)} 
        />
      </div>
      <div className="flex-1 h-full min-h-0">
        {/* Pass the key to the Board to trigger useEffect */}
        <TaskBoard refreshTrigger={refreshKey} />
      </div>
    </div>
  );
};

export default Tasks;