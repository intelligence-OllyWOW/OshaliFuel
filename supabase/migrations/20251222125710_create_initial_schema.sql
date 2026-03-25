/*
  # Oshali Fuel Distribution Management System - Initial Schema
  
  1. New Tables
    - `profiles`
      - Links to auth.users for role-based access control
      - Roles: super_admin, general_manager, finance, administrator, operations_supervisor, pump_attendant
      - Stores user profile information
    
    - `purchase_requisitions`
      - Tracks fuel purchase requests from Operations
      - Fields: PR number, liters requested, requisition date, price per liter, status
      - Status: draft, submitted, under_review, approved, rejected, converted_to_po
    
    - `purchase_orders`
      - Official purchase documents created by Finance from approved PRs
      - Fields: PO number, references PR, final liters, final price, supplier details
      - Status: draft, sent_to_supplier, paid, goods_received
    
    - `goods_received`
      - Documents confirming fuel receipt from depot
      - Fields: GR number, references PO, receipt date, actual liters received
      - Status: received, allocated_to_inventory, completed
    
    - `inventory_tanks`
      - Three tanks (A, B, C) with 23,000L capacity each
      - Tracks current total liters and capacity
    
    - `inventory_items`
      - Individual GR batches allocated to tanks with FIFO tracking
      - Fields: GR reference, tank, cost price, remaining liters, entry date
      - Used for FIFO cost tracking during sales
    
    - `clients`
      - Customer information saved for reuse
      - Fields: name, cell number, creation date
    
    - `vehicles`
      - Vehicle details linked to clients
      - Fields: type, make, registration, driver name, client reference
    
    - `invoices`
      - Sales transactions created by pump attendants
      - Fields: invoice number, delivery note, client, total amount, selling price
    
    - `invoice_line_items`
      - Tracks which inventory items/GRs supplied fuel for each invoice
      - Critical for FIFO tracking and profit margin calculation
      - Fields: invoice reference, inventory item reference, liters sold, cost price, selling price
    
    - `pricing_settings`
      - Current selling price per liter set by General Manager
      - Maintains pricing history
    
    - `notifications`
      - In-app notifications for Operations and GM when GR is generated
      - Fields: user, message, type, read status, creation date
  
  2. Security
    - Enable RLS on all tables
    - Create policies based on user roles
    - Ensure data isolation and proper access control
*/

-- Create enum types
CREATE TYPE user_role AS ENUM (
  'super_admin',
  'general_manager',
  'finance',
  'administrator',
  'operations_supervisor',
  'pump_attendant'
);

CREATE TYPE pr_status AS ENUM (
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'converted_to_po'
);

CREATE TYPE po_status AS ENUM (
  'draft',
  'sent_to_supplier',
  'paid',
  'goods_received'
);

CREATE TYPE gr_status AS ENUM (
  'received',
  'allocated_to_inventory',
  'completed'
);

CREATE TYPE vehicle_type AS ENUM (
  'bus',
  'truck',
  'car',
  'other'
);

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role user_role NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Super admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can update profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Purchase Requisitions table
CREATE TABLE IF NOT EXISTS purchase_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_number text UNIQUE NOT NULL,
  liters_requested numeric NOT NULL CHECK (liters_requested > 0),
  requisition_date date NOT NULL,
  price_per_liter numeric NOT NULL CHECK (price_per_liter > 0),
  status pr_status DEFAULT 'draft',
  notes text,
  created_by uuid REFERENCES profiles(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_requisitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view PRs"
  ON purchase_requisitions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Operations and admins can create PRs"
  ON purchase_requisitions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('operations_supervisor', 'administrator', 'super_admin')
    )
  );

CREATE POLICY "Finance and admins can update PRs"
  ON purchase_requisitions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('finance', 'administrator', 'super_admin', 'general_manager')
    )
  );

-- Purchase Orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text UNIQUE NOT NULL,
  pr_id uuid REFERENCES purchase_requisitions(id) NOT NULL,
  liters_ordered numeric NOT NULL CHECK (liters_ordered > 0),
  price_per_liter numeric NOT NULL CHECK (price_per_liter > 0),
  total_amount numeric GENERATED ALWAYS AS (liters_ordered * price_per_liter) STORED,
  supplier_name text NOT NULL,
  supplier_contact text,
  status po_status DEFAULT 'draft',
  notes text,
  created_by uuid REFERENCES profiles(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view POs"
  ON purchase_orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Finance can create POs"
  ON purchase_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('finance', 'super_admin')
    )
  );

CREATE POLICY "Finance can update POs"
  ON purchase_orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('finance', 'super_admin')
    )
  );

-- Goods Received table
CREATE TABLE IF NOT EXISTS goods_received (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gr_number text UNIQUE NOT NULL,
  po_id uuid REFERENCES purchase_orders(id) NOT NULL,
  liters_received numeric NOT NULL CHECK (liters_received > 0),
  receipt_date date NOT NULL,
  cost_per_liter numeric NOT NULL CHECK (cost_per_liter > 0),
  total_cost numeric GENERATED ALWAYS AS (liters_received * cost_per_liter) STORED,
  status gr_status DEFAULT 'received',
  notes text,
  created_by uuid REFERENCES profiles(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE goods_received ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view GRs"
  ON goods_received FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Finance can create GRs"
  ON goods_received FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('finance', 'super_admin')
    )
  );

