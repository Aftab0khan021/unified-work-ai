import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { UserPlus } from "lucide-react";

export function InviteMemberDialog({ workspaceId }: { workspaceId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
       // Call the Edge Function
       const { data, error } = await supabase.functions.invoke('invite-user', {
         body: { email, workspaceId }
       });

       if (error) {
         // Supabase function error (e.g., 500 or network issue)
         throw new Error(error.message || "Failed to call invite function");
       }

       // Check for functional errors returned in the JSON body (e.g. "User not found")
       if (data?.error) {
         throw new Error(data.error);
       }

       toast({ title: "Success", description: data.message || "Invitation sent!" });
       setIsOpen(false);
       setEmail("");
    } catch (error: any) {
       console.error("Invite Error:", error);
       // FIX: Show the ACTUAL error message
       toast({ 
         title: "Invitation Failed", 
         description: error.message || "An unexpected error occurred.",
         variant: "destructive" 
       });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Invite Member">
          <UserPlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleInvite} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">User Email</Label>
            <Input 
              id="email" 
              type="email"
              placeholder="colleague@example.com" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Sending Invite..." : "Send Invitation"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}