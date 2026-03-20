
-- Add 'staff' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';

-- Create a security definer function to assign initial role after signup
CREATE OR REPLACE FUNCTION public.assign_initial_role(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role app_role;
BEGIN
  -- If no roles exist yet, first user is admin; otherwise staff
  IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
    _role := 'admin';
  ELSE
    _role := 'staff';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;
