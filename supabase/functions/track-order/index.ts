import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone } = await req.json();
    if (!phone || phone.replace(/\D/g, "").length < 10) {
    return new Response(JSON.stringify({ error: "Invalid phone" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clean = phone.replace(/\D/g, "");

    // Build all possible formats to match against DB
    const formats = [clean];
    if (clean.length === 11) {
      formats.push(`(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`);
    }
    if (clean.length === 10) {
      formats.push(`(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, customer_name, status, address")
      .in("customer_phone", formats)
      .in("status", ["new", "preparing", "ready", "out_for_delivery"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return new Response(JSON.stringify({ order: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
