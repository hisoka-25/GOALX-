// =========================================================
// GOALX — Types partagés pour l'intégration GeniusPay
// Côté serveur et client. Aucune clé secrète ici.
// =========================================================

// Statuts GeniusPay : pending | processing | completed | failed
// | cancelled | expired
export type GeniusPayStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

// Moyens de paiement acceptés par GeniusPay.
export type GeniusPayMethod =
  | "wave"
  | "orange_money"
  | "mtn_money"
  | "moov_money"
  | "pawapay"
  | "paystack"
  | "airtel_money"
  | "card";

export type GeniusPayCustomer = {
  name?: string;
  email?: string;
  phone?: string;
  country?: string;
};

export type CreatePaymentInput = {
  amount: number;
  currency?: "XOF" | "EUR" | "USD";
  description?: string;
  customer?: GeniusPayCustomer;
  // Omission de payment_method => page de checkout hébergée.
  payment_method?: GeniusPayMethod;
  success_url?: string;
  error_url?: string;
  metadata?: Record<string, string | number>;
};

export type GeniusPayPayment = {
  id: number;
  reference: string;
  amount: number;
  currency: string;
  fees?: number;
  net_amount?: number;
  status: GeniusPayStatus;
  payment_method?: string | null;
  payment_provider?: string | null;
  gateway?: string;
  checkout_url?: string;
  payment_url?: string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  metadata?: Record<string, unknown>;
  environment?: "sandbox" | "live";
  created_at?: string;
  completed_at?: string | null;
  expires_at?: string;
};

export type GeniusPayApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
};

// Payload reçu sur le webhook GeniusPay.
export type GeniusPayWebhookEvent = {
  id: string;
  event:
    | "payment.initiated"
    | "payment.success"
    | "payment.failed"
    | "payment.cancelled"
    | "payment.refunded"
    | "payment.expired"
    | "cashout.requested"
    | "cashout.approved"
    | "cashout.completed"
    | "cashout.failed"
    | "webhook.test"
    | string;
  timestamp: number;
  created_at: string;
  data: {
    object?: string;
    id?: number;
    reference?: string;
    amount?: number;
    currency?: string;
    fees?: number;
    net_amount?: number;
    status?: string;
    payment_method?: string;
    provider?: string;
    customer_name?: string;
    customer_phone?: string;
    merchant_id?: number;
    metadata?: Record<string, unknown>;
  };
  environment?: "sandbox" | "live";
  api_version?: string;
};

// Portefeuille marchand GeniusPay (source des payouts).
export type GeniusPayWallet = {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance?: number;
  available_balance?: number;
  status?: string;
};

export type CreatePayoutInput = {
  amount: number;
  wallet_id: string;
  recipient: {
    name: string;
    phone?: string;
  };
  destination: {
    type: "mobile_money" | "bank";
    account: string; // numéro Mobile Money du destinataire
    provider: string; // ex : "wave"
  };
  description?: string;
  metadata?: Record<string, string | number>;
};

export type GeniusPayPayout = {
  id?: number | string;
  reference?: string;
  amount?: number;
  currency?: string;
  fees?: number;
  status?: string;
  provider?: string;
  [key: string]: unknown;
};

// Statuts Goalx d'une recharge (voir supabase/payments.sql).
export type DepositStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";
