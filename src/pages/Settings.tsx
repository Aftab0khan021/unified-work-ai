import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trash2, Shield, User, Mail, Clock, RefreshCw, LogIn, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { InviteMemberDialog } from "@/components/InviteMemberDialog";
import { Badge } from "@/components/ui/badge";

type Member = {
  user_id: string;
  role: "admin" | "member" | "viewer";
  profiles: { full_name: string; email: string };
};
type Invite = {
  id: string;
  email: string;
  role: string;
  created_at: string;
};

export default function Settings() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  
  // NEW: State to track connection status
  const [isGmailConnected, setIsGmailConnected] = useState(false);
  
  const { toast } = useToast();
  const workspaceId = localStorage.getItem("activeWorkspaceId");

  const fetchData = async () => {
    if (!workspaceId) return;

    // 1. Fetch Members
    const { data: memberData } = await supabase
      .from("workspace_members")
      .select("user_id, role, profiles:user_id(full_name)")
      .eq("workspace_id", workspaceId);
    
    setMembers(memberData as any || []);

    const { data: { user } } = await supabase.auth.getUser();
    const myRecord = memberData?.find((m: any) => m.user_id === user?.id);
    setCurrentUserRole(myRecord?.role || "member");

    // 2. Fetch Invites
    const { data: inviteData } = await supabase
      .from("workspace_invites")
      .select("*")
      .eq("workspace_id", workspaceId);
      
    setInvites(inviteData as any || []);

    // 3. Check Google Connection (The Visual Fix)
    checkGoogleConnection();
  };

  const checkGoogleConnection = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    // If we have a provider_token, we are connected!
    if (session?.provider_token) {
        setIsGmailConnected(true);
    } else {
        setIsGmailConnected(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [workspaceId]);

  const removeMember = async (userId: string) => {
    const { error } = await supabase.from("workspace_members").delete().eq("workspace_id", workspaceId).eq("user_id", userId);
    if (error) toast({ title: "Error", description: "Failed to remove member", variant: "destructive" });
    else fetchData();
  };

  const cancelInvite = async (email: string) => {
    const { error } = await supabase.from("workspace_invites").delete().eq("workspace_id", workspaceId).eq("email", email);
    if (error) toast({ title: "Error", description: "Failed to cancel invite", variant: "destructive" });
    else fetchData();
  };

  const connectGmail = async () => {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/'   // (this route always exists)
    }
  });
};


  const syncEmails = async () => {
    setSyncing(true);
    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
            toast({ title: "Error", description: "Please log in again.", variant: "destructive" });
            return;
        }

        const googleToken = session.provider_token;

        if (!googleToken) {
            toast({ 
                title: "No Connection Found", 
                description: "Please click 'Connect Gmail' to refresh your permission.", 
                variant: "destructive" 
            });
            setIsGmailConnected(false); // Update UI to show disconnected
            setSyncing(false);
            return;
        }

        // Update UI to confirm we have the token
        setIsGmailConnected(true);

        const { data, error } = await supabase.functions.invoke('email-agent', {
            body: { 
                user_id: session.user.id,
                google_token: googleToken 
            }
        });

        if (error) throw error;

        toast({ 
            title: "Sync Complete", 
            description: data.message || "Emails processed successfully." 
        });
    } catch (error: any) {
        console.error(error);
        toast({ 
            title: "Sync Failed", 
            description: error.message || "Could not fetch emails.", 
            variant: "destructive" 
        });
    } finally {
        setSyncing(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Team Settings</h1>
        {workspaceId && <InviteMemberDialog workspaceId={workspaceId} />}
      </div>

      {/* EMAIL AGENT CARD */}
      <Card className={`border-2 ${isGmailConnected ? 'border-green-200 bg-green-50/30' : 'border-blue-200 bg-blue-50/30'}`}>
        <CardHeader>
            <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <Mail className="w-5 h-5 text-blue-600" /> Email Automation Agent
                </CardTitle>
                {/* STATUS BADGE */}
                {isGmailConnected ? (
                    <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 flex gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Connected
                    </Badge>
                ) : (
                    <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-200 flex gap-1">
                        <AlertCircle className="w-3 h-3" /> Not Connected
                    </Badge>
                )}
            </div>
            <CardDescription>
                Connect your Gmail to automatically create tasks from important emails.
            </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
            {!isGmailConnected && (
                <Button variant="outline" onClick={connectGmail} className="bg-white hover:bg-blue-50">
                    <LogIn className="w-4 h-4 mr-2" /> Connect Gmail
                </Button>
            )}
            
            <Button onClick={syncEmails} disabled={syncing}>
                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} /> 
                {syncing ? "Scanning Inbox..." : "Scan Inbox Now"}
            </Button>
        </CardContent>
      </Card>

      {/* Active Members */}
      <Card>
        <CardHeader>
          <CardTitle>Active Members</CardTitle>
          <CardDescription>People currently in this workspace</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {members.map((member) => (
            <div key={member.user_id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-4">
                <Avatar>
                  <AvatarFallback>{member.profiles?.full_name?.[0] || <User className="w-4 h-4" />}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{member.profiles?.full_name || "Unknown User"}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {member.role === 'admin' && <Shield className="w-3 h-3 mr-1" />}
                      {member.role}
                    </Badge>
                  </div>
                </div>
              </div>
              {currentUserRole === 'admin' && member.role !== 'admin' && (
                <Button variant="ghost" size="icon" onClick={() => removeMember(member.user_id)} className="text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Pending Invites */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Invitations</CardTitle>
          <CardDescription>People invited but not yet joined</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {invites.map((invite) => (
            <div key={invite.id} className="flex items-center justify-between p-4 border rounded-lg border-dashed bg-muted/30">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Mail className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">{invite.email}</p>
                  <p className="text-xs text-muted-foreground flex items-center">
                    <Clock className="w-3 h-3 mr-1" /> Invited {new Date(invite.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {currentUserRole === 'admin' && (
                <Button variant="ghost" size="sm" onClick={() => cancelInvite(invite.email)}>
                  Revoke
                </Button>
              )}
            </div>
          ))}
          {invites.length === 0 && <div className="text-center py-4 text-muted-foreground">No pending invites</div>}
        </CardContent>
      </Card>
    </div>
  );
}