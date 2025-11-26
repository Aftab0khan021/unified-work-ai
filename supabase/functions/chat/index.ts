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

    // 1. Get the GROQ API Key
    const apiKey = Deno.env.get("GROQ_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not set");
    }

    // Create Supabase Client
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(supabaseUrl!, supabaseAnonKey!, { 
      global: { headers: { Authorization: authHeader } } 
    });

    // 2. Define Tools (The "Hands" of the AI)
    const tools = [
      {
        type: "function",
        function: {
          name: "create_task",
          description: "Create a new task",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "The task title" },
              priority: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["title"],
          },
        },
      },
    ];

    // 3. Call Groq (Llama 3) - Note the URL change!
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-70b-8192", // Using Llama 3 (Free & Smart)
        messages: [
          {
            role: "system",
            content: `You are USWA, a helpful work assistant. Today is ${new Date().toLocaleDateString()}.`
          },
          ...messages
        ],
        tools: tools,
        tool_choice: "auto",
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const aiMessage = data.choices[0].message;

    // 4. Handle Tool Calls (If AI wants to create a task)
    if (aiMessage.tool_calls) {
      const toolCall = aiMessage.tool_calls[0];
      
      if (toolCall.function.name === "create_task") {
        const args = JSON.parse(toolCall.function.arguments);
        console.log("Creating task:", args);

        const { error } = await supabase.from("tasks").insert({
          title: args.title,
          priority: args.priority || "medium",
          status: "todo"
        });

        if (error) throw error;

        // Tell Groq we finished the task
        const functionResponse = {
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ success: true, message: "Task created." }),
        };

        const secondResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama3-70b-8192",
            messages: [...messages, aiMessage, functionResponse],
          }),
        });
        
        const secondData = await secondResponse.json();
        return new Response(JSON.stringify({ reply: secondData.choices[0].message.content }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ reply: aiMessage.content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});