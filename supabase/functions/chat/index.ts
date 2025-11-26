import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
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
      throw new Error("GROQ_API_KEY is not set. Run: npx supabase secrets set GROQ_API_KEY=your_key");
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
              priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
            },
            required: ["title"],
          },
        },
      },
    ];

    // 3. Call Groq (Using the NEW Llama 3.3 Model)
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", // <--- UPDATED MODEL HERE
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
    
    // Catch API errors
    if (data.error) {
      console.error("Groq API Error:", data.error);
      throw new Error(`Groq Error: ${data.error.message}`);
    }

    const aiMessage = data.choices[0].message;

    // 4. Handle Tool Calls (If AI wants to create a task)
    if (aiMessage.tool_calls) {
      const toolCall = aiMessage.tool_calls[0];
      
      if (toolCall.function.name === "create_task") {
        const args = JSON.parse(toolCall.function.arguments);
        console.log("Creating task via Groq:", args);

        const { error } = await supabase.from("tasks").insert({
          title: args.title,
          priority: args.priority || "medium",
          status: "todo"
        });

        if (error) throw error;

        // Tell Groq we finished the task so it can confirm to user
        const functionResponse = {
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ success: true, message: "Task created successfully." }),
        };

        const secondResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile", // <--- UPDATED MODEL HERE TOO
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
    console.error("Edge Function Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});