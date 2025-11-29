import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
// FIX: Use pdfjs-serverless to avoid 'canvas' dependency errors in Edge Runtime
import { resolvePDFJS } from "https://esm.sh/pdfjs-serverless@0.4.2";

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

    // 1. Download File from Storage
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("workspace_docs")
      .download(file_path);

    if (downloadError) throw new Error(`Storage Download Error: ${downloadError.message}`);

    // 2. Smart Text Extraction
    let textContent = "";
    
    // Check if PDF
    if (file_path.toLowerCase().endsWith('.pdf')) {
      try {
        console.log(`Processing PDF: ${file_path}`);
        const fileBuffer = await fileBlob.arrayBuffer();
        
        // Initialize PDF.js specifically for serverless (bypasses canvas requirements)
        const pdfjs = await resolvePDFJS();
        const doc = await pdfjs.getDocument({
            data: new Uint8Array(fileBuffer),
            useSystemFonts: true,
            disableFontFace: true,
        }).promise;

        const numPages = doc.numPages;
        let fullText = [];

        // Extract text page by page
        for (let i = 1; i <= numPages; i++) {
          const page = await doc.getPage(i);
          const textContentItem = await page.getTextContent();
          const pageText = textContentItem.items.map((item: any) => item.str).join(" ");
          fullText.push(pageText);
        }
        
        textContent = fullText.join("\n");

        if (!textContent.trim()) {
             textContent = `[PDF Document: ${file_path} - No readable text found. It might be an image-only PDF.]`;
        }

      } catch (pdfError: any) {
        console.error("PDF Parsing Error:", pdfError);
        textContent = `[Error parsing PDF content: ${pdfError.message}]`; 
      }
    } else {
      // Standard text extraction for other files (txt, md, csv)
      textContent = await fileBlob.text();
    }

    // Clean up null bytes
    textContent = textContent.replace(/\0/g, '').trim();

    // Limit text length for embedding model (prevent timeouts)
    const chunkToEmbed = textContent.substring(0, 4000); 

    // 3. Generate Embedding
    const hfKey = Deno.env.get("HUGGINGFACE_API_KEY");
    if (!hfKey) throw new Error("Missing HUGGINGFACE_API_KEY");

    const response = await fetch(
      "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hfKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: [chunkToEmbed], 
          options: { wait_for_model: true }
        }),
      }
    );

    if (!response.ok) {
        const errText = await response.text();
        console.error("Embedding API Error:", errText);
        throw new Error(`Hugging Face API Error: ${response.statusText}`);
    }

    const embeddingResult = await response.json();
    
    // Handle nested array response from HF
    let finalEmbedding = embeddingResult;
    if (Array.isArray(embeddingResult) && Array.isArray(embeddingResult[0])) {
        finalEmbedding = embeddingResult[0];
    }

    // 4. Save to DB
    const { error: updateError } = await supabase
      .from("documents")
      .update({
        content_text: textContent,
        embedding: finalEmbedding,
      })
      .eq("id", document_id);

    if (updateError) throw new Error(`DB Update Error: ${updateError.message}`);

    return new Response(JSON.stringify({ success: true }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error: any) {
    console.error("Process-Doc Critical Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});