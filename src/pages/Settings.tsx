import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trash2, Shield, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { InviteMemberDialog } from "@/components/InviteMemberDialog";

type Member = {
  user_id: string;
  role: "admin" | "member" | "viewer";
  profiles: {
    full_name: string;
    email: string; // Note: You might need to adjust RLS to fetch emails
  };
};

export default function Settings() {
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const { toast } = useToast();
  const workspaceId = localStorage.getItem("activeWorkspaceId");

  const fetchMembers = async () => {
    if (!workspaceId) return;

    const { data, error } = await supabase
      .from("workspace_members")
      .select(`
        user_id,
        role,
        profiles:user_id (
          full_name
        )
      `)
      .eq("workspace_id", workspaceId);

    if (error) {
      console.error("Error fetching members:", error);
    } else {
      setMembers(data as any || []);
      
      // Find current user's role
      const { data: { user } } = await supabase.auth.getUser();
      const myRecord = data.find((m: any) => m.user_id === user?.id);
      setCurrentUserRole(myRecord?.role || "member");
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [workspaceId]);

  const removeMember = async (userId: string) => {
    if (!workspaceId) return;
    
    const { error } = await supabase
      .from("workspace_members")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId);

    if (error) {
      toast({ title: "Error", description: "Could not remove member", variant: "destructive" });
    } else {
      toast({ title: "Removed", description: "User removed from workspace" });
      fetchMembers();
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Team Settings</h1>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Workspace Members</CardTitle>
            <CardDescription>Manage who has access to this workspace</CardDescription>
          </div>
          {workspaceId && <InviteMemberDialog workspaceId={workspaceId} />}
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {members.map((member) => (
              <div key={member.user_id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarFallback>
                      {member.profiles?.full_name?.[0] || <User className="w-4 h-4" />}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{member.profiles?.full_name || "Unknown User"}</p>
                    <p className="text-sm text-muted-foreground capitalize flex items-center gap-1">
                      {member.role === 'admin' && <Shield className="w-3 h-3 text-primary" />}
                      {member.role}
                    </p>
                  </div>
                </div>

                {currentUserRole === 'admin' && member.role !== 'admin' && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-destructive hover:text-destructive/90"
                    onClick={() => removeMember(member.user_id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
            
            {members.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">No members found</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}