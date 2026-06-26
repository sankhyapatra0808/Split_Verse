import { createContext, useContext } from "react";

export type CurrencyCode =
  | "INR"
  | "USD"
  | "CAD"
  | "EUR"
  | "GBP"
  | "JPY"
  | "AED"
  | "AUD"
  | "SGD"
  | "CHF"
  | "CNY";
export type AppLanguageCode =
  | "en"
  | "hi"
  | "bn"
  | "fr"
  | "es"
  | "de"
  | "ar"
  | "ja"
  | "zh"
  | "pt";
export type AvatarId = "current" | "initials";
export type WalletTopUpMethod = "UPI" | "Card" | "Net banking";
export type ExchangeRatesSource = "live" | "cache" | "stale-cache" | "fallback";

export type CurrencyOption = {
  code: CurrencyCode;
  label: string;
  symbol: string;
  rateFromInr: number;
  countryHint: string;
};

export type LanguageOption = {
  code: AppLanguageCode;
  label: string;
  nativeLabel: string;
  locale: string;
};

export type NotificationPreferences = {
  friendRequestEmails: boolean;
  loginOtpEmails: boolean;
  settlementReminderEmails: boolean;
  roomDueNotifications: boolean;
};

export type CurrencyFormatOptions = {
  signed?: boolean;
  compact?: boolean;
};

export type AppSettingsValue = {
  avatarId: AvatarId;
  compactMode: boolean;
  privacyMode: boolean;
  settlementReminders: boolean;
  appCurrency: CurrencyCode;
  detectedCurrency: CurrencyCode;
  appLanguage: AppLanguageCode;
  converterFrom: CurrencyCode;
  converterTo: CurrencyCode;
  converterAmount: number;
  defaultTopUpMethod: WalletTopUpMethod;
  confirmBeforeWalletPayment: boolean;
  notificationPreferences: NotificationPreferences;
  exchangeRates: Record<CurrencyCode, number>;
  exchangeRatesSource: ExchangeRatesSource;
  exchangeRatesFetchedAt: string | null;
  exchangeRatesExpiresAt: string | null;
  exchangeRatesLoading: boolean;
  exchangeRatesError: string;
  currencies: CurrencyOption[];
  languages: LanguageOption[];
  setAvatarId: (avatarId: AvatarId) => void;
  setCompactMode: (enabled: boolean) => void;
  setPrivacyMode: (enabled: boolean) => void;
  setSettlementReminders: (enabled: boolean) => void;
  setAppCurrency: (currency: CurrencyCode) => void;
  setAppLanguage: (language: AppLanguageCode) => void;
  setConverterFrom: (currency: CurrencyCode) => void;
  setConverterTo: (currency: CurrencyCode) => void;
  setConverterAmount: (amount: number) => void;
  setDefaultTopUpMethod: (method: WalletTopUpMethod) => void;
  setConfirmBeforeWalletPayment: (enabled: boolean) => void;
  setNotificationPreference: (
    key: keyof NotificationPreferences,
    enabled: boolean,
  ) => void;
  clearLocalAppSettings: () => void;
  convertCurrency: (
    amount: number,
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode,
  ) => number;
  formatCurrency: (
    amountInInr: number,
    options?: CurrencyFormatOptions,
  ) => string;
  formatCurrencyValue: (
    amount: number,
    currency: CurrencyCode,
    options?: CurrencyFormatOptions,
  ) => string;
};

export const AppSettingsContext = createContext<AppSettingsValue | null>(null);

export function useAppSettings() {
  const context = useContext(AppSettingsContext);

  if (!context) {
    throw new Error("useAppSettings must be used inside AppSettingsProvider");
  }

  return context;
}
