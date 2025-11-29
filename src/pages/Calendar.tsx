import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { AutoScheduleButton } from "@/components/AutoScheduleButton"; // <--- IMPORT THIS

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
};

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const workspaceId = localStorage.getItem("activeWorkspaceId");

  useEffect(() => {
    if (workspaceId) {
      fetchTasks();
    }
  }, [workspaceId, currentDate]);

  const fetchTasks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tasks")
      .select("id, title, status, priority, due_date")
      .eq("workspace_id", workspaceId)
      .not("due_date", "is", null);

    if (data) {
      setTasks(data as any);
    }
    setLoading(false);
  };

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const jumpToToday = () => setCurrentDate(new Date());

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'urgent': return 'bg-red-100 text-red-700 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'low': return 'bg-slate-100 text-slate-700 border-slate-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  return (
    <div className="container mx-auto p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <CalendarIcon className="w-8 h-8 text-primary" /> Schedule
        </h1>
        <div className="flex items-center gap-2">
          {/* FIX: Add Auto-Schedule Button Here */}
          <AutoScheduleButton onScheduleComplete={fetchTasks} />
          
          <div className="border-l h-6 mx-2" />
          
          <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
          <div className="text-lg font-semibold w-40 text-center">
            {format(currentDate, "MMMM yyyy")}
          </div>
          <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
          <Button variant="default" onClick={jumpToToday} className="ml-2">Today</Button>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden border shadow-sm min-h-0">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center py-2 text-sm font-medium text-muted-foreground shrink-0">
          <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
        </div>
        
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-y-auto flex-1">
            <div className="grid grid-cols-7 auto-rows-fr min-h-full">
              {calendarDays.map((day) => {
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                const dayTasks = tasks.filter(t => t.due_date && isSameDay(new Date(t.due_date), day));
                const isToday = isSameDay(day, new Date());

                return (
                  <div 
                    key={day.toISOString()} 
                    className={`border-r border-b p-2 min-h-[120px] flex flex-col gap-1 transition-colors hover:bg-muted/10 ${!isCurrentMonth ? "bg-muted/20 text-muted-foreground" : "bg-background"}`}
                  >
                    <div className={`text-right text-sm mb-1 ${isToday ? "font-bold text-primary" : ""}`}>
                      {isToday ? <span className="bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">{format(day, "d")}</span> : format(day, "d")}
                    </div>
                    
                    {dayTasks.map(task => (
                      <div 
                        key={task.id} 
                        className={`text-[10px] px-2 py-1 rounded border truncate cursor-pointer hover:opacity-80 ${getPriorityColor(task.priority)}`}
                        title={task.title}
                      >
                        {task.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}