import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger } from "@/components/ui/sidebar";
import { MessageSquare, CheckSquare, LogOut, LayoutDashboard, FileText, Settings, Users, Calendar } from "lucide-react"; 
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { GlobalSearch } from "./GlobalSearch"; 

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    localStorage.removeItem("activeWorkspaceId");
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const items = [
    { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
    { title: "Chat Assistant", url: "/chat", icon: MessageSquare },
    { title: "Team Chat", url: "/team-chat", icon: Users },
    { title: "My Tasks", url: "/tasks", icon: CheckSquare },
    { title: "Calendar", url: "/calendar", icon: Calendar },
    { title: "Documents", url: "/documents", icon: FileText },
    { title: "Settings", url: "/settings", icon: Settings },
  ];

  // FIX: Chat pages need full height and no padding to handle their own layout
  const isChatPage = location.pathname === '/chat' || location.pathname === '/team-chat';

  return (
    <SidebarProvider defaultOpen={true} className="w-full">
      <GlobalSearch />
      
      {/* FIX: Use 100dvh for proper mobile viewport height and stop body scrolling */}
      <div className="flex h-[100dvh] w-full overflow-hidden bg-background isolate">
        <Sidebar className="border-r w-64 min-w-[16rem] shrink-0 z-20">
          <SidebarContent>
            <WorkspaceSwitcher /> 
            <SidebarGroup>
              <SidebarGroupLabel>Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={location.pathname === item.url}
                        onClick={() => navigate(item.url)}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center gap-2 w-full">
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={handleSignOut} className="cursor-pointer text-red-500 hover:text-red-600">
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        
        {/* FIX: Ensure content area can shrink and has its own scroll context */}
        <div className="flex-1 flex flex-col h-full min-w-0 min-h-0 overflow-hidden relative z-10">
          <header className="flex items-center h-14 border-b px-4 bg-background shrink-0 justify-between">
             <div className="flex items-center">
                <SidebarTrigger />
                <h2 className="ml-4 font-semibold">
                {items.find(i => i.url === location.pathname)?.title || "Dashboard"}
                </h2>
             </div>
             <div className="text-xs text-muted-foreground border rounded px-2 py-1 hidden sm:block">
                Cmd+K to Search
             </div>
          </header>
          
          {/* FIX: Pass layout responsibility fully to chat pages */}
          <main className={`flex-1 min-w-0 min-h-0 ${isChatPage ? 'h-full overflow-hidden p-0' : 'overflow-auto p-6'}`}>
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}