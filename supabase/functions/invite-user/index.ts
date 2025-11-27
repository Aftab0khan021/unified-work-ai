import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, workspaceId } = await req.json();

    // 1. Get Environment Variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    // Try getting the standard service role key first
    let supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Validation
    if (!supabaseUrl) {
      throw new Error("SUPABASE_URL is missing from environment variables.");
    }
    if (!supabaseServiceKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing. Please ensure it is available in your Supabase project secrets.");
    }
    if (!email || !workspaceId) {
      throw new Error("Missing 'email' or 'workspaceId' in request body.");
    }

    // 2. Create Supabase Admin Client (Bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Find User ID by Email
    // Note: admin.listUsers() requires the service_role key.
    const { data: usersData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (userError) {
      throw new Error(`Failed to list users: ${userError.message}`);
    }
    
    // Find the user with the matching email
    const user = usersData.users.find((u) => u.email === email);

    if (!user) {
      return new Response(
        JSON.stringify({ error: "User not found. The user must sign up for the app first." }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Check if User is Already a Member
    const { data: existingMember, error: checkError } = await supabaseAdmin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (existingMember) {
       return new Response(
        JSON.stringify({ message: "User is already a member of this workspace." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 5. Add User to Workspace
    const { error: insertError } = await supabaseAdmin
      .from("workspace_members")
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        role: "member", // Default role
      });

    if (insertError) {
      throw new Error(`Failed to add member: ${insertError.message}`);
    }

    return new Response(
      JSON.stringify({ message: `Successfully added ${email} to the workspace.` }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    console.error("Invite User Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal Server Error" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});