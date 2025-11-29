import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user_id, workspace_id } = await req.json();
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch Unscheduled Tasks (Backlog)
    const { data: backlog } = await supabase
      .from("tasks")
      .select("id, title, priority")
      .eq("workspace_id", workspace_id)
      .eq("status", "todo") // Only plan 'todo' items
      .is("due_date", null) // Only ones without a date
      .limit(20);

    if (!backlog || backlog.length === 0) {
      return new Response(JSON.stringify({ message: "No unscheduled tasks found." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Fetch Existing Schedule (To avoid double-booking)
    const today = new Date().toISOString().split('T')[0];
    const { data: schedule } = await supabase
      .from("tasks")
      .select("due_date")
      .eq("workspace_id", workspace_id)
      .gte("due_date", today)
      .not("due_date", "is", null);

    // Count tasks per day
    const loadMap: Record<string, number> = {};
    schedule?.forEach((t: any) => {
      const date = t.due_date.split('T')[0];
      loadMap[date] = (loadMap[date] || 0) + 1;
    });

    // 3. Ask AI to Plan
    const groqKey = Deno.env.get("GROQ_API_KEY");
    const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{
          role: "system",
          content: `You are a Smart Scheduler. 
          Assign due dates to the Unscheduled Tasks starting from TOMORROW (${today}).
          RULES:
          1. Prioritize 'urgent'/'high' tasks first.
          2. Max 3 tasks per day (check Existing Load).
          3. Spread tasks out over the next 7 days.
          4. Return JSON: { "updates": [{ "id": "task_id", "due_date": "YYYY-MM-DD" }] }`
        }, {
          role: "user",
          content: `Unscheduled: ${JSON.stringify(backlog)}\nExisting Load: ${JSON.stringify(loadMap)}`
        }],
        response_format: { type: "json_object" }
      }),
    });

    const aiData = await aiResponse.json();
    const plan = JSON.parse(aiData.choices[0].message.content);

    // 4. Execute Updates
    let updatedCount = 0;
    if (plan.updates) {
      for (const update of plan.updates) {
        await supabase
          .from("tasks")
          .update({ due_date: update.due_date })
          .eq("id", update.id);
        updatedCount++;
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Auto-scheduled ${updatedCount} tasks based on your workload.` 
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});