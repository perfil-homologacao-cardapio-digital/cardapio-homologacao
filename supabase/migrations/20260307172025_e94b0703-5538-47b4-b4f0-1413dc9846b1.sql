
-- product_option_groups table
CREATE TABLE public.product_option_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'single_choice',
  required BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  min_select INTEGER NOT NULL DEFAULT 0,
  max_select INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  price_mode TEXT NOT NULL DEFAULT 'sum',
  placeholder TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- product_options table
CREATE TABLE public.product_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.product_option_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- order_item_selections table
CREATE TABLE public.order_item_selections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  group_id UUID,
  option_id UUID,
  selection_type TEXT NOT NULL DEFAULT 'option',
  group_name_snapshot TEXT,
  option_name_snapshot TEXT,
  price_snapshot NUMERIC NOT NULL DEFAULT 0,
  text_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add has_options column to products
ALTER TABLE public.products ADD COLUMN has_options BOOLEAN NOT NULL DEFAULT false;

-- Enable RLS
ALTER TABLE public.product_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_selections ENABLE ROW LEVEL SECURITY;

-- RLS for product_option_groups
CREATE POLICY "Anyone can view active option groups" ON public.product_option_groups FOR SELECT USING (true);
CREATE POLICY "Admins can insert option groups" ON public.product_option_groups FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update option groups" ON public.product_option_groups FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete option groups" ON public.product_option_groups FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- RLS for product_options
CREATE POLICY "Anyone can view options" ON public.product_options FOR SELECT USING (true);
CREATE POLICY "Admins can insert options" ON public.product_options FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update options" ON public.product_options FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete options" ON public.product_options FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- RLS for order_item_selections
CREATE POLICY "Anyone can insert order item selections" ON public.order_item_selections FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view order item selections" ON public.order_item_selections FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
