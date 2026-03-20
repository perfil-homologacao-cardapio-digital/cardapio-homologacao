import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type OrderPayload = {
  customer_name: string;
  customer_phone: string;
  address: string;
  address_number: string;
  complement: string | null;
  neighborhood_id: string | null;
  neighborhood_name: string | null;
  delivery_fee: number;
  subtotal: number;
  total: number;
  payment_method: string;
  needs_change: boolean | null;
  change_amount: number | null;
  preorder_date: string | null;
  coupon_code: string | null;
  discount_value: number | null;
};

type CartSelection = {
  group_id?: string | null;
  option_id?: string | null;
  group_name?: string | null;
  option_name?: string | null;
  price?: number | null;
};

type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  selections?: CartSelection[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    const order = body?.order as OrderPayload | undefined;
    const items = (body?.items as CartItem[] | undefined) ?? [];

    if (!order) {
      return new Response(JSON.stringify({ error: "Missing order" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!order.customer_name?.trim()) {
      return new Response(JSON.stringify({ error: "Missing customer_name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!order.customer_phone?.trim()) {
      return new Response(JSON.stringify({ error: "Missing customer_phone" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "Missing items" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Create order (server-side; keeps orders SELECT private to admins)
    const { data: createdOrder, error: orderErr } = await supabase
      .from("orders")
      .insert({
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        address: order.address,
        address_number: order.address_number,
        complement: order.complement,
        neighborhood_id: order.neighborhood_id,
        neighborhood_name: order.neighborhood_name,
        delivery_fee: order.delivery_fee,
        subtotal: order.subtotal,
        total: order.total,
        payment_method: order.payment_method,
        needs_change: order.needs_change,
        change_amount: order.change_amount,
        preorder_date: order.preorder_date,
        coupon_code: order.coupon_code ?? null,
        discount_value: order.discount_value ?? 0,
      })
      .select("id, order_number")
      .single();

    if (orderErr) throw orderErr;

    // Insert items + selections sequentially to keep a stable mapping (no public SELECT needed)
    for (const item of items) {
      const { data: createdItem, error: itemErr } = await supabase
        .from("order_items")
        .insert({
          order_id: createdOrder.id,
          product_id: item.id,
          product_name: item.name,
          product_price: item.price,
          quantity: item.quantity,
          subtotal: item.price * item.quantity,
        })
        .select("id")
        .single();

      if (itemErr) throw itemErr;

      const selections = Array.isArray(item.selections) ? item.selections : [];
      if (selections.length > 0) {
        const rows = selections.map((sel) => ({
          order_item_id: createdItem.id,
          group_id: sel.group_id ?? null,
          option_id: sel.option_id ?? null,
          group_name_snapshot: sel.group_name ?? null,
          option_name_snapshot: sel.option_name ?? null,
          price_snapshot: sel.price ?? 0,
          selection_type: "option",
        }));

        const { error: selErr } = await supabase
          .from("order_item_selections")
          .insert(rows);

        if (selErr) throw selErr;
      }
    }

    return new Response(
      JSON.stringify({ order: { id: createdOrder.id, order_number: createdOrder.order_number } }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
