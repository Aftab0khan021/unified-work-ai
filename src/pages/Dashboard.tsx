import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { 
  CheckCircle2, 
  FileText, 
  MessageSquare, 
  TrendingUp, 
  Activity 
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const [stats, setStats] = useState({ 
    totalTasks: 0, 
    completedTasks: 0, 
    totalDocs: 0, 
    totalChats: 0 
  });
  const [activityData, setActivityData] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const workspaceId = localStorage.getItem("activeWorkspaceId");
      if (!workspaceId) {
        setLoading(false);
        return;
      }

      // 1. Fetch Tasks (Filtered by Workspace via Projects)
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, status, created_at, title, projects!inner(workspace_id)")
        .eq("projects.workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      // 2. Fetch Documents (Filtered by Workspace)
      const { data: docs } = await supabase
        .from("documents")
        .select("id, name, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      // 3. Fetch Chats (Filtered by Workspace)
      let chats = [];
      try {
        const { data } = await supabase
          .from("chat_messages")
          .select("id, created_at, role")
          .eq("role", "user")
          .eq("workspace_id", workspaceId) // <--- CRITICAL FIX
          .order("created_at", { ascending: false });
        chats = data || [];
      } catch (e) {
        console.warn("Chat table error", e);
      }

      const safeTasks = tasks || [];
      const safeDocs = docs || [];
      const safeChats = chats || [];

      // --- CALCULATE STATS ---
      setStats({
        totalTasks: safeTasks.length,
        completedTasks: safeTasks.filter(t => t.status === "done").length,
        totalDocs: safeDocs.length,
        totalChats: safeChats.length
      });

      // --- BUILD CHART DATA (Last 7 Days) ---
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
      }).reverse();

      const chartData = last7Days.map(date => ({
        name: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
        tasks: safeTasks.filter(t => t.created_at?.startsWith(date)).length,
        chats: safeChats.filter(c => c.created_at.startsWith(date)).length
      }));
      setActivityData(chartData);

      // --- RECENT ACTIVITY ---
      const combined = [
        ...safeTasks.slice(0, 3).map(t => ({ id: t.id, type: 'task', title: `Created task "${t.title}"`, time: t.created_at })),
        ...safeDocs.slice(0, 3).map(d => ({ id: d.id, type: 'doc', title: `Uploaded "${d.name}"`, time: d.created_at })),
      ].sort((a, b) => new Date(b.time || '').getTime() - new Date(a.time || '').getTime())
       .slice(0, 5);
      
      setRecentActivity(combined);

    } catch (error) {
      console.error("Dashboard error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Realtime listener
    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public" }, loadData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (loading) return <div className="p-8"><Skeleton className="h-96 w-full rounded-xl" /></div>;

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Dashboard
        </h1>
        <span className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTasks}</div>
            <p className="text-xs text-muted-foreground flex items-center mt-1">
              <TrendingUp className="w-3 h-3 mr-1 text-green-500" /> +{activityData[activityData.length-1]?.tasks || 0} today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">{stats.completedTasks} tasks done</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Knowledge Base</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDocs}</div>
            <p className="text-xs text-muted-foreground mt-1">Documents</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chats</CardTitle>
            <MessageSquare className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalChats}</div>
            <p className="text-xs text-muted-foreground mt-1">Interactions</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Weekly Activity</CardTitle>
            <CardDescription>Tasks and Chats in this workspace</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activityData}>
                  <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none' }} />
                  <Bar dataKey="tasks" name="Tasks" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="chats" name="Chats" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Updates</CardTitle>
            <CardDescription>Latest actions in workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {recentActivity.map((item, i) => (
                <div key={i} className="flex items-center">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full border ${item.type === 'task' ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-blue-500/10 border-blue-500/20 text-blue-500'}`}>
                    {item.type === 'task' ? <CheckCircle2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </div>
                  <div className="ml-4 space-y-1">
                    <p className="text-sm font-medium leading-none">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              ))}
              {recentActivity.length === 0 && <div className="text-center text-muted-foreground py-4">No recent activity</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}