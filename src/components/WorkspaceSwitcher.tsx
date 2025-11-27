import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog";
import { InviteMemberDialog } from "./InviteMemberDialog";

type Workspace = {
  id: string;
  name: string;
  role?: string;
};

export function WorkspaceSwitcher() {
  // FIX 1: Initialize state from localStorage so it remembers after reload
  const [currentWorkspace, setCurrentWorkspace] = useState<string | null>(
    localStorage.getItem("activeWorkspaceId")
  );
  
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  const fetchWorkspaces = async () => {
    const { data, error } = await supabase
      .from("workspaces")
      .select(`
        id, 
        name,
        workspace_members!inner(role)
      `);

    if (!error && data) {
      const formatted = data.map((w: any) => ({
        id: w.id,
        name: w.name,
        role: w.workspace_members[0]?.role
      }));
      setWorkspaces(formatted);
      
      // FIX 2: Logic to handle default selection safely
      const storedId = localStorage.getItem("activeWorkspaceId");
      const isValidStored = formatted.find(w => w.id === storedId);

      if (isValidStored) {
        setCurrentWorkspace(storedId);
      } else if (formatted.length > 0) {
        // If no valid stored ID, default to the first one
        const firstId = formatted[0].id;
        setCurrentWorkspace(firstId);
        localStorage.setItem("activeWorkspaceId", firstId);
      }
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  return (
    <div className="p-4 border-b space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase">Workspace</span>
        {currentWorkspace && <InviteMemberDialog workspaceId={currentWorkspace} />}
      </div>
      
      <Select 
        value={currentWorkspace || undefined} 
        onValueChange={(val) => {
          setCurrentWorkspace(val);
          localStorage.setItem("activeWorkspaceId", val);
          // Force a reload so other components pick up the new ID
          window.location.reload(); 
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select Team" />
        </SelectTrigger>
        <SelectContent>
          {workspaces.map((ws) => (
            <SelectItem key={ws.id} value={ws.id}>
              {ws.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <CreateWorkspaceDialog onWorkspaceCreated={fetchWorkspaces} />
    </div>
  );
}