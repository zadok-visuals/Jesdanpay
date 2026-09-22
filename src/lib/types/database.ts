export type KycType = "individual" | "business";
export type KycStatus = "not_started" | "pending" | "approved" | "rejected";
export type KycTier = "individual_tier_1" | "individual_tier_2" | "individual_tier_3" | "business";
export type Currency = "USD" | "NGN" | "CNY" | "USDT" | "GHS" | "KES";
export type DocumentStatus = "pending" | "approved" | "rejected";
export type PayoutMethod = "alipay" | "wechat" | "bank";
export type CountryCode = "NG" | "GH" | "KE";

export type TransactionType = "rmb_manual" | "rmb_auto" | "usdt_ngn";
export type TransactionProvider = "klasha" | "busha" | "quidax";
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
  country: CountryCode | null;
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
  target_currency: Currency | null;
  target_amount: number | null;
  actual_target_amount: number | null;
  actual_rate_note: string | null;
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

export type RmbRecipient = {
  id: string;
  transaction_id: string | null;
  user_id: string;
  payout_method: PayoutMethod;
  recipient_alipay_id: string | null;
  recipient_wechat_id: string | null;
  recipient_bank_account_number: string | null;
  recipient_bank_name: string | null;
  recipient_account_holder_name: string | null;
  qr_code_ref: string | null;
  created_at: string;
};

export type SavedRmbRecipient = {
  id: string;
  user_id: string;
  label: string;
  payout_method: PayoutMethod;
  recipient_alipay_id: string | null;
  recipient_wechat_id: string | null;
  recipient_bank_account_number: string | null;
  recipient_bank_name: string | null;
  recipient_account_holder_name: string | null;
  qr_code_ref: string | null;
  created_at: string;
};

export type Deposit = {
  id: string;
  user_id: string;
  currency: Currency;
  amount: number;
  status: TransactionStatus;
  provider: TransactionProvider;
  provider_reference: string | null;
  created_at: string;
};

export type AdminFxRate = {
  source_currency: Currency;
  cny_rate: number | null;
  updated_at: string;
};

export type CnyConversion = {
  id: string;
  user_id: string;
  source_currency: Currency;
  source_amount: number;
  published_rate: number;
  margin_rate: number;
  locked_rate: number;
  locked_cny_amount: number;
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
      rmb_recipients: {
        Row: RmbRecipient;
        Insert: Partial<RmbRecipient> &
          Pick<RmbRecipient, "user_id" | "payout_method">;
        Update: Partial<RmbRecipient>;
        Relationships: [];
      };
      deposits: {
        Row: Deposit;
        Insert: Partial<Deposit> & Pick<Deposit, "user_id" | "currency" | "amount" | "provider">;
        Update: Partial<Deposit>;
        Relationships: [];
      };
      admin_fx_rates: {
        Row: AdminFxRate;
        Insert: Partial<AdminFxRate> & Pick<AdminFxRate, "source_currency">;
        Update: Partial<AdminFxRate>;
        Relationships: [];
      };
      cny_conversions: {
        Row: CnyConversion;
        Insert: Partial<CnyConversion> &
          Pick<CnyConversion, "user_id" | "source_currency" | "source_amount" | "published_rate" | "margin_rate" | "locked_rate" | "locked_cny_amount">;
        Update: Partial<CnyConversion>;
        Relationships: [];
      };
      saved_rmb_recipients: {
        Row: SavedRmbRecipient;
        Insert: Partial<SavedRmbRecipient> & Pick<SavedRmbRecipient, "user_id" | "label" | "payout_method">;
        Update: Partial<SavedRmbRecipient>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_rmb_manual_transaction: {
        Args: { p_recipient_id: string; p_currency: Currency; p_amount: number };
        Returns: string;
      };
      admin_reject_rmb_transaction: {
        Args: { p_transaction_id: string };
        Returns: undefined;
      };
      admin_complete_rmb_transaction: {
        Args: { p_transaction_id: string; p_actual_target_amount: number; p_note: string };
        Returns: undefined;
      };
      set_transaction_provider_reference: {
        Args: { p_transaction_id: string; p_provider_reference: string };
        Returns: undefined;
      };
      create_busha_swap_transaction: {
        Args: {
          p_source_currency: Currency;
          p_target_currency: Currency;
          p_source_amount: number;
          p_target_amount: number;
          p_provider_reference: string;
        };
        Returns: string;
      };
      complete_busha_swap_transaction: {
        Args: { p_transaction_id: string };
        Returns: undefined;
      };
      fail_busha_swap_transaction: {
        Args: { p_transaction_id: string };
        Returns: undefined;
      };
      credit_deposit: {
        Args: { p_deposit_id: string };
        Returns: undefined;
      };
      admin_approve_kyc: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      admin_reject_kyc: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      convert_to_cny_locked: {
        Args: { p_source_currency: Currency; p_source_amount: number };
        Returns: string;
      };
      admin_set_fx_rate: {
        Args: { p_source_currency: Currency; p_cny_rate: number };
        Returns: undefined;
      };
    };
  };
};