CREATE POLICY "Operations and GM can update GRs"
  ON goods_received FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('operations_supervisor', 'general_manager', 'super_admin')
    )
  );

-- Inventory Tanks table
CREATE TABLE IF NOT EXISTS inventory_tanks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_name text UNIQUE NOT NULL CHECK (tank_name IN ('A', 'B', 'C')),
  capacity_liters numeric DEFAULT 23000 NOT NULL,
  current_liters numeric DEFAULT 0 NOT NULL CHECK (current_liters >= 0 AND current_liters <= capacity_liters),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE inventory_tanks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view tanks"
  ON inventory_tanks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Operations can update tanks"
  ON inventory_tanks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('operations_supervisor', 'general_manager', 'super_admin')
    )
  );

-- Insert the three tanks
INSERT INTO inventory_tanks (tank_name) VALUES ('A'), ('B'), ('C')
ON CONFLICT (tank_name) DO NOTHING;

-- Inventory Items table (FIFO tracking)
CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gr_id uuid REFERENCES goods_received(id) NOT NULL,
  tank_id uuid REFERENCES inventory_tanks(id) NOT NULL,
  initial_liters numeric NOT NULL CHECK (initial_liters > 0),
  remaining_liters numeric NOT NULL CHECK (remaining_liters >= 0),
  cost_per_liter numeric NOT NULL CHECK (cost_per_liter > 0),
  entry_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view inventory items"
  ON inventory_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Operations can create inventory items"
  ON inventory_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('operations_supervisor', 'general_manager', 'super_admin')
    )
  );

CREATE POLICY "System can update inventory items"
  ON inventory_items FOR UPDATE
  TO authenticated
  USING (true);

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cell_number text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view clients"
  ON clients FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Pump attendants can create clients"
  ON clients FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('pump_attendant', 'operations_supervisor', 'super_admin')
    )
  );

CREATE POLICY "Pump attendants can update clients"
  ON clients FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('pump_attendant', 'operations_supervisor', 'super_admin')
    )
  );

-- Vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  vehicle_type vehicle_type,
  make text,
  registration_number text,
  driver_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view vehicles"
  ON vehicles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Pump attendants can manage vehicles"
  ON vehicles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('pump_attendant', 'operations_supervisor', 'super_admin')
    )
  );

-- Pricing Settings table
CREATE TABLE IF NOT EXISTS pricing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_per_liter numeric NOT NULL CHECK (price_per_liter > 0),
  effective_from timestamptz DEFAULT now(),
  set_by uuid REFERENCES profiles(id) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pricing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pricing"
  ON pricing_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "General manager can create pricing"
  ON pricing_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('general_manager', 'super_admin')
    )
  );

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,
  delivery_note_number text NOT NULL,
  client_id uuid REFERENCES clients(id),
  vehicle_id uuid REFERENCES vehicles(id),
  liters_sold numeric NOT NULL CHECK (liters_sold > 0),
  tank_id uuid REFERENCES inventory_tanks(id) NOT NULL,
  selling_price_per_liter numeric NOT NULL CHECK (selling_price_per_liter > 0),
  total_amount numeric GENERATED ALWAYS AS (liters_sold * selling_price_per_liter) STORED,
  created_by uuid REFERENCES profiles(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Pump attendants can create invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('pump_attendant', 'operations_supervisor', 'super_admin')
    )
  );

-- Invoice Line Items table (FIFO tracking for sales)
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  inventory_item_id uuid REFERENCES inventory_items(id) NOT NULL,
  liters_from_item numeric NOT NULL CHECK (liters_from_item > 0),
  cost_per_liter numeric NOT NULL CHECK (cost_per_liter > 0),
  selling_price_per_liter numeric NOT NULL CHECK (selling_price_per_liter > 0),
  profit_per_liter numeric GENERATED ALWAYS AS (selling_price_per_liter - cost_per_liter) STORED,
  total_profit numeric GENERATED ALWAYS AS (liters_from_item * (selling_price_per_liter - cost_per_liter)) STORED,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view invoice line items"
  ON invoice_line_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can create invoice line items"
  ON invoice_line_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL,
  reference_id uuid,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pr_status ON purchase_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_pr_created_by ON purchase_requisitions(created_by);
CREATE INDEX IF NOT EXISTS idx_po_pr_id ON purchase_orders(pr_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_gr_po_id ON goods_received(po_id);
CREATE INDEX IF NOT EXISTS idx_gr_status ON goods_received(status);
CREATE INDEX IF NOT EXISTS idx_inventory_items_gr_id ON inventory_items(gr_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_tank_id ON inventory_items(tank_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_entry_date ON inventory_items(entry_date);
CREATE INDEX IF NOT EXISTS idx_vehicles_client_id ON vehicles(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id ON invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_inventory_item_id ON invoice_line_items(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);