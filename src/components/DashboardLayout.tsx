import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger } from "@/components/ui/sidebar";
import { MessageSquare, CheckSquare, LogOut, LayoutDashboard } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const items = [
    { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
    { title: "Chat Assistant", url: "/chat", icon: MessageSquare },
    { title: "My Tasks", url: "/tasks", icon: CheckSquare },
  ];

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background overflow-hidden">
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>USWA Workspace</SidebarGroupLabel>
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
                        <a className="flex items-center gap-2">
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </a>
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
        
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header Bar */}
          <div className="p-4 border-b flex items-center gap-4 bg-background z-10">
            <SidebarTrigger />
            <h2 className="font-semibold text-lg">
              {items.find(i => i.url === location.pathname)?.title || "Dashboard"}
            </h2>
          </div>

          {/* Scrollable Page Content */}
          <div className="flex-1 overflow-auto p-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}