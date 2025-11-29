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
    const latestMessage = messages[messages.length - 1].content;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- 1. RAG Context (Optional) ---
    const hfKey = Deno.env.get("HUGGINGFACE_API_KEY");
    let contextText = "No specific documents found.";

    if (hfKey) {
        try {
            const embeddingResponse = await fetch(
            "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5",
            {
                method: "POST",
                headers: { Authorization: `Bearer ${hfKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ inputs: [latestMessage], options: { wait_for_model: true } }),
            }
            );

            if (embeddingResponse.ok) {
                const embeddingResult = await embeddingResponse.json();
                const queryVector = (Array.isArray(embeddingResult) && Array.isArray(embeddingResult[0])) 
                    ? embeddingResult[0] 
                    : embeddingResult;

                const { data: documents } = await supabase.rpc("match_documents", {
                    query_embedding: queryVector,
                    match_threshold: 0.45,
                    match_count: 3,
                    filter_workspace_id: workspace_id
                });

                if (documents && documents.length > 0) {
                    contextText = documents.map((doc: any) => `[Doc]: ${doc.content_text}`).join("\n\n");
                }
            }
        } catch (e) {
            console.log("RAG skipped:", e);
        }
    }

    // --- 2. System Prompt (The "Brain") ---
    const systemPrompt = `
    You are USWA, an AI assistant.
    
    TOOLS:
    - If the user wants to CREATE A TASK, return a JSON object: 
      { "tool": "create_task", "title": "Task Name", "priority": "medium" }
    
    - Otherwise, answer the question using the context below.
    
    --- CONTEXT ---
    ${contextText}
    ---------------
    `;

    // --- 3. Sanitize Messages (CRITICAL FIX) ---
    // This removes 'created_at', 'id', etc. which caused the Groq error
    const cleanMessages = messages.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
    }));

    // --- 4. Call Groq ---
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

    // --- 5. Tool Execution (The "Hands") ---
    try {
        const action = JSON.parse(rawContent);

        if (action.tool === "create_task") {
            console.log("Creating Task:", action.title);

            // Insert into DB with Workspace ID
            const { error: insertError } = await supabase
                .from("tasks")
                .insert({
                    title: action.title,
                    priority: action.priority || "medium",
                    status: "todo",
                    creator_id: user_id, 
                    user_id: user_id,
                    workspace_id: workspace_id // <--- CRITICAL: Ensures task appears on the correct board
                });

            if (insertError) {
                console.error("DB Error:", insertError);
                finalReply = "I tried to create the task, but a database error occurred.";
            } else {
                finalReply = `✅ Added task: "${action.title}" to your board.`;
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