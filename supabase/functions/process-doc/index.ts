import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { resolvePDFJS } from "https://esm.sh/pdfjs-serverless@0.4.2";
// FIX: Use Deno's standard library for reliable Base64 encoding
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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
    const groqKey = Deno.env.get("GROQ_API_KEY");
    const hfKey = Deno.env.get("HUGGINGFACE_API_KEY");

    console.log(`Processing file: ${file_path}`);

    // 1. Download File
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("workspace_docs")
      .download(file_path);

    if (downloadError) throw new Error(`Storage Download Error: ${downloadError.message}`);

    let textContent = "";
    const lowerPath = file_path.toLowerCase();
    const isPdf = lowerPath.endsWith('.pdf');
    const isImage = /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(lowerPath) || fileBlob.type.startsWith('image/');

    // 2. Extract Content
    if (isPdf) {
      // === PDF PROCESSING ===
      try {
        const fileBuffer = await fileBlob.arrayBuffer();
        const pdfjs = await resolvePDFJS();
        const doc = await pdfjs.getDocument({
            data: new Uint8Array(fileBuffer),
            useSystemFonts: true,
            disableFontFace: true,
        }).promise;
        const numPages = doc.numPages;
        let fullText = [];
        for (let i = 1; i <= numPages; i++) {
          const page = await doc.getPage(i);
          const textContentItem = await page.getTextContent();
          const pageText = textContentItem.items.map((item: any) => item.str).join(" ");
          fullText.push(pageText);
        }
        textContent = fullText.join("\n");
      } catch (pdfError: any) {
        console.error("PDF Error:", pdfError);
        textContent = `[Error parsing PDF: ${pdfError.message}]`;
      }

    } else if (isImage && groqKey) {
      // === VISION PROCESSING (Strict Size Limit) ===
      try {
        console.log("Processing Image with Vision AI...");

        // FIX: Reject images > 1.5MB to prevent API 400 Errors
        if (fileBlob.size > 1.5 * 1024 * 1024) {
            throw new Error("Image is too large (>1.5MB). Please upload a smaller screenshot or compressed image.");
        }
        
        // FIX: Use standard 'encode' for perfect Base64
        const arrayBuffer = await fileBlob.arrayBuffer();
        const base64Image = encode(new Uint8Array(arrayBuffer));
        
        // Determine MIME type
        let mimeType = "image/jpeg";
        if (lowerPath.endsWith(".png")) mimeType = "image/png";
        else if (lowerPath.endsWith(".webp")) mimeType = "image/webp";

        const visionResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.2-11b-vision-preview",
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: "Describe this image in detail. Extract any visible text, numbers, or diagrams." },
                        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } }
                    ]
                }],
                max_tokens: 1500
            })
        });

        if (!visionResponse.ok) {
            const errBody = await visionResponse.text();
            console.error("Groq Vision API Error:", errBody);
            // Save error to document so user sees it
            textContent = `[Image Analysis Failed: API Error ${visionResponse.status}. ${errBody}]`;
        } else {
            const visionData = await visionResponse.json();
            const description = visionData.choices?.[0]?.message?.content;
            if (description) {
                textContent = `[Image Content Analysis]:\n${description}`;
            } else {
                textContent = "[Image Analysis]: The AI returned no description.";
            }
        }
      } catch (visionError: any) {
        console.error("Vision Error:", visionError);
        textContent = `[Image Analysis Error: ${visionError.message}]`;
      }

    } else {
      // === FALLBACK (Text) ===
      textContent = await fileBlob.text();
    }

    // === SAVE & EMBED ===
    textContent = textContent.replace(/\0/g, '').trim();
    if (!textContent) textContent = `Document: ${file_path} (No readable content found)`;
    
    const chunkToEmbed = textContent.substring(0, 4000);

    // Save text immediately
    await supabase.from("documents").update({
        content_text: textContent
    }).eq("id", document_id);

    // Generate Embedding
    if (hfKey) {
        const response = await fetch(
        "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5",
        {
            method: "POST",
            headers: { Authorization: `Bearer ${hfKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ inputs: [chunkToEmbed], options: { wait_for_model: true } }),
        }
        );

        if (response.ok) {
            const embeddingResult = await response.json();
            let finalEmbedding = Array.isArray(embeddingResult) && Array.isArray(embeddingResult[0]) ? embeddingResult[0] : embeddingResult;
            
            await supabase.from("documents").update({
                embedding: finalEmbedding,
            }).eq("id", document_id);
        }
    }

    return new Response(JSON.stringify({ success: true }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});