import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle } from "lucide-react";

export function CreateWorkspaceDialog({ onWorkspaceCreated }: { onWorkspaceCreated: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // 1. Get Current User
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be logged in");

      // 2. Create the workspace
      const { data: workspace, error: wsError } = await supabase
        .from("workspaces")
        .insert({ 
            name: name,
            owner_id: user.id // Explicitly set owner
        })
        .select()
        .single();

      if (wsError) throw wsError;

      // 3. Add the current user as 'admin'
      // The SQL policy we just ran allows this because user.id matches owner_id
      const { error: memberError } = await supabase
        .from("workspace_members")
        .insert({
          workspace_id: workspace.id,
          user_id: user.id,
          role: "admin"
        });

      if (memberError) {
         // If member creation fails, we should probably delete the workspace to clean up
         await supabase.from("workspaces").delete().eq("id", workspace.id);
         throw memberError;
      }

      toast({ title: "Success", description: "Workspace created!" });
      setIsOpen(false);
      setName("");
      
      // 4. Force refresh to show the new workspace
      onWorkspaceCreated(); 
      
      // 5. Auto-select the new workspace
      localStorage.setItem("activeWorkspaceId", workspace.id);
      window.location.reload();

    } catch (error: any) {
      console.error("Creation Error:", error);
      toast({ title: "Error", description: error.message || "Failed to create workspace", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start">
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Team
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a New Workspace</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Workspace Name</Label>
            <Input 
              id="name" 
              placeholder="e.g., Engineering Team" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              required 
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Creating..." : "Create Workspace"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}