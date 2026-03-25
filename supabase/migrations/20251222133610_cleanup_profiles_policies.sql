/*
  # Clean Up Profiles RLS Policies

  ## Problem
  Multiple conflicting policies exist on the profiles table, including old policies
  that cause recursion issues.

  ## Solution
  1. Drop all existing policies
  2. Create a clean set of non-conflicting policies
  3. Ensure users can read their own profile after login
  
  ## Changes
  - Remove all existing policies
  - Create simple, non-recursive policies for all operations
*/

-- Drop ALL existing policies on profiles table
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can create own profile" ON profiles;
DROP POLICY IF EXISTS "Super admins can insert any profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile or super admin can insert any" ON profiles;
DROP POLICY IF EXISTS "Super admins can update profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can delete profiles" ON profiles;

-- Ensure the security definer function exists
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'super_admin'
  );
END;
$$;

-- SELECT: Users can view own profile OR super admins can view all
CREATE POLICY "profiles_select_policy"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR is_super_admin());

-- INSERT: Users can insert their own profile OR super admins can insert any
CREATE POLICY "profiles_insert_policy"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id OR is_super_admin());

-- UPDATE: Users can update own profile OR super admins can update any
CREATE POLICY "profiles_update_policy"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR is_super_admin())
  WITH CHECK (auth.uid() = id OR is_super_admin());

-- DELETE: Only super admins can delete profiles
CREATE POLICY "profiles_delete_policy"
  ON profiles FOR DELETE
  TO authenticated
  USING (is_super_admin());
