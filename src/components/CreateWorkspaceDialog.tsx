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
      // 1. Create the workspace
      const { data: workspace, error: wsError } = await supabase
        .from("workspaces")
        .insert({ name })
        .select()
        .single();

      if (wsError) throw wsError;

      // 2. Add the current user as 'admin' (This might be handled by a trigger, but let's be explicit)
      const { error: memberError } = await supabase
        .from("workspace_members")
        .insert({
          workspace_id: workspace.id,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          role: "admin"
        });

      if (memberError) throw memberError;

      toast({ title: "Success", description: "Workspace created!" });
      setIsOpen(false);
      setName("");
      onWorkspaceCreated(); // Refresh parent list
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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