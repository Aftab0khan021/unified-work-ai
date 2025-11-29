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
    if (!user_id || !workspace_id) throw new Error("Missing user_id or workspace_id");

    const latestMessage = messages[messages.length - 1].content;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- 1. RAG: Retrieve Relevant Documents (RESTORED) ---
    let contextText = "";
    const hfKey = Deno.env.get("HUGGINGFACE_API_KEY");

    if (hfKey) {
        try {
            // Generate embedding for the user's question
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
                // Handle different response formats from HF API
                const queryVector = (Array.isArray(embeddingResult) && Array.isArray(embeddingResult[0])) 
                    ? embeddingResult[0] 
                    : embeddingResult;

                // Search database for matching docs
                const { data: documents } = await supabase.rpc("match_documents", {
                    query_embedding: queryVector,
                    match_threshold: 0.50, // Similarity threshold
                    match_count: 4,
                    filter_workspace_id: workspace_id
                });

                if (documents && documents.length > 0) {
                    contextText = documents.map((doc: any) => `SOURCE: ${doc.content_text}`).join("\n\n");
                    console.log("Found docs:", documents.length);
                }
            }
        } catch (e) {
            console.log("RAG Error (continuing without context):", e);
        }
    }

    // --- 2. System Prompt ---
    const systemPrompt = `
    You are USWA, an AI assistant.
    
    You must ALWAYS return a valid JSON object.
    
    SCENARIO 1: If the user wants to CREATE A TASK:
    Return: { "tool": "create_task", "title": "Task Name", "priority": "medium" }
    
    SCENARIO 2: For questions, use the provided CONTEXT.
    Return: { "tool": null, "reply": "Your answer based on the context." }

    --- CONTEXT FROM DOCUMENTS ---
    ${contextText || "No relevant documents found."}
    ------------------------------
    `;

    // --- 3. Clean Messages ---
    const cleanMessages = messages.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
    }));

    // --- 4. Call AI (Groq) ---
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

    // --- 5. Tool Execution ---
    try {
        // Strip markdown if present
        const cleanedContent = rawContent.replace(/^```json\s*|\s*```$/g, '').replace(/^```\s*|\s*```$/g, '');
        const action = JSON.parse(cleanedContent);

        if (action.tool === "create_task") {
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
        } else if (action.description) {
            finalReply = action.description;
        }
    } catch (e) {
        console.warn("Parsing Error:", e);
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