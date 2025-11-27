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

    // NOTE: in a real app, you'd use an Edge Function here to look up user by email
    // For now, we will just simulate a success or try to insert if you know the UUID
    // Since looking up user ID by email is restricted on the client side for security.
    
    try {
       // Call our Edge Function (we will create this next)
       const { data, error } = await supabase.functions.invoke('invite-user', {
         body: { email, workspaceId }
       });

       if (error) throw error;

       toast({ title: "Success", description: "Invitation sent!" });
       setIsOpen(false);
       setEmail("");
    } catch (error: any) {
       // For demo purposes, since we haven't deployed the function yet:
       toast({ 
         title: "Feature Pending", 
         description: "We need to deploy the 'invite-user' function first. (See Step 4)" 
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