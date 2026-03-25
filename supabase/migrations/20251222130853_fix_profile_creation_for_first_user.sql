/*
  # Fix Profile Creation for First Super Admin
  
  1. Changes
    - Add policy to allow users to create their own profile during signup
    - This enables the first super admin to be created
    - Subsequent users must be created by super admins through the Users page
  
  2. Security
    - Users can only create a profile for themselves (matching auth.uid())
    - Super admins can still create profiles for other users
*/

-- Drop the existing insert policy for profiles
DROP POLICY IF EXISTS "Super admins can insert profiles" ON profiles;

-- Allow users to insert their own profile during signup
CREATE POLICY "Users can create own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Allow super admins to insert profiles for others
CREATE POLICY "Super admins can insert any profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );