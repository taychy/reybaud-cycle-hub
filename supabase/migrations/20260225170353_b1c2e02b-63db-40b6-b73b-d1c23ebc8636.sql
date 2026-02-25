
-- 1. Create admin_role enum
CREATE TYPE public.admin_role AS ENUM ('super_admin', 'admin', 'support');

-- 2. Create admin_profiles table
CREATE TABLE public.admin_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL UNIQUE,
  role admin_role NOT NULL DEFAULT 'admin',
  status text NOT NULL DEFAULT 'active',
  last_login_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

-- 4. RLS: only admins (from user_roles) can view
CREATE POLICY "Admins can view admin_profiles"
  ON public.admin_profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. RLS: only admins can manage (insert/update/delete handled by edge function with service_role, but allow for direct admin access too)
CREATE POLICY "Admins can manage admin_profiles"
  ON public.admin_profiles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. Trigger to update updated_at
CREATE TRIGGER update_admin_profiles_updated_at
  BEFORE UPDATE ON public.admin_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
