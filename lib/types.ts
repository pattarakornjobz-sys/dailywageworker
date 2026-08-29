export type PayrollStatus =
  | "draft"
  | "employee_acknowledged"
  | "agency_approved"
  | "submitted_to_central"
  | "rejected"
  | "central_approved"
  | "finance_received"
  | "transferring"
  | "bank_file_generated"
  | "paid";

export type Role =
  | "agency_clerk"
  | "agency_head"
  | "central_reviewer"
  | "finance_officer"
  | "admin";

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  agency_id: string | null;
}

export interface Agency {
  id: string;
  name: string;
  code: string;
}

export interface Employee {
  id: string;
  agency_id: string;
  prefix: string;
  first_name: string;
  last_name: string;
  daily_rate: number;
  fingerprint_no: string;
  bank_account_no: string | null;
  bank_name: string | null;
  bank_branch: string | null;
}

export interface PayrollPeriod {
  id: string;
  agency_id: string;
  period_start: string; // YYYY-MM-DD
  period_end: string;
}

export interface PayrollBatch {
  id: string;
  period_id: string;
  status: PayrollStatus;
  review_note: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollDetail {
  id: string;
  period_id: string;
  employee_id: string;
  days_full: number;
  days_half: number;
  daily_rate: number;
  total_amount: number;
  employee_ack_at: string | null;
}

export interface BankCompanyCode {
  code: string;
  name: string;
  is_active: boolean;
}

export interface BankTransferBatch {
  id: string;
  transfer_date: string;
  total_amount: number;
  total_count: number;
  check_no: string | null;
  company_code: string | null;
  company_name: string | null;
  file_url: string | null;
  generated_at: string;
}

export interface BankTransferItem {
  id: string;
  transfer_batch_id: string;
  employee_id: string;
  bank_name: string;
  bank_branch: string | null;
  account_no: string;
  account_name: string;
  amount: number;
  ref_no: string;
}

// แถวรวมที่ query จริงจะ join มาใช้แสดงผล (ไม่ใช่ตารางจริงในฐานข้อมูล)
export interface BatchWithContext extends PayrollBatch {
  period: PayrollPeriod & { agency: Agency };
}

export interface DetailWithEmployee extends PayrollDetail {
  employee: Employee;
}
