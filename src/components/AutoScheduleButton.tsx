import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Wand2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function AutoScheduleButton({ onScheduleComplete }: { onScheduleComplete: () => void }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleAutoSchedule = async () => {
    setLoading(true);
    try {
      const workspaceId = localStorage.getItem("activeWorkspaceId");
      const { data: { user } } = await supabase.auth.getUser();

      if (!workspaceId || !user) return;

      const { data, error } = await supabase.functions.invoke('auto-schedule', {
        body: { 
          user_id: user.id,
          workspace_id: workspaceId
        }
      });

      if (error) throw error;

      toast({ 
        title: "Schedule Optimized", 
        description: data.message || "Tasks have been assigned due dates." 
      });
      
      onScheduleComplete(); // Refresh parent

    } catch (error: any) {
      toast({ 
        title: "Scheduling Failed", 
        description: error.message, 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
      variant="outline" 
      onClick={handleAutoSchedule} 
      disabled={loading}
      className="gap-2 bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
      Auto-Schedule
    </Button>
  );
}