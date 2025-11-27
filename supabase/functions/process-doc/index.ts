import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper to remove PostgreSQL-incompatible characters (like Null bytes)
function sanitizeText(text: string): string {
  // Removes \u0000 which crashes Postgres
  return text.replace(/\u0000/g, ''); 
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { document_id, file_path } = await req.json();
    console.log(`Processing document: ${file_path}`);

    // 1. Setup Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 2. Download File
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("workspace_docs")
      .download(file_path);

    if (downloadError) throw new Error(`Download failed: ${downloadError.message}`);

    // 3. Extract Text
    let textContent = await fileData.text();
    
    // SANITIZE: Remove null bytes immediately
    textContent = sanitizeText(textContent);

    if (!textContent || textContent.length < 5) {
      // Fallback for binary files read as text (keeps the flow alive)
      textContent = "[Binary file or empty content]";
    }

    // --- MOCK EMBEDDING (CPU Safe) ---
    const embedding = Array.from({ length: 384 }, () => Math.random());
    console.log(`Generated mock vector for ${textContent.length} chars.`);
    // ---------------------------------

    // 4. Update Database
    const { error: updateError } = await supabase
      .from("documents")
      .update({
        content_text: textContent,
        embedding: embedding,
      })
      .eq("id", document_id);

    if (updateError) {
      console.error("DB Update Error Detail:", updateError);
      throw new Error(`DB Update failed: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Document processed successfully." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Process Doc Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});