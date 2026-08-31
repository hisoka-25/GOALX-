// Types pour l'API Jèko (partner_api).
// Encaissement (pay-in) et reversement (pay-out / transferts).

export type JekoPaymentMethod =
  | "wave"
  | "orange"
  | "mtn"
  | "moov"
  | "djamo"
  | "bank";

export interface JekoMoneyModel {
  amount: number;
  currency: string;
}

// Requête de création d'un paiement (pay-in / checkout redirigé).
export interface JekoPaymentRequest {
  amountCents: number;
  currency?: string;
  reference: string;
  description?: string;
  paymentMethod?: JekoPaymentMethod;
  successUrl: string;
  errorUrl: string;
  customerPhone?: string;
  customerName?: string;
  customerEmail?: string;
}

export interface JekoPayment {
  id: string;
  storeId: string;
  reference: string;
  type: string;
  paymentMethod?: string;
  status: string; // pending | success | error
  redirectUrl: string;
  errorReason?: string | null;
}

// Contact bénéficiaire pour les transferts (pay-out).
export interface JekoContact {
  contactId?: string;
  id?: string;
  name: string;
  phone: string; // numéro international
  paymentMethod: JekoPaymentMethod;
}

// Requête de transfert (pay-out vers un contact).
export interface JekoTransferRequest {
  contactId: string;
  amountCents: number;
  currency?: string;
  reference: string;
  narration?: string;
}

export interface JekoTransfer {
  id?: string;
  reference?: string;
  status: string;
  errorReason?: string | null;
  contactId?: string;
}

// Payload du webhook Jèko (TRANSACTION_COMPLETED).
export interface JekoWebhookTransaction {
  id: string;
  amount?: { amount: number; currency: string };
  fees?: { amount: number; currency: string };
  status: "success" | "error" | "pending" | string;
  counterpartLabel?: string;
  counterpartIdentifier?: string;
  paymentMethod?: string;
  transactionType?: string;
  businessName?: string;
  storeName?: string;
  description?: string;
  executedAt?: string;
  transactionDetails?: {
    id?: string;
    reference?: string;
    paymentLinkId?: string;
  };
}
