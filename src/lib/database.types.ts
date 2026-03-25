export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'super_admin' | 'general_manager' | 'finance' | 'administrator' | 'operations_supervisor' | 'pump_attendant' | 'attendant';
export type PRStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'converted_to_po';
export type POStatus = 'draft' | 'sent_to_supplier' | 'paid' | 'goods_received';
export type GRStatus = 'received' | 'allocated_to_inventory' | 'completed';
export type VehicleType = 'bus' | 'truck' | 'car' | 'other';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: UserRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          role: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
      };
      purchase_requisitions: {
        Row: {
          id: string;
          pr_number: string;
          liters_requested: number;
          requisition_date: string;
          price_per_liter: number;
          status: PRStatus;
          notes: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pr_number: string;
          liters_requested: number;
          requisition_date: string;
          price_per_liter: number;
          status?: PRStatus;
          notes?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pr_number?: string;
          liters_requested?: number;
          requisition_date?: string;
          price_per_liter?: number;
          status?: PRStatus;
          notes?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      purchase_orders: {
        Row: {
          id: string;
          po_number: string;
          pr_id: string;
          liters_ordered: number;
          price_per_liter: number;
          total_amount: number;
          supplier_id: string | null;
          supplier_name: string;
          supplier_contact: string | null;
          status: POStatus;
          notes: string | null;
          proof_of_payment_url: string | null;
          payment_date: string | null;
          is_test_data: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          po_number: string;
          pr_id: string;
          liters_ordered: number;
          price_per_liter: number;
          supplier_id?: string | null;
          supplier_name: string;
          supplier_contact?: string | null;
          status?: POStatus;
          notes?: string | null;
          proof_of_payment_url?: string | null;
          payment_date?: string | null;
          is_test_data?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          po_number?: string;
          pr_id?: string;
          liters_ordered?: number;
          price_per_liter?: number;
          supplier_id?: string | null;
          supplier_name?: string;
          supplier_contact?: string | null;
          status?: POStatus;
          notes?: string | null;
          proof_of_payment_url?: string | null;
          payment_date?: string | null;
          is_test_data?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      goods_received: {
        Row: {
          id: string;
          gr_number: string;
          po_id: string;
          liters_received: number;
          receipt_date: string;
          cost_per_liter: number;
          total_cost: number;
          status: GRStatus;
          notes: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          gr_number: string;
          po_id: string;
          liters_received: number;
          receipt_date: string;
          cost_per_liter: number;
          status?: GRStatus;
          notes?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          gr_number?: string;
          po_id?: string;
          liters_received?: number;
          receipt_date?: string;
          cost_per_liter?: number;
          status?: GRStatus;
          notes?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      inventory_tanks: {
        Row: {
          id: string;
          tank_name: string;
          capacity_liters: number;
          current_liters: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tank_name: string;
          capacity_liters?: number;
          current_liters?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tank_name?: string;
          capacity_liters?: number;
          current_liters?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      inventory_items: {
        Row: {
          id: string;
          gr_id: string;
          tank_id: string;
          initial_liters: number;
          remaining_liters: number;
          cost_per_liter: number;
          entry_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          gr_id: string;
          tank_id: string;
          initial_liters: number;
          remaining_liters: number;
          cost_per_liter: number;
          entry_date?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          gr_id?: string;
          tank_id?: string;
          initial_liters?: number;
          remaining_liters?: number;
          cost_per_liter?: number;
          entry_date?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      clients: {
        Row: {
          id: string;
          name: string;
          cell_number: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          cell_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          cell_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      vehicles: {
        Row: {
          id: string;
          client_id: string;
          vehicle_type: VehicleType | null;
          make: string | null;
          registration_number: string | null;
          driver_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          vehicle_type?: VehicleType | null;
          make?: string | null;
          registration_number?: string | null;
          driver_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          vehicle_type?: VehicleType | null;
          make?: string | null;
          registration_number?: string | null;
          driver_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      pricing_settings: {
        Row: {
          id: string;
          price_per_liter: number;
          effective_from: string;
          set_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          price_per_liter: number;
          effective_from?: string;
          set_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          price_per_liter?: number;
          effective_from?: string;
          set_by?: string;
          created_at?: string;
        };
      };
      invoices: {
        Row: {
          id: string;
          invoice_number: string;
          delivery_note_number: string;
          client_id: string | null;
          vehicle_id: string | null;
          liters_sold: number;
          tank_id: string;
          selling_price_per_liter: number;
          total_amount: number;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          invoice_number: string;
          delivery_note_number: string;
          client_id?: string | null;
          vehicle_id?: string | null;
          liters_sold: number;
          tank_id: string;
          selling_price_per_liter: number;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          invoice_number?: string;
          delivery_note_number?: string;
          client_id?: string | null;
          vehicle_id?: string | null;
          liters_sold?: number;
          tank_id?: string;
          selling_price_per_liter?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      invoice_line_items: {
        Row: {
          id: string;
          invoice_id: string;
          inventory_item_id: string;
          liters_from_item: number;
          cost_per_liter: number;
          selling_price_per_liter: number;
          profit_per_liter: number;
          total_profit: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          inventory_item_id: string;
          liters_from_item: number;
          cost_per_liter: number;
          selling_price_per_liter: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          inventory_item_id?: string;
          liters_from_item?: number;
          cost_per_liter?: number;
          selling_price_per_liter?: number;
          created_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          message: string;
          type: string;
          reference_id: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          message: string;
          type: string;
          reference_id?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          message?: string;
          type?: string;
          reference_id?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
      };
      suppliers: {
        Row: {
          id: string;
          name: string;
          contact: string | null;
          email: string | null;
          address: string | null;
          is_test_data: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          contact?: string | null;
          email?: string | null;
          address?: string | null;
          is_test_data?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          contact?: string | null;
          email?: string | null;
          address?: string | null;
          is_test_data?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      delivery_notes: {
        Row: {
          id: string;
          note_number: string;
          client_id: string | null;
          customer_name: string;
          vehicle_registration: string;
          driver_name: string;
          meter_reading_a: number;
          meter_reading_b: number;
          litres_dispensed: number;
          litres_reading: number;
          meter_photo_url: string | null;
          attendant_id: string;
          attendant_name: string;
          invoice_id: string | null;
          has_invoice: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          note_number: string;
          client_id?: string | null;
          customer_name: string;
          vehicle_registration: string;
          driver_name: string;
          meter_reading_a: number;
          meter_reading_b: number;
          litres_dispensed: number;
          litres_reading: number;
          meter_photo_url?: string | null;
          attendant_id: string;
          attendant_name: string;
          invoice_id?: string | null;
          has_invoice?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          note_number?: string;
          client_id?: string | null;
          customer_name?: string;
          vehicle_registration?: string;
          driver_name?: string;
          meter_reading_a?: number;
          meter_reading_b?: number;
          litres_dispensed?: number;
          litres_reading?: number;
          meter_photo_url?: string | null;
          attendant_id?: string;
          attendant_name?: string;
          invoice_id?: string | null;
          has_invoice?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}
