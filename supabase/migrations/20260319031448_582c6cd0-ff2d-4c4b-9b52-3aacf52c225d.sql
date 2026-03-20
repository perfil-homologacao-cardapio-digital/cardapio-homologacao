CREATE TABLE public.discount_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  type text NOT NULL DEFAULT 'percentage',
  value numeric NOT NULL DEFAULT 0,
  min_order_value numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.discount_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active coupons" ON public.discount_coupons FOR SELECT TO public USING (true);
CREATE POLICY "Admins can insert coupons" ON public.discount_coupons FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update coupons" ON public.discount_coupons FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete coupons" ON public.discount_coupons FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

ALTER TABLE public.orders ADD COLUMN coupon_code text;
ALTER TABLE public.orders ADD COLUMN discount_value numeric DEFAULT 0;