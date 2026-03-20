
-- Fix: recreate INSERT policies as PERMISSIVE for public order creation

-- orders
DROP POLICY IF EXISTS "Anyone can insert orders" ON public.orders;
CREATE POLICY "Anyone can insert orders"
  ON public.orders FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- order_items
DROP POLICY IF EXISTS "Anyone can insert order items" ON public.order_items;
CREATE POLICY "Anyone can insert order items"
  ON public.order_items FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- order_item_selections
DROP POLICY IF EXISTS "Anyone can insert order item selections" ON public.order_item_selections;
CREATE POLICY "Anyone can insert order item selections"
  ON public.order_item_selections FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
