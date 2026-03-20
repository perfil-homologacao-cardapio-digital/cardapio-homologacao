
-- Drop all and recreate as PERMISSIVE

DROP POLICY IF EXISTS "Anyone can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Anyone can insert order item selections" ON public.order_item_selections;

CREATE POLICY "Anyone can insert orders"
  ON public.orders
  AS PERMISSIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can insert order items"
  ON public.order_items
  AS PERMISSIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can insert order item selections"
  ON public.order_item_selections
  AS PERMISSIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
