export type KycType = "individual" | "business";
export type KycStatus = "not_started" | "pending" | "approved" | "rejected";
export type KycTier = "individual_tier_1" | "individual_tier_2" | "individual_tier_3" | "business";
export type Currency = "USD" | "NGN" | "CNY" | "USDT" | "GHS" | "KES";
export type DocumentStatus = "pending" | "approved" | "rejected";
export type PayoutMethod = "alipay" | "wechat" | "bank";
// Free-form ISO 3166-1 alpha-2 code, not a fixed enum — see migration 0020. Only NG/GH/KE get a
// local-currency wallet auto-provisioned; every other value is still stored as-is.
export type CountryCode = string;

export type TransactionType = "rmb_manual" | "rmb_auto" | "usdt_ngn" | "withdrawal";
export type TransactionProvider = "klasha" | "busha" | "quidax" | "manual";
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
  kyc_rejection_reason: string | null;
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
  rejection_reason: string | null;
  provider_reference: string | null;
  raw_target_amount: number | null;
  requires_extra_verification: boolean;
  extra_verification_confirmed_at: string | null;
  extra_verification_confirmed_by: string | null;
  automated_payout_attempt_failed_reason: string | null;
  automated_payout_retry_count: number;
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
  recipient_first_name: string | null;
  recipient_last_name: string | null;
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
  recipient_first_name: string | null;
  recipient_last_name: string | null;
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
  confirmed_amount: number | null;
  status: TransactionStatus;
  provider: TransactionProvider;
  provider_reference: string | null;
  created_at: string;
};

export type CnyTierRate = {
  tier_min_cny: number;
  tier_max_cny: number;
  usdt_to_cny_rate: number;
  updated_at: string;
};

export type CnyMarkupRate = {
  id: boolean;
  fiat_markup_rate: number;
  usdt_markup_rate: number;
  updated_at: string;
};

export type SupplierRate = {
  id: string;
  base_currency: Currency;
  quote_currency: Currency;
  buy_rate: number;
  effective_from: string;
  set_by: string;
  created_at: string;
};

export type CnyConversionDirection = "to_cny" | "from_cny";

export type CnyConversion = {
  id: string;
  user_id: string;
  direction: CnyConversionDirection;
  from_currency: Currency;
  from_amount: number;
  to_currency: Currency;
  to_amount: number;
  busha_rate: number | null;
  tier_rate: number;
  margin_rate: number;
  created_at: string;
};

export type WithdrawalRecipient = {
  user_id: string;
  currency: Currency;
  account_holder_name: string;
  bank_account_number: string | null;
  bank_name: string | null;
  wallet_address: string | null;
  bank_code: string | null;
  network: string | null;
  busha_recipient_id: string | null;
  pending_change_requested_at: string | null;
  recipient_changed_at: string | null;
  recipient_changed_by: string | null;
  created_at: string;
};

// pin_hash is never selected back to the client (the app only ever checks row *existence* to
// decide what to render in Settings) — it's typed here for completeness of the Row shape.
export type WithdrawalPin = {
  user_id: string;
  pin_hash: string;
  created_at: string;
  updated_at: string;
};

export type AdminRole = "super_admin" | "admin";

// id doubles as the primary key and the FK to profiles — one row per admin, keyed by their own
// user id (migration 0038).
export type AdminUser = {
  id: string;
  role: AdminRole;
  created_at: string;
};

export type AdminLoginEvent = "sign_in" | "sign_out";

export type AdminLoginLog = {
  id: string;
  admin_user_id: string;
  event: AdminLoginEvent;
  created_at: string;
};

export type SupportMessageSender = "user" | "admin";

export type SupportMessage = {
  id: string;
  user_id: string;
  sender: SupportMessageSender;
  body: string;
  read_at: string | null;
  created_at: string;
};

// user_id null = broadcast to every user; a real id = targeted at just that user. See migration
// 0037's header comment for the known shared-read-state tradeoff on broadcast rows.
export type Notification = {
  id: string;
  user_id: string | null;
  title: string;
  body: string;
  read_at: string | null;
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
      cny_tier_rates: {
        Row: CnyTierRate;
        Insert: Partial<CnyTierRate> & Pick<CnyTierRate, "tier_min_cny" | "tier_max_cny" | "usdt_to_cny_rate">;
        Update: Partial<CnyTierRate>;
        Relationships: [];
      };
      cny_markup_rate: {
        Row: CnyMarkupRate;
        Insert: Partial<CnyMarkupRate> & Pick<CnyMarkupRate, "fiat_markup_rate" | "usdt_markup_rate">;
        Update: Partial<CnyMarkupRate>;
        Relationships: [];
      };
      supplier_rates: {
        Row: SupplierRate;
        Insert: Partial<SupplierRate> & Pick<SupplierRate, "base_currency" | "quote_currency" | "buy_rate" | "set_by">;
        Update: Partial<SupplierRate>;
        Relationships: [];
      };
      cny_conversions: {
        Row: CnyConversion;
        Insert: Partial<CnyConversion> &
          Pick<CnyConversion, "user_id" | "direction" | "from_currency" | "from_amount" | "to_currency" | "to_amount" | "tier_rate" | "margin_rate">;
        Update: Partial<CnyConversion>;
        Relationships: [];
      };
      saved_rmb_recipients: {
        Row: SavedRmbRecipient;
        Insert: Partial<SavedRmbRecipient> & Pick<SavedRmbRecipient, "user_id" | "label" | "payout_method">;
        Update: Partial<SavedRmbRecipient>;
        Relationships: [];
      };
      withdrawal_recipients: {
        Row: WithdrawalRecipient;
        Insert: Partial<WithdrawalRecipient> &
          Pick<WithdrawalRecipient, "user_id" | "currency" | "account_holder_name">;
        Update: Partial<WithdrawalRecipient>;
        Relationships: [];
      };
      withdrawal_pins: {
        Row: WithdrawalPin;
        Insert: Partial<WithdrawalPin> & Pick<WithdrawalPin, "user_id" | "pin_hash">;
        Update: Partial<WithdrawalPin>;
        Relationships: [];
      };
      notifications: {
        Row: Notification;
        Insert: Partial<Notification> & Pick<Notification, "title" | "body">;
        Update: Partial<Notification>;
        Relationships: [];
      };
      admin_users: {
        Row: AdminUser;
        Insert: Partial<AdminUser> & Pick<AdminUser, "id" | "role">;
        Update: Partial<AdminUser>;
        Relationships: [];
      };
      admin_login_log: {
        Row: AdminLoginLog;
        Insert: Partial<AdminLoginLog> & Pick<AdminLoginLog, "admin_user_id" | "event">;
        Update: Partial<AdminLoginLog>;
        Relationships: [];
      };
      support_messages: {
        Row: SupportMessage;
        Insert: Partial<SupportMessage> & Pick<SupportMessage, "user_id" | "sender" | "body">;
        Update: Partial<SupportMessage>;
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
        Args: { p_transaction_id: string; p_reason: string };
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
          p_raw_target_amount: number | null;
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
        Args: { p_deposit_id: string; p_actual_amount: number | null };
        Returns: undefined;
      };
      fail_deposit: {
        Args: { p_deposit_id: string };
        Returns: undefined;
      };
      admin_approve_kyc: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      admin_reject_kyc: {
        Args: { p_user_id: string; p_reason: string };
        Returns: undefined;
      };
      record_cny_conversion: {
        Args: {
          p_direction: string;
          p_from_currency: Currency;
          p_from_amount: number;
          p_to_currency: Currency;
          p_to_amount: number;
          p_busha_rate: number | null;
          p_tier_rate: number;
          p_margin_rate: number;
        };
        Returns: string;
      };
      admin_set_cny_tier_rate: {
        Args: { p_tier_min: number; p_cny_rate: number };
        Returns: undefined;
      };
      admin_set_cny_markup_rate: {
        Args: { p_fiat_markup_rate: number; p_usdt_markup_rate: number };
        Returns: undefined;
      };
      admin_set_supplier_rate: {
        Args: {
          p_base_currency: Currency;
          p_quote_currency: Currency;
          p_buy_rate: number;
          p_effective_from: string;
          p_set_by: string;
        };
        Returns: undefined;
      };
      set_withdrawal_recipient: {
        Args: {
          p_currency: Currency;
          p_account_holder_name: string;
          p_bank_account_number: string | null;
          p_bank_name: string | null;
          p_wallet_address: string | null;
          p_bank_code: string | null;
          p_network: string | null;
        };
        Returns: undefined;
      };
      create_withdrawal_request: {
        Args: { p_currency: Currency; p_amount: number; p_pin: string };
        Returns: string;
      };
      set_withdrawal_pin: {
        Args: { p_pin: string };
        Returns: undefined;
      };
      admin_complete_withdrawal: {
        Args: { p_transaction_id: string };
        Returns: undefined;
      };
      admin_reject_withdrawal: {
        Args: { p_transaction_id: string };
        Returns: undefined;
      };
      complete_withdrawal_payout: {
        Args: { p_transaction_id: string };
        Returns: undefined;
      };
      fail_withdrawal_payout: {
        Args: { p_transaction_id: string };
        Returns: undefined;
      };
      mark_withdrawal_processing: {
        Args: { p_transaction_id: string; p_provider_reference: string };
        Returns: undefined;
      };
      flag_withdrawal_for_verification: {
        Args: { p_transaction_id: string };
        Returns: undefined;
      };
      admin_confirm_withdrawal_verification: {
        Args: { p_transaction_id: string; p_admin_id: string };
        Returns: undefined;
      };
      record_automated_payout_failure: {
        Args: { p_transaction_id: string; p_reason: string };
        Returns: undefined;
      };
      request_recipient_change: {
        Args: { p_currency: Currency };
        Returns: undefined;
      };
      confirm_recipient_change: {
        Args: {
          p_currency: Currency;
          p_account_holder_name: string;
          p_bank_account_number: string | null;
          p_bank_name: string | null;
          p_wallet_address: string | null;
          p_bank_code: string | null;
          p_network: string | null;
        };
        Returns: undefined;
      };
      change_withdrawal_pin: {
        Args: { p_pin: string };
        Returns: undefined;
      };
    };
  };
};
