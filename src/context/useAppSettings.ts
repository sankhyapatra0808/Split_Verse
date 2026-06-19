import { createContext, useContext } from "react";

export type CurrencyCode = "INR" | "USD" | "EUR" | "GBP" | "JPY" | "AED";
export type AvatarId = "current" | "initials";

export type CurrencyOption = {
  code: CurrencyCode;
  label: string;
  symbol: string;
  rateFromInr: number;
};

export type AppSettingsValue = {
  avatarId: AvatarId;
  compactMode: boolean;
  privacyMode: boolean;
  settlementReminders: boolean;
  appCurrency: CurrencyCode;
  converterFrom: CurrencyCode;
  converterTo: CurrencyCode;
  converterAmount: number;
  currencies: CurrencyOption[];
  setAvatarId: (avatarId: AvatarId) => void;
  setCompactMode: (enabled: boolean) => void;
  setPrivacyMode: (enabled: boolean) => void;
  setSettlementReminders: (enabled: boolean) => void;
  setAppCurrency: (currency: CurrencyCode) => void;
  setConverterFrom: (currency: CurrencyCode) => void;
  setConverterTo: (currency: CurrencyCode) => void;
  setConverterAmount: (amount: number) => void;
  convertCurrency: (
    amount: number,
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode
  ) => number;
  formatCurrency: (amountInInr: number, options?: { signed?: boolean }) => string;
};

export const AppSettingsContext = createContext<AppSettingsValue | null>(null);

export function useAppSettings() {
  const context = useContext(AppSettingsContext);

  if (!context) {
    throw new Error("useAppSettings must be used inside AppSettingsProvider");
  }

  return context;
}
