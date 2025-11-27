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

    // --- STEP 1: Turn User Question into a Vector (STABLE MODEL) ---
    const hfKey = Deno.env.get("HUGGINGFACE_API_KEY");
    
    const embeddingResponse = await fetch(
      "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${hfKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ 
            inputs: [latestMessage], 
            options: { wait_for_model: true } 
        }),
      }
    );

    if (!embeddingResponse.ok) {
        const errText = await embeddingResponse.text();
        throw new Error(`Hugging Face Error: ${errText}`);
    }
    
    const embeddingResult = await embeddingResponse.json();
    
    // Unwrap nested response
    let queryVector = embeddingResult;
    if (Array.isArray(embeddingResult) && Array.isArray(embeddingResult[0])) {
        queryVector = embeddingResult[0];
    }

    // --- STEP 2: Find Relevant Documents ---
    const { data: documents, error: searchError } = await supabase.rpc("match_documents", {
      query_embedding: queryVector,
      match_threshold: 0.50,
      match_count: 5,
      filter_workspace_id: workspace_id
    });

    if (searchError) {
        console.error("Search Error:", searchError);
    }

    // --- STEP 3: Build Context ---
    let contextText = "No specific documents found for this query.";
    if (documents && documents.length > 0) {
      contextText = documents.map((doc: any) => `[Content]: ${doc.content_text}`).join("\n\n");
    }

    const systemPrompt = `
    You are USWA, an AI workplace assistant.
    Answer the user's question based ONLY on the context provided below.
    If the answer is not in the context, say "I don't have that information in the uploaded documents."
    
    --- CONTEXT ---
    ${contextText}
    ---------------
    `;

    // --- STEP 4: Generate Answer (Groq) ---
    const groqKey = Deno.env.get("GROQ_API_KEY");
    const completionResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
        temperature: 0.1
      }),
    });

    if (!completionResponse.ok) {
        const err = await completionResponse.text();
        throw new Error(`Groq API Error: ${err}`);
    }

    const completionData = await completionResponse.json();
    const reply = completionData.choices[0].message.content;

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Chat Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});