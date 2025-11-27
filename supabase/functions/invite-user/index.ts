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
    const { email, workspaceId } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    if (!email || !workspaceId) throw new Error("Missing email or workspaceId");

    // 1. Search for existing user
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
    const user = usersData.users.find((u) => u.email === email);

    if (user) {
      // CASE A: User exists -> Add directly (Old Logic)
      const { data: existing } = await supabaseAdmin
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .single();

      if (existing) {
        return new Response(JSON.stringify({ message: "User is already a member." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await supabaseAdmin.from("workspace_members").insert({
        workspace_id: workspaceId,
        user_id: user.id,
        role: "member",
      });

      return new Response(JSON.stringify({ message: `Added ${email} to the team.` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    
    } else {
      // CASE B: User does NOT exist -> Create Invite (New Logic)
      const { error: inviteError } = await supabaseAdmin
        .from("workspace_invites")
        .insert({
          workspace_id: workspaceId,
          email: email,
          role: "member"
        });

      if (inviteError) {
        // Ignore duplicate invite errors
        if (!inviteError.message.includes("duplicate key")) throw inviteError;
      }

      return new Response(
        JSON.stringify({ message: `Invite sent! ${email} will be added when they sign up.` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});