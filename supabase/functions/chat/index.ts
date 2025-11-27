import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { messages, workspace_id } = await req.json();
    const latestMessage = messages[messages.length - 1].content;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- STEP 1: Turn User Question into a Vector (Hugging Face) ---
    const hfKey = Deno.env.get("HUGGINGFACE_API_KEY");
    const embeddingResponse = await fetch(
      "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${hfKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: latestMessage, options: { wait_for_model: true } }),
      }
    );
    
    const embeddingResult = await embeddingResponse.json();
    const queryVector = Array.isArray(embeddingResult[0]) ? embeddingResult[0] : embeddingResult;

    // --- STEP 2: Find Relevant Documents (Supabase Vector Search) ---
    const { data: documents, error: searchError } = await supabase.rpc("match_documents", {
      query_embedding: queryVector,
      match_threshold: 0.50, // 50% similarity threshold
      match_count: 4,        // Retrieve top 4 chunks
      filter_workspace_id: workspace_id
    });

    if (searchError) {
        console.error("Search Error:", searchError);
        throw new Error("Failed to search knowledge base.");
    }

    // --- STEP 3: Build the Prompt for Groq ---
    let contextText = "No relevant documents found in the workspace.";
    if (documents && documents.length > 0) {
      contextText = documents.map((doc: any) => `[Source ID: ${doc.id}]\n${doc.content_text}`).join("\n\n");
    }

    const systemPrompt = `
    You are USWA, an AI workplace assistant.
    Use the Context below to answer the user's question.
    If the answer isn't in the context, say you don't know, but try to be helpful.
    
    --- CONTEXT FROM WORKSPACE DOCUMENTS ---
    ${contextText}
    ----------------------------------------
    `;

    // --- STEP 4: Generate Answer (Groq / Llama 3) ---
    const groqKey = Deno.env.get("GROQ_API_KEY");
    const completionResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-8b-8192", // High speed, low cost (free tier)
        messages: [
          { role: "system", content: systemPrompt },
          ...messages // Include recent chat history
        ],
        temperature: 0.1 // Keep it factual
      }),
    });

    const completionData = await completionResponse.json();
    const aiReply = completionData.choices[0].message.content;

    return new Response(JSON.stringify({ reply: aiReply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});