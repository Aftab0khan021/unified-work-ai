import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user_id, google_token } = await req.json();
    
    // 1. Use the token provided by the frontend
    let accessToken = google_token;

    if (!accessToken) {
        throw new Error("No Google Access Token provided. Please re-connect Gmail.");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 2. Fetch Unread Emails (Limit 5)
    console.log("Fetching emails with token...");
    const gmailResponse = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=5",
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!gmailResponse.ok) {
        const errText = await gmailResponse.text();
        console.error("Gmail Error:", errText);
        throw new Error("Failed to access Gmail. Token might be expired. Please click 'Connect Gmail' again.");
    }

    const { messages } = await gmailResponse.json();

    if (!messages || messages.length === 0) {
        return new Response(JSON.stringify({ message: "No unread emails found." }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }

    let tasksCreated = 0;

    // 3. Process Emails with AI
    for (const msg of messages) {
        // Fetch full content
        const detailRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const emailData = await detailRes.json();
        const snippet = emailData.snippet;
        const subject = emailData.payload.headers.find((h: any) => h.name === 'Subject')?.value || "No Subject";

        // AI Analysis
        const groqKey = Deno.env.get("GROQ_API_KEY");
        const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [{
                    role: "system",
                    content: `Analyze this email. If it creates a task, return JSON: { "is_task": true, "title": "Task Title", "priority": "medium" }. Else { "is_task": false }.`
                }, {
                    role: "user",
                    content: `Subject: ${subject}\nBody: ${snippet}`
                }],
                response_format: { type: "json_object" }
            }),
        });

        const aiData = await aiResponse.json();
        const analysis = JSON.parse(aiData.choices[0].message.content);

        if (analysis.is_task) {
            // Find a Project to attach to
            const { data: project } = await supabase
                .from('projects')
                .select('id, workspace_id')
                .limit(1)
                .single();

            if (project) {
                 await supabase.from("tasks").insert({
                    title: `📧 ${analysis.title}`,
                    priority: analysis.priority,
                    status: "todo",
                    creator_id: user_id,
                    assignee_id: user_id,
                    project_id: project.id,
                    workspace_id: project.workspace_id
                });
                tasksCreated++;
            }
        }
    }

    return new Response(JSON.stringify({ 
        success: true, 
        message: `Scanned ${messages.length} emails. Created ${tasksCreated} tasks.` 
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});