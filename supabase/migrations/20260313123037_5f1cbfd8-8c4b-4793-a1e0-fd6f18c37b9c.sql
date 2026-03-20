
CREATE TABLE public.pizza_crust_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pizza_crust_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view crust options" ON public.pizza_crust_options FOR SELECT TO public USING (true);
CREATE POLICY "Admins can insert crust options" ON public.pizza_crust_options FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update crust options" ON public.pizza_crust_options FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete crust options" ON public.pizza_crust_options FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
