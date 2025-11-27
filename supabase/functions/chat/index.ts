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
    const { messages, user_id } = await req.json();
    const latestMessage = messages[messages.length - 1].content;

    // Setup Clients
    const apiKey = Deno.env.get("GROQ_API_KEY"); 
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- COMMAND INTERCEPTOR: TASK CREATION ---
    // If user types "Create task: [title]", we do it manually instead of asking AI.
    const taskMatch = latestMessage.match(/^(?:create|add)\s+task[:\s]+(.+)/i);
    
    if (taskMatch) {
      const taskTitle = taskMatch[1].trim();

      if (!user_id) throw new Error("User ID missing for task creation");

      // 1. Get a Project ID (Default/General)
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .limit(1);
      
      const projectId = projects?.[0]?.id;

      // 2. Insert Task
      const { error: insertError } = await supabase
        .from("tasks")
        .insert({
          title: taskTitle,
          status: "todo",
          priority: "medium",
          creator_id: user_id,
          project_id: projectId // Can be null if your schema allows, or use the fetched ID
        });

      if (insertError) {
        console.error("Task Insert Error:", insertError);
        return new Response(JSON.stringify({ reply: "I tried to create the task, but something went wrong." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ 
        reply: `✅ I've added "${taskTitle}" to your task list.` 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // ------------------------------------------

    if (!apiKey) throw new Error("GROQ_API_KEY is not set");

    // Standard RAG Pipeline (for non-command questions)
    const { data: docs } = await supabase
      .from("documents")
      .select("content_text, name")
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
      - Answer questions based on the documents above.
      - If asked to create a task, tell the user to use the format "Create task: [Title]".
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