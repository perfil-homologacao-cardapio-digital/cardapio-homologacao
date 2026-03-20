
-- Add product_mode and related fields to products table
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS product_mode text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS combo_min_qty integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS combo_max_qty integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS flavor_count integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS flavor_price_rule text DEFAULT 'most_expensive';

-- Create combo_items table
CREATE TABLE IF NOT EXISTS public.combo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view combo items" ON public.combo_items FOR SELECT TO public USING (true);
CREATE POLICY "Admins can insert combo items" ON public.combo_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update combo items" ON public.combo_items FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete combo items" ON public.combo_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Create flavor_items table
CREATE TABLE IF NOT EXISTS public.flavor_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.flavor_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view flavor items" ON public.flavor_items FOR SELECT TO public USING (true);
CREATE POLICY "Admins can insert flavor items" ON public.flavor_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update flavor items" ON public.flavor_items FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete flavor items" ON public.flavor_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
