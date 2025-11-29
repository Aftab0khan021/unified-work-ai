import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Activity, User } from "lucide-react";

type Log = {
  id: string;
  action: string;
  details: string;
  created_at: string;
  profiles: { full_name: string } | null;
};

export function ActivityFeed() {
  const [logs, setLogs] = useState<Log[]>([]);
  const workspaceId = localStorage.getItem("activeWorkspaceId");

  const fetchLogs = async () => {
    if (!workspaceId) return;

    const { data } = await supabase
      .from("activity_logs")
      .select(`
        id,
        action,
        details,
        created_at,
        profiles:user_id ( full_name )
      `)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (data) {
      setLogs(data as any);
    }
  };

  useEffect(() => {
    fetchLogs();
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel("activity-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_logs", filter: `workspace_id=eq.${workspaceId}` }, 
        (payload) => {
          // Optimistic update
          fetchLogs();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [workspaceId]);

  return (
    <Card className="col-span-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" /> Activity Feed
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          <div className="space-y-4">
            {logs.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>}
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 border-b pb-3 last:border-0">
                <Avatar className="h-8 w-8 mt-1">
                  <AvatarFallback className="text-xs">
                    {log.profiles?.full_name?.[0] || <User className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <p className="text-sm">
                    <span className="font-semibold">{log.profiles?.full_name || "Unknown"}</span> {log.details}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}