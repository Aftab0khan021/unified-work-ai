import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { document_id, file_path } = await req.json();
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Download File
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("workspace_docs")
      .download(file_path);

    if (downloadError) throw new Error(`Storage Download Error: ${downloadError.message}`);

    // 2. Extract Text
    let textContent = await fileBlob.text();
    textContent = textContent.replace(/\0/g, '');

    if (!textContent || textContent.trim().length === 0) {
       console.log("File content empty, using filename.");
       textContent = `Document: ${file_path.split('/').pop()}`; 
    }

    // Limit text length to prevent 413/Payload Too Large errors
    const chunkToEmbed = textContent.substring(0, 3000); 

    // 3. Generate Embedding (STABLE MODEL)
    const hfKey = Deno.env.get("HUGGINGFACE_API_KEY");
    if (!hfKey) throw new Error("Missing HUGGINGFACE_API_KEY");

    console.log(`Generating embedding for: ${file_path}`);

    const response = await fetch(
      "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hfKey}`,
          "Content-Type": "application/json",
        },
        // CRITICAL FIX: Send as an array to satisfy the router's pipeline
        body: JSON.stringify({
          inputs: [chunkToEmbed], 
          options: { wait_for_model: true }
        }),
      }
    );

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Hugging Face API Error: ${errText}`);
    }

    const embeddingResult = await response.json();

    // 4. Handle Response Format (Unwrap if nested)
    let finalEmbedding = embeddingResult;
    if (Array.isArray(embeddingResult) && Array.isArray(embeddingResult[0])) {
        finalEmbedding = embeddingResult[0];
    }

    // 5. Save to DB
    const { error: updateError } = await supabase
      .from("documents")
      .update({
        content_text: textContent,
        embedding: finalEmbedding,
      })
      .eq("id", document_id);

    if (updateError) throw new Error(`DB Update Error: ${updateError.message}`);

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Process Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});