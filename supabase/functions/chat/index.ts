import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { messages, workspace_id, user_id } = await req.json();
    
    // Safety check for user_id and workspace_id
    if (!user_id || !workspace_id) {
       throw new Error("Missing user_id or workspace_id");
    }

    const latestMessage = messages[messages.length - 1].content;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- 1. System Prompt ---
    // UPDATED: Strictly enforces "reply" field for general chat so the existing code picks it up.
    const systemPrompt = `
    You are USWA, an AI assistant.
    
    You must ALWAYS return a JSON object.
    
    SCENARIO 1: If the user wants to CREATE A TASK:
    Return: { "tool": "create_task", "title": "Task Name", "priority": "medium" }
    
    SCENARIO 2: For any other conversation, questions, or help:
    Return: { "tool": null, "reply": "Your helpful answer here as a string." }
    `;

    // --- 2. Clean Messages ---
    const cleanMessages = messages.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
    }));

    // --- 3. Call AI (Groq) ---
    const groqKey = Deno.env.get("GROQ_API_KEY");
    const completionResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "system", content: systemPrompt }, ...cleanMessages],
        temperature: 0.1,
        response_format: { type: "json_object" } 
      }),
    });

    if (!completionResponse.ok) {
        const err = await completionResponse.text();
        throw new Error(`Groq API Error: ${err}`);
    }

    const completionData = await completionResponse.json();
    const rawContent = completionData.choices[0].message.content;
    let finalReply = rawContent;

    // --- 4. Tool Execution ---
    try {
        const action = JSON.parse(rawContent);

        if (action.tool === "create_task") {
            // Find a project ID for this workspace
            const { data: project } = await supabase
                .from('projects')
                .select('id')
                .eq('workspace_id', workspace_id)
                .limit(1)
                .single();
            
            const projectId = project?.id;

            if (!projectId) {
                finalReply = "I couldn't find a project in this workspace to add the task to.";
            } else {
                // Insert into DB using PROJECT ID
                const { error: insertError } = await supabase
                    .from("tasks")
                    .insert({
                        title: action.title,
                        priority: action.priority || "medium",
                        status: "todo",
                        creator_id: user_id, 
                        project_id: projectId 
                    });

                if (insertError) {
                    console.error("DB Error:", insertError);
                    finalReply = "I tried to create the task, but a database error occurred.";
                } else {
                    finalReply = `✅ Added task: "${action.title}" to your board.`;
                }
            }
        } else if (action.reply) {
            finalReply = action.reply;
        }
    } catch (e) {
        // Content wasn't JSON, just use it as text
    }

    return new Response(JSON.stringify({ reply: finalReply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});