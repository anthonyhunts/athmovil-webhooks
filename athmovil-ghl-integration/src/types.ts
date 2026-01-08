// ===========================================
// GO HIGH LEVEL TYPES
// ===========================================

export interface GHLTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  locationId: string;
  companyId: string;
  userId?: string;
}

export interface GHLLocation {
  id: string;
  name: string;
  companyId: string;
}

// Payload que GHL envia al paymentsUrl via postMessage
export interface GHLPaymentInitiateProps {
  publishableKey: string;
  amount: number;
  currency: string;
  mode: 'test' | 'live';
  productDetails?: {
    name: string;
    description?: string;
    image?: string;
  };
  contact?: {
    id: string;
    name: string;
    email: string;
    phone: string;
  };
  orderId?: string;
  transactionId: string;
  subscriptionId?: string;
  locationId: string;
  liveMode: boolean;
}

// QueryUrl request types
export interface GHLQueryRequest {
  type: 'verify' | 'refund' | 'list_payment_methods' | 'charge_payment' | 'create_subscription';
  locationId: string;
  apiKey: string;
  transactionId?: string;
  chargeId?: string;
  subscriptionId?: string;
  amount?: number;
  currency?: string;
  contactId?: string;
  paymentMethodId?: string;
  chargeDescription?: string;
}

export interface GHLVerifyResponse {
  success: boolean;
  chargeId: string;
  message?: string;
  chargeSnapshot?: {
    id: string;
    status: string;
    amount: number;
    chargeId: string;
    chargedAt: string;
  };
}

// ===========================================
// ATH MOVIL TYPES
// ===========================================

export interface ATHMovilPaymentRequest {
  publicToken: string;
  timeout?: number;
  total: number;
  tax?: number;
  subtotal?: number;
  metadata1?: string;
  metadata2?: string;
  items?: ATHMovilItem[];
  phoneNumber?: string;
}

export interface ATHMovilItem {
  name: string;
  description?: string;
  quantity: number;
  price: number;
  tax?: number;
  metadata?: string;
}

export interface ATHMovilPaymentResponse {
  status: string;
  data: {
    ecommerceId: string;
    auth_token: string;
    expiresIn?: number;
  };
}

export interface ATHMovilFindPaymentRequest {
  publicToken: string;
  ecommerceId: string;
}

export interface ATHMovilFindPaymentResponse {
  status: string;
  data: {
    ecommerceId: string;
    transactionType: string;
    status: 'OPEN' | 'CONFIRM' | 'COMPLETED' | 'CANCEL' | 'EXPIRED';
    referenceNumber?: string;
    dailyTransactionId?: string;
    name?: string;
    phoneNumber?: string;
    email?: string;
    total: number;
    tax?: number;
    subtotal?: number;
    fee?: number;
    netAmount?: number;
    metadata1?: string;
    metadata2?: string;
    date?: string;
  };
}

// Webhook payload from ATH Movil
export interface ATHMovilWebhookPayload {
  transactionType: 'ecommerce' | 'payment' | 'donation' | 'refund' | 'simulated';
  status: 'completed' | 'COMPLETED' | 'CANCEL' | 'cancelled' | 'expired';
  date: string;
  referenceNumber: string;
  dailyTransactionID?: string;
  dailyTransactionId?: string;
  ecommerceId?: string;
  name: string;
  phoneNumber: string;
  email: string;
  message?: string;
  total: string | number;
  tax: string | number;
  subtotal?: string | number;
  subTotal?: string | number;
  fee: string | number;
  netAmount: string | number;
  totalRefundedAmount?: string | number;
  metadata1?: string;
  metadata2?: string;
  items?: ATHMovilItem[];
}

// ===========================================
// INTERNAL TYPES
// ===========================================

export interface StoredTransaction {
  id: string;
  ghlTransactionId: string;
  ghlLocationId: string;
  athmovilEcommerceId: string;
  athmovilAuthToken: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed' | 'cancelled' | 'expired' | 'refunded';
  referenceNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredLocation {
  locationId: string;
  companyId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  athmovilPublicToken?: string;
  athmovilPrivateToken?: string;
  installedAt: Date;
}

// In-memory storage (replace with database in production)
export interface AppStorage {
  locations: Map<string, StoredLocation>;
  transactions: Map<string, StoredTransaction>;
}
