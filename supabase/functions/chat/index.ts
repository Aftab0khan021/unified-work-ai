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

    // 1. Setup OpenAI and Supabase Clients
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!openAiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    
    // Create a Supabase client using the USER'S Auth Token (Secure!)
    // This ensures the AI creates tasks *for the user*, not as a generic admin.
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(supabaseUrl!, supabaseAnonKey!, { 
      global: { headers: { Authorization: authHeader } } 
    });

    // 2. Define the "Tools" (Capabilities) we give to the AI
    const tools = [
      {
        type: "function",
        function: {
          name: "create_task",
          description: "Create a new task in the user's to-do list",
          parameters: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "The title or description of the task (e.g., 'Buy Milk')",
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                description: "The priority level of the task",
              },
            },
            required: ["title"],
          },
        },
      },
    ];

    // 3. Ask OpenAI (First Pass)
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are USWA, a smart assistant. 
            If the user asks to do something you have a tool for (like creating a task), use the tool. 
            Otherwise, chat normally. 
            Today's date is ${new Date().toLocaleDateString()}`
          },
          ...messages
        ],
        tools: tools,
        tool_choice: "auto",
      }),
    });

    const data = await response.json();
    
    // Check if OpenAI returned an error (e.g., insufficient quota)
    if (data.error) {
      throw new Error(`OpenAI Error: ${data.error.message}`);
    }

    const aiMessage = data.choices[0].message;

    // 4. Check if AI wants to use a Tool
    if (aiMessage.tool_calls) {
      const toolCall = aiMessage.tool_calls[0];
      
      if (toolCall.function.name === "create_task") {
        // AI wants to create a task! Let's do it.
        const args = JSON.parse(toolCall.function.arguments);
        
        console.log("Creating task:", args);

        const { error } = await supabase.from("tasks").insert({
          title: args.title,
          priority: args.priority || "medium",
          status: "todo"
        });

        if (error) throw error;

        // 5. Tell OpenAI we did it, so it can confirm to the user
        const functionResponse = {
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ success: true, message: "Task created successfully" }),
        };

        // Final call to get the polite confirmation text
        const secondResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${openAiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [...messages, aiMessage, functionResponse],
          }),
        });
        
        const secondData = await secondResponse.json();
        return new Response(JSON.stringify({ reply: secondData.choices[0].message.content }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // If no tool was used, just return the normal chat reply
    return new Response(JSON.stringify({ reply: aiMessage.content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});