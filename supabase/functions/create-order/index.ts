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
  notes: string | null;
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

class HttpError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stockError(message: string, code: "OUT_OF_STOCK" | "INSUFFICIENT_STOCK" | "STOCK_CONFLICT") {
  return new HttpError(409, message, code);
}

function normalizeNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    const order = body?.order as OrderPayload | undefined;
    const items = (body?.items as CartItem[] | undefined) ?? [];

    if (!order) return jsonResponse({ error: "Missing order" }, 400);

    if (!order.customer_name?.trim()) {
      return jsonResponse({ error: "Missing customer_name" }, 400);
    }

    if (!order.customer_phone?.trim()) {
      return jsonResponse({ error: "Missing customer_phone" }, 400);
    }

    if (!Array.isArray(items) || items.length === 0) {
      return jsonResponse({ error: "Missing items" }, 400);
    }

    const invalidItem = items.find(
      (item) => !item?.id || !item?.name?.trim() || normalizeNumber(item.quantity) <= 0,
    );

    if (invalidItem) {
      return jsonResponse({ error: "Invalid cart item payload" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const qtyMap: Record<string, number> = {};
    for (const item of items) {
      qtyMap[item.id] = (qtyMap[item.id] || 0) + normalizeNumber(item.quantity);
    }

    const productIds = Object.keys(qtyMap);
    const reservedStock: Array<{
      productId: string;
      previousQuantity: number;
      previousAvailable: boolean;
      newQuantity: number;
    }> = [];

    const rollbackReservedStock = async () => {
      for (const reservation of [...reservedStock].reverse()) {
        await supabase
          .from("products")
          .update({
            stock_quantity: reservation.previousQuantity,
            available: reservation.previousAvailable,
          })
          .eq("id", reservation.productId)
          .eq("stock_quantity", reservation.newQuantity);
      }
    };

    if (productIds.length > 0) {
      const { data: stockProducts, error: stockErr } = await supabase
        .from("products")
        .select("id, name, available, has_stock_control, stock_quantity")
        .in("id", productIds)
        .eq("has_stock_control", true);

      if (stockErr) throw stockErr;

      for (const product of stockProducts ?? []) {
        const requestedQuantity = qtyMap[product.id] || 0;
        if (requestedQuantity <= 0) continue;

        const currentQuantity = normalizeNumber(product.stock_quantity);
        if (currentQuantity <= 0) {
          throw stockError(`O produto ${product.name} está sem estoque no momento.`, "OUT_OF_STOCK");
        }

        if (requestedQuantity > currentQuantity) {
          throw stockError(
            `Estoque insuficiente para ${product.name}. Disponível: ${currentQuantity}.`,
            "INSUFFICIENT_STOCK",
          );
        }
      }

      for (const product of stockProducts ?? []) {
        const requestedQuantity = qtyMap[product.id] || 0;
        if (requestedQuantity <= 0) continue;

        const currentQuantity = normalizeNumber(product.stock_quantity);
        const newQuantity = Math.max(0, currentQuantity - requestedQuantity);
        const nextAvailable = newQuantity > 0;

        const { data: updatedProduct, error: reserveErr } = await supabase
          .from("products")
          .update({
            stock_quantity: newQuantity,
            available: nextAvailable,
          })
          .eq("id", product.id)
          .eq("has_stock_control", true)
          .eq("stock_quantity", currentQuantity)
          .select("id")
          .maybeSingle();

        if (reserveErr) {
          await rollbackReservedStock();
          throw reserveErr;
        }

        if (!updatedProduct) {
          await rollbackReservedStock();
          throw stockError(
            `O estoque de ${product.name} foi alterado agora. Revise o carrinho e tente novamente.`,
            "STOCK_CONFLICT",
          );
        }

        reservedStock.push({
          productId: product.id,
          previousQuantity: currentQuantity,
          previousAvailable: product.available,
          newQuantity,
        });
      }
    }

    try {
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
          notes: order.notes ?? null,
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

      return jsonResponse({
        order: { id: createdOrder.id, order_number: createdOrder.order_number },
      });
    } catch (err) {
      await rollbackReservedStock();
      throw err;
    }
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    return jsonResponse(
      {
        error: err?.message ?? "Unknown error",
        code: err instanceof HttpError ? err.code ?? null : null,
      },
      status,
    );
  }
});
