export interface Doctor {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string;
  email: string;
}

export interface Consultation {
  id: string;
  doctorId: string;
  date: string; // ISO Date
  patientName: string;
  insurance: string;
  isReconciled: boolean;
  liquidationId?: string;
  amount?: number; // Might be unknown until liquidation, or estimated
}

export interface Liquidation {
  id: string;
  doctorId: string;
  datePerformed: string; // The date the medical service happened
  importDate: string; // When this file was uploaded (proxy for payment date if not in file)
  patientName: string;
  insurance: string;
  netAmount: number;
  isMatched: boolean;
  consultationId?: string;
}

export interface ReconciliationStats {
  insurance: string;
  totalAmount: number;
  count: number;
  avgDelayDays: number;
}

export type TabView = 'doctors' | 'consultations' | 'liquidations' | 'dashboard' | 'reports' | 'checks';