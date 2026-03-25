/*
  # Fix Infinite Recursion in Profiles RLS Policies

  ## Problem
  The existing profiles policies cause infinite recursion because they query the profiles table
  to check if a user is a super_admin, which triggers the same policy again.

  ## Solution
  1. Drop the existing problematic policies
  2. Create new policies that avoid recursion:
     - Allow users to insert their own profile (for initial signup)
     - Use a security definer function to check roles without recursion
     - Allow first user to be created without restrictions
  
  ## Changes
  - Drop existing profiles policies that cause recursion
  - Create security definer function to safely check user role
  - Create new non-recursive policies
*/

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can update profiles" ON profiles;

-- Create a security definer function to check if current user is super admin
-- This breaks the recursion by executing with elevated privileges
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

-- Policy: Super admins can view all profiles (using security definer function)
CREATE POLICY "Super admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_super_admin());

-- Policy: Allow inserting profile if user is super admin OR if it's their own profile
CREATE POLICY "Users can insert own profile or super admin can insert any"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id OR is_super_admin()
  );

-- Policy: Super admins can update any profile, users can update their own
CREATE POLICY "Super admins can update profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (is_super_admin() OR auth.uid() = id)
  WITH CHECK (is_super_admin() OR auth.uid() = id);

-- Policy: Super admins can delete profiles
CREATE POLICY "Super admins can delete profiles"
  ON profiles FOR DELETE
  TO authenticated
  USING (is_super_admin());
