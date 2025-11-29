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

    // --- STEP 1: Embedding (BGE Model) ---
    const hfKey = Deno.env.get("HUGGINGFACE_API_KEY");
    if (!hfKey) throw new Error("HUGGINGFACE_API_KEY is missing");

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

    let queryVector = [];
    if (embeddingResponse.ok) {
        try {
            const embeddingResult = await embeddingResponse.json();
            if (Array.isArray(embeddingResult) && Array.isArray(embeddingResult[0])) {
                queryVector = embeddingResult[0];
            } else {
                queryVector = embeddingResult;
            }
        } catch (e) {
            console.error("Embedding parse error", e);
        }
    } else {
        console.error("Embedding API failed:", await embeddingResponse.text());
    }

    // --- STEP 2: Vector Search ---
    let contextText = "No specific documents found.";
    
    if (queryVector && queryVector.length > 0) {
        const { data: documents } = await supabase.rpc("match_documents", {
            query_embedding: queryVector,
            match_threshold: 0.45, // Slightly lowered threshold for better recall
            match_count: 4,
            filter_workspace_id: workspace_id
        });

        if (documents && documents.length > 0) {
            contextText = documents.map((doc: any) => `[Doc]: ${doc.content_text}`).join("\n\n");
        }
    }

    const systemPrompt = `
    You are USWA, a helpful AI assistant.
    Answer based on the context below. If the answer isn't there, say you don't know.
    
    --- CONTEXT ---
    ${contextText}
    ---------------
    `;

    // --- Sanitize Messages ---
    const cleanMessages = messages.map((msg: any) => {
        return {
            role: msg.role === 'user' ? 'user' : 'assistant', 
            content: msg.content
        };
    });

    // --- STEP 3: Groq Completion (UPDATED MODEL) ---
    const groqKey = Deno.env.get("GROQ_API_KEY");
    const completionResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // FIX: Updated to the new stable model
        model: "llama-3.1-8b-instant", 
        messages: [
          { role: "system", content: systemPrompt },
          ...cleanMessages 
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