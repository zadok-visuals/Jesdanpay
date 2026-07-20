export type KycType = "individual" | "business";
export type KycStatus = "not_started" | "pending" | "approved" | "rejected";
export type KycTier = "individual_tier_1" | "individual_tier_2" | "individual_tier_3" | "business";
export type Currency = "USD" | "NGN";
export type DocumentStatus = "pending" | "approved" | "rejected";

export type TransactionType = "rmb_manual" | "rmb_auto" | "usdt_ngn";
export type TransactionProvider = "klasha" | "busha";
export type TransactionStatus = "pending" | "processing" | "completed" | "failed";

// NOTE: these row shapes must stay `type` aliases, not `interface` — this
// version of @supabase/postgrest-js's select-query type parser silently
// resolves query results to `never` when a Row type is declared as an
// interface instead of a plain object type.
export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  business_name: string | null;
  kyc_type: KycType | null;
  kyc_status: KycStatus;
  created_at: string;
};

export type Wallet = {
  user_id: string;
  currency: Currency;
  balance: number;
  updated_at: string;
};

export type KycDocument = {
  id: string;
  user_id: string;
  tier: KycTier;
  document_type: string;
  file_ref: string | null;
  value: string | null;
  status: DocumentStatus;
  created_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  type: TransactionType;
  provider: TransactionProvider;
  status: TransactionStatus;
  amount: number;
  currency: Currency;
  provider_reference: string | null;
  created_at: string;
};

export type WebhookEvent = {
  id: string;
  provider: TransactionProvider;
  event_type: string;
  payload: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13";
  };
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & Pick<Profile, "id" | "email">;
        Update: Partial<Profile>;
        Relationships: [];
      };
      wallets: {
        Row: Wallet;
        Insert: Partial<Wallet> & Pick<Wallet, "user_id" | "currency">;
        Update: Partial<Wallet>;
        Relationships: [];
      };
      kyc_documents: {
        Row: KycDocument;
        Insert: Partial<KycDocument> & Pick<KycDocument, "user_id" | "tier" | "document_type">;
        Update: Partial<KycDocument>;
        Relationships: [];
      };
      transactions: {
        Row: Transaction;
        Insert: Partial<Transaction> &
          Pick<Transaction, "user_id" | "type" | "provider" | "amount" | "currency">;
        Update: Partial<Transaction>;
        Relationships: [];
      };
      webhook_events: {
        Row: WebhookEvent;
        Insert: Partial<WebhookEvent> & Pick<WebhookEvent, "provider" | "event_type" | "payload">;
        Update: Partial<WebhookEvent>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
