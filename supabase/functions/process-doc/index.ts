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
    
    // 1. Setup Supabase Client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 2. Download the File
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("workspace_docs")
      .download(file_path);

    if (downloadError) throw new Error(`Download failed: ${downloadError.message}`);

    // 3. Extract Text (Basic)
    // NOTE: This assumes text files. For PDFs, you technically need a parser here.
    // For now, we clean the text to prevent DB errors.
    let textContent = await fileData.text();
    textContent = textContent.replace(/\u0000/g, ''); // Remove null bytes
    
    // Limit text length to prevent API errors (approx 500 words for the free model)
    const chunkToEmbed = textContent.substring(0, 3000); 

    console.log(`Generating embedding for: ${file_path}`);

    // 4. Get Real Embeddings from Hugging Face (Free)
    const hfKey = Deno.env.get("HUGGINGFACE_API_KEY");
    if (!hfKey) throw new Error("HUGGINGFACE_API_KEY is missing");

    const embeddingResponse = await fetch(
      "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hfKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: chunkToEmbed,
          options: { wait_for_model: true }
        }),
      }
    );

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      throw new Error(`Hugging Face Error: ${errorText}`);
    }

    const embedding = await embeddingResponse.json();

    // Validating the embedding format
    if (!Array.isArray(embedding) || embedding.length !== 384) {
       // Sometimes HF returns an array of arrays, handle that:
       if (Array.isArray(embedding[0]) && embedding[0].length === 384) {
           // It's nested, use the first one
       } else {
           throw new Error(`Invalid embedding format received. Expected 384 dimensions.`);
       }
    }
    const finalVector = Array.isArray(embedding[0]) ? embedding[0] : embedding;

    // 5. Save to Database
    const { error: updateError } = await supabase
      .from("documents")
      .update({
        content_text: textContent, // Save full text
        embedding: finalVector,    // Save the vector
      })
      .eq("id", document_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ success: true, message: "Embedded successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});