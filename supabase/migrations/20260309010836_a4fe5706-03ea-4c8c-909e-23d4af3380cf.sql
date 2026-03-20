-- Ensure public checkout can insert related rows
-- Only adjust INSERT policies as requested

-- order_items: recreate INSERT policy as PERMISSIVE
DROP POLICY IF EXISTS "Anyone can insert order items" ON public.order_items;
CREATE POLICY "Anyone can insert order items"
ON public.order_items
AS PERMISSIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- order_item_selections: recreate INSERT policy as PERMISSIVE
DROP POLICY IF EXISTS "Anyone can insert order item selections" ON public.order_item_selections;
CREATE POLICY "Anyone can insert order item selections"
ON public.order_item_selections
AS PERMISSIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
