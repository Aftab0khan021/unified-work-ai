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
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<string | null>(null);

  const fetchWorkspaces = async () => {
    const { data, error } = await supabase
      .from("workspaces")
      .select(`
        id, 
        name,
        workspace_members!inner(role)
      `);

    if (!error && data) {
      // Flatten the structure slightly
      const formatted = data.map((w: any) => ({
        id: w.id,
        name: w.name,
        role: w.workspace_members[0]?.role
      }));
      setWorkspaces(formatted);
      
      // Set default if none selected
      if (formatted.length > 0 && !currentWorkspace) {
        setCurrentWorkspace(formatted[0].id);
        // In a real app, you'd save this to localStorage or Context
        localStorage.setItem("activeWorkspaceId", formatted[0].id);
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
          window.location.reload(); // Simple way to refresh data for new workspace
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