import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (profile.role !== "super_admin" && profile.role !== "general_manager") {
      return new Response(
        JSON.stringify({ error: "Only super_admin and general_manager can delete test data" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const deletionOrder = [
      "invoice_line_items",
      "invoices",
      "inventory_items",
      "goods_received",
      "purchase_orders",
      "purchase_requisitions",
      "client_vehicles",
      "clients",
      "notifications",
    ];

    const results: Record<string, number> = {};
    let totalDeleted = 0;

    for (const table of deletionOrder) {
      const { data: countData } = await adminClient
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("is_test_data", true);

      const { error: deleteError, count } = await adminClient
        .from(table)
        .delete({ count: "exact" })
        .eq("is_test_data", true);

      if (deleteError) {
        console.error(`Error deleting from ${table}:`, deleteError);
        return new Response(
          JSON.stringify({ error: `Failed to delete from ${table}: ${deleteError.message}` }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      results[table] = count || 0;
      totalDeleted += count || 0;
    }

    const { data: testInventoryItems } = await adminClient
      .from("inventory_items")
      .select("tank_id, remaining_liters")
      .eq("is_test_data", false);

    if (testInventoryItems) {
      const tankTotals: Record<string, number> = {};
      for (const item of testInventoryItems) {
        tankTotals[item.tank_id] = (tankTotals[item.tank_id] || 0) + Number(item.remaining_liters);
      }

      for (const [tankId, total] of Object.entries(tankTotals)) {
        await adminClient
          .from("inventory_tanks")
          .update({ current_liters: total })
          .eq("id", tankId);
      }

      const { data: allTanks } = await adminClient
        .from("inventory_tanks")
        .select("id");

      if (allTanks) {
        for (const tank of allTanks) {
          if (!tankTotals[tank.id]) {
            const { data: hasItems } = await adminClient
              .from("inventory_items")
              .select("id")
              .eq("tank_id", tank.id)
              .eq("is_test_data", false)
              .limit(1);

            if (!hasItems || hasItems.length === 0) {
              await adminClient
                .from("inventory_tanks")
                .update({ current_liters: 0 })
                .eq("id", tank.id);
            }
          }
        }
      }
    }

    await adminClient
      .from("system_settings")
      .update({ testing_mode_enabled: false })
      .neq("id", "00000000-0000-0000-0000-000000000000");

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully deleted ${totalDeleted} test records`,
        details: results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in delete-test-data function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});