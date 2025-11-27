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
    const latestMessage = messages[messages.length - 1].content;

    // 1. Setup Clients
    const apiKey = Deno.env.get("GROQ_API_KEY"); // Using Groq for fast Llama 3 responses
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!apiKey) throw new Error("GROQ_API_KEY is not set");

    // 2. RAG: Search for relevant documents
    // Note: Since we are using MOCK embeddings (random numbers), the search results 
    // won't be semantically accurate yet, but the *pipeline* is real.
    // In production, you'd generate a real embedding for 'latestMessage' here first.
    
    // For this MVP, we just fetch the 3 most recent documents to give the AI context.
    const { data: docs, error: searchError } = await supabase
      .from("documents")
      .select("content_text, name")
      .order("created_at", { ascending: false })
      .limit(3);

    if (searchError) {
      console.error("Vector search error:", searchError);
    }

    // 3. Construct Context Block
    let contextBlock = "";
    if (docs && docs.length > 0) {
      contextBlock = "\n\nRELEVANT WORKSPACE DOCUMENTS:\n" + 
        docs.map(d => `--- Document: ${d.name} ---\n${d.content_text.substring(0, 500)}...`).join("\n\n");
    }

    // 4. Build System Prompt
    const systemMessage = {
      role: "system",
      content: `You are USWA, an intelligent work assistant. 
      
      User Context:
      - Today is ${new Date().toLocaleDateString()}.
      ${contextBlock}
      
      Instructions:
      - If the user asks about a document mentioned above, answer using that information.
      - If the documents are not relevant, answer from your general knowledge.
      - Be concise and helpful.`
    };

    const finalMessages = [systemMessage, ...messages];

    // 5. Call LLM (Groq)
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: finalMessages,
        temperature: 0.2, // Lower temperature for more factual answers based on context
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(`Groq Error: ${data.error.message}`);

    return new Response(JSON.stringify({ reply: data.choices[0].message.content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Chat Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});