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

    // --- STEP 1: RAG (Get Context) ---
    const hfKey = Deno.env.get("HUGGINGFACE_API_KEY");
    let contextText = "No specific documents found.";
    
    // We try to fetch context, but even if it fails, we proceed so tasks still work
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
        console.warn("RAG step failed, proceeding to chat only.", e);
    }

    // --- STEP 2: System Prompt (The "Brain") ---
    // We teach the AI how to use the "Create Task" tool
    const systemPrompt = `
    You are USWA, an AI assistant. You have access to a database.
    
    RULES:
    1. If the user asks to CREATE A TASK (e.g., "Remind me to call John", "Add task: Buy milk"), you MUST output a JSON object.
       Format: { "tool": "create_task", "title": "Task Title", "priority": "medium" }
    
    2. If the user asks a QUESTION based on documents, answer normally in plain text.
    
    --- DOCUMENT CONTEXT ---
    ${contextText}
    ------------------------
    `;

    // Sanitize Messages
    const cleanMessages = messages.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'assistant', 
        content: msg.content
    }));

    // --- STEP 3: Call Groq ---
    const groqKey = Deno.env.get("GROQ_API_KEY");
    const completionResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          ...cleanMessages
        ],
        temperature: 0.1,
        // Optional: force JSON mode if your model supports it, but Llama 3 usually understands instructions
        response_format: { type: "json_object" } 
      }),
    });

    if (!completionResponse.ok) {
        throw new Error(`Groq API Error: ${await completionResponse.text()}`);
    }

    const completionData = await completionResponse.json();
    const rawContent = completionData.choices[0].message.content;
    let finalReply = rawContent;

    // --- STEP 4: Tool Execution (The "Hands") ---
    try {
        // AI might wrap JSON in markdown like ```json ... ```, let's clean it
        const cleanedJson = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();
        const action = JSON.parse(cleanedJson);

        if (action.tool === "create_task") {
            console.log("Creating task:", action);

            const { error: insertError } = await supabase
                .from("tasks")
                .insert({
                    title: action.title,
                    priority: action.priority || "medium",
                    status: "todo",
                    user_id: user_id, // Passed from frontend
                    workspace_id: workspace_id
                });

            if (insertError) {
                console.error("DB Insert Error:", insertError);
                finalReply = "I tried to create the task, but a database error occurred.";
            } else {
                finalReply = `✅ I've added "**${action.title}**" to your Task Board.`;
            }
        } else {
            // If it's just a normal JSON response (some models chatter in JSON), verify content
            if (action.reply) finalReply = action.reply; // If AI structured it as { reply: "..." }
        }
    } catch (e) {
        // Not JSON? Then it's just a normal text reply.
        // We do nothing, just return the raw text.
    }

    return new Response(JSON.stringify({ reply: finalReply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Chat Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});