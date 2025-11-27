import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger } from "@/components/ui/sidebar";
import { MessageSquare, CheckSquare, LogOut, LayoutDashboard, FileText, Settings } from "lucide-react"; 
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    // 1. CRITICAL FIX: Clear local storage so next user doesn't see old workspace
    localStorage.removeItem("activeWorkspaceId");
    
    // 2. Sign out
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const items = [
    { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
    { title: "Chat Assistant", url: "/chat", icon: MessageSquare },
    { title: "My Tasks", url: "/tasks", icon: CheckSquare },
    { title: "Documents", url: "/documents", icon: FileText },
    { title: "Settings", url: "/settings", icon: Settings },
  ];

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar className="border-r w-64 min-w-[16rem] shrink-0">
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
        <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
          <header className="flex items-center h-14 border-b px-4 bg-background shrink-0">
            <SidebarTrigger />
            <h2 className="ml-4 font-semibold">
              {items.find(i => i.url === location.pathname)?.title || "Dashboard"}
            </h2>
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}