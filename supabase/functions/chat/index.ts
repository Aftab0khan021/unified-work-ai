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
    const apiKey = Deno.env.get("GROQ_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!apiKey) throw new Error("GROQ_API_KEY is not set");

    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(supabaseUrl!, supabaseAnonKey!, { 
      global: { headers: { Authorization: authHeader } } 
    });

    const tools = [
      {
        type: "function",
        function: {
          name: "create_task",
          description: "Create a new task",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
            },
            required: ["title"],
          },
        },
      },
    ];

    // CALLING THE NEW MODEL HERE
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", // <--- UPDATED
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
    if (data.error) throw new Error(`Groq Error: ${data.error.message}`);

    const aiMessage = data.choices[0].message;

    if (aiMessage.tool_calls) {
      const toolCall = aiMessage.tool_calls[0];
      if (toolCall.function.name === "create_task") {
        const args = JSON.parse(toolCall.function.arguments);
        const { error } = await supabase.from("tasks").insert({
          title: args.title,
          priority: args.priority || "medium",
          status: "todo"
        });

        if (error) throw error;

        const functionResponse = {
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ success: true, message: "Task created." }),
        };

        const secondResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile", // <--- UPDATED
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