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
    const { messages } = await req.json();
    const userMessage = messages[messages.length - 1].content.toLowerCase();

    // --- SETUP DATABASE CONNECTION ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(supabaseUrl!, supabaseAnonKey!, { global: { headers: { Authorization: authHeader } } });

    let reply = "I am a simulated AI. I can help you manage tasks. Try saying 'Create task: Buy Milk'.";

    // --- THE "FAKE" BRAIN LOGIC ---
    
    // 1. Check if user wants to create a task
    if (userMessage.includes("create task") || userMessage.includes("add task")) {
      
      // Simple logic to extract the task name (everything after the colon or the word 'task')
      let title = userMessage.split(/:\s*|task\s+/).pop(); 
      
      if (title && title.length > 2) {
        console.log("Creating task:", title);

        const { error } = await supabase.from("tasks").insert({
          title: title,
          priority: "high",
          status: "todo"
        });

        if (error) {
          console.error(error);
          reply = "I tried to create the task, but something went wrong with the database.";
        } else {
          reply = `Done! I have created the task: "${title}" for you. check your tasks tab!`;
        }
      } else {
        reply = "I understood you want to create a task, but I didn't catch the name. Try 'Create task: Finish project'.";
      }
    } 
    
    // 2. Check if user is just saying hello
    else if (userMessage.includes("hello") || userMessage.includes("hi")) {
      reply = "Hello! I am your offline Work Assistant. How can I help?";
    }

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});