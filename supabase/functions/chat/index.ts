import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // FIX 1: Destructure workspace_id
    const { messages, user_id, workspace_id } = await req.json();
    const latestMessage = messages[messages.length - 1].content;

    const apiKey = Deno.env.get("GROQ_API_KEY"); 
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- TASK CREATION LOGIC ---
    const taskMatch = latestMessage.match(/^(?:create|add)\s+task[:\s]+(.+)/i);
    
    if (taskMatch) {
      const taskTitle = taskMatch[1].trim();

      if (!user_id || !workspace_id) {
        return new Response(JSON.stringify({ reply: "Error: I need to know which workspace you are in." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // FIX 2: Find a project INSIDE this specific workspace
      let projectId;
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("workspace_id", workspace_id) // <--- Filter by Workspace
        .limit(1);
      
      if (projects && projects.length > 0) {
        projectId = projects[0].id;
      } else {
        // Create default project if none exists
        const { data: newProject } = await supabase
          .from("projects")
          .insert({ name: "General", workspace_id: workspace_id })
          .select("id")
          .single();
        projectId = newProject?.id;
      }

      // FIX 3: Insert task
      const { error: insertError } = await supabase
        .from("tasks")
        .insert({
          title: taskTitle,
          status: "todo",
          priority: "medium",
          creator_id: user_id,
          project_id: projectId 
        });

      if (insertError) {
        console.error("Task Insert Error:", insertError);
        return new Response(JSON.stringify({ reply: "I failed to create the task. Please check permissions." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ 
        reply: `✅ Added "${taskTitle}" to your workspace task list.` 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // --- RAG (DOCUMENT SEARCH) LOGIC ---
    if (!apiKey) throw new Error("GROQ_API_KEY is not set");

    // FIX 4: Search documents ONLY in the current workspace
    const { data: docs } = await supabase
      .from("documents")
      .select("content_text, name")
      .eq("workspace_id", workspace_id) // <--- Critical Filter
      .order("created_at", { ascending: false })
      .limit(3);

    let contextBlock = "";
    if (docs && docs.length > 0) {
      contextBlock = "\n\nRELEVANT DOCUMENTS:\n" + 
        docs.map((d: any) => `--- ${d.name} ---\n${d.content_text.substring(0, 500)}...`).join("\n\n");
    }

    const systemMessage = {
      role: "system",
      content: `You are USWA, an intelligent work assistant. 
      Today is ${new Date().toLocaleDateString()}.
      ${contextBlock}
      
      Instructions:
      - Answer questions based on the documents provided.
      - Only use documents from the current workspace.
      - Be concise.`
    };

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [systemMessage, ...messages],
        temperature: 0.2,
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(`Groq Error: ${data.error.message}`);

    return new Response(JSON.stringify({ reply: data.choices[0].message.content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Chat Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});