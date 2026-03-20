
-- Add has_options column to products (only thing missing)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS has_options boolean NOT NULL DEFAULT false;

-- Ensure tables exist
CREATE TABLE IF NOT EXISTS public.product_option_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'single_choice',
  required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  min_select integer NOT NULL DEFAULT 0,
  max_select integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  price_mode text NOT NULL DEFAULT 'sum',
  placeholder text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.product_option_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_item_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  group_id uuid,
  option_id uuid,
  selection_type text NOT NULL DEFAULT 'option',
  group_name_snapshot text,
  option_name_snapshot text,
  price_snapshot numeric NOT NULL DEFAULT 0,
  text_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_product_option_groups_product_id ON public.product_option_groups(product_id);
CREATE INDEX IF NOT EXISTS idx_product_options_group_id ON public.product_options(group_id);
CREATE INDEX IF NOT EXISTS idx_order_item_selections_order_item_id ON public.order_item_selections(order_item_id);

-- Enable RLS
ALTER TABLE public.product_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_selections ENABLE ROW LEVEL SECURITY;

-- Policies with DROP IF EXISTS to avoid conflicts
DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active option groups" ON public.product_option_groups;
  DROP POLICY IF EXISTS "Admins can insert option groups" ON public.product_option_groups;
  DROP POLICY IF EXISTS "Admins can update option groups" ON public.product_option_groups;
  DROP POLICY IF EXISTS "Admins can delete option groups" ON public.product_option_groups;

  DROP POLICY IF EXISTS "Anyone can view options" ON public.product_options;
  DROP POLICY IF EXISTS "Admins can insert options" ON public.product_options;
  DROP POLICY IF EXISTS "Admins can update options" ON public.product_options;
  DROP POLICY IF EXISTS "Admins can delete options" ON public.product_options;

  DROP POLICY IF EXISTS "Anyone can insert order item selections" ON public.order_item_selections;
  DROP POLICY IF EXISTS "Admins can view order item selections" ON public.order_item_selections;
END $$;

CREATE POLICY "Anyone can view active option groups" ON public.product_option_groups FOR SELECT USING (true);
CREATE POLICY "Admins can insert option groups" ON public.product_option_groups FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update option groups" ON public.product_option_groups FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete option groups" ON public.product_option_groups FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view options" ON public.product_options FOR SELECT USING (true);
CREATE POLICY "Admins can insert options" ON public.product_options FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update options" ON public.product_options FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete options" ON public.product_options FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can insert order item selections" ON public.order_item_selections FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view order item selections" ON public.order_item_selections FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
