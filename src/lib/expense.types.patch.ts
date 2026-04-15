// ─── EXPENSE MANAGEMENT TYPES ────────────────────────────────────────────────
// Add these to src/lib/database.types.ts
//
// 1. Add to the top-level type aliases (alongside PRStatus, POStatus etc.):
//
//   export type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
//
// 2. Add to the Database['public']['Tables'] object:

/*
  expense_categories: {
    Row: {
      id: string;
      name: string;
      description: string | null;
      is_active: boolean;
      sort_order: number;
      created_by: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      name: string;
      description?: string | null;
      is_active?: boolean;
      sort_order?: number;
      created_by?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      name?: string;
      description?: string | null;
      is_active?: boolean;
      sort_order?: number;
      created_by?: string | null;
      updated_at?: string;
    };
  };
  expenses: {
    Row: {
      id: string;
      expense_number: string;
      title: string;
      description: string | null;
      amount: number;
      category_id: string;
      receipt_url: string | null;
      expense_date: string;
      submitted_by: string;
      status: ExpenseStatus;
      approved_by: string | null;
      approved_at: string | null;
      rejection_reason: string | null;
      notes: string | null;
      is_test_data: boolean;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      expense_number: string;
      title: string;
      description?: string | null;
      amount: number;
      category_id: string;
      receipt_url?: string | null;
      expense_date: string;
      submitted_by: string;
      status?: ExpenseStatus;
      approved_by?: string | null;
      approved_at?: string | null;
      rejection_reason?: string | null;
      notes?: string | null;
      is_test_data?: boolean;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      expense_number?: string;
      title?: string;
      description?: string | null;
      amount?: number;
      category_id?: string;
      receipt_url?: string | null;
      expense_date?: string;
      submitted_by?: string;
      status?: ExpenseStatus;
      approved_by?: string | null;
      approved_at?: string | null;
      rejection_reason?: string | null;
      notes?: string | null;
      is_test_data?: boolean;
      updated_at?: string;
    };
  };
*/
