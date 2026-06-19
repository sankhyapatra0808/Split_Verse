import { useMemo, useState, type ReactNode } from "react";

import {
  AppSettingsContext,
  type AppSettingsValue,
  type AvatarId,
  type CurrencyCode,
  type CurrencyOption,
} from "./useAppSettings";

const settingsStorageKey = "splitverse-app-settings";

const currencies: CurrencyOption[] = [
  { code: "INR", label: "Indian Rupee", symbol: "Rs.", rateFromInr: 1 },
  { code: "USD", label: "US Dollar", symbol: "$", rateFromInr: 0.012 },
  { code: "EUR", label: "Euro", symbol: "€", rateFromInr: 0.011 },
  { code: "GBP", label: "British Pound", symbol: "£", rateFromInr: 0.0095 },
  { code: "JPY", label: "Japanese Yen", symbol: "¥", rateFromInr: 1.87 },
  { code: "AED", label: "UAE Dirham", symbol: "د.إ", rateFromInr: 0.044 },
];

type StoredSettings = Partial<{
  avatarId: AvatarId;
  compactMode: boolean;
  privacyMode: boolean;
  settlementReminders: boolean;
  appCurrency: CurrencyCode;
  converterFrom: CurrencyCode;
  converterTo: CurrencyCode;
  converterAmount: number;
}>;

type AppSettingsProviderProps = {
  children: ReactNode;
};

function loadStoredSettings(): StoredSettings {
  try {
    const stored = window.localStorage.getItem(settingsStorageKey);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function isCurrencyCode(value: unknown): value is CurrencyCode {
  return currencies.some((currency) => currency.code === value);
}

function isAvatarId(value: unknown): value is AvatarId {
  return value === "current" || value === "initials";
}

function saveSettings(settings: StoredSettings) {
  window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
}

function getCurrency(currencyCode: CurrencyCode) {
  return currencies.find((currency) => currency.code === currencyCode) ?? currencies[0];
}

export function AppSettingsProvider({ children }: AppSettingsProviderProps) {
  const storedSettings = useMemo(loadStoredSettings, []);
  const [avatarId, setAvatarIdState] = useState<AvatarId>(
    isAvatarId(storedSettings.avatarId) ? storedSettings.avatarId : "current"
  );
  const [compactMode, setCompactModeState] = useState(
    storedSettings.compactMode ?? false
  );
  const [privacyMode, setPrivacyModeState] = useState(
    storedSettings.privacyMode ?? false
  );
  const [settlementReminders, setSettlementRemindersState] = useState(
    storedSettings.settlementReminders ?? true
  );
  const [appCurrency, setAppCurrencyState] = useState<CurrencyCode>(
    isCurrencyCode(storedSettings.appCurrency) ? storedSettings.appCurrency : "INR"
  );
  const [converterFrom, setConverterFromState] = useState<CurrencyCode>(
    isCurrencyCode(storedSettings.converterFrom) ? storedSettings.converterFrom : "INR"
  );
  const [converterTo, setConverterToState] = useState<CurrencyCode>(
    isCurrencyCode(storedSettings.converterTo) ? storedSettings.converterTo : "USD"
  );
  const [converterAmount, setConverterAmountState] = useState(
    storedSettings.converterAmount ?? 1000
  );

  const persist = (updates: StoredSettings) => {
    saveSettings({
      avatarId,
      compactMode,
      privacyMode,
      settlementReminders,
      appCurrency,
      converterFrom,
      converterTo,
      converterAmount,
      ...updates,
    });
  };

  const value = useMemo<AppSettingsValue>(
    () => ({
      avatarId,
      compactMode,
      privacyMode,
      settlementReminders,
      appCurrency,
      converterFrom,
      converterTo,
      converterAmount,
      currencies,
      setAvatarId(nextAvatarId) {
        setAvatarIdState(nextAvatarId);
        persist({ avatarId: nextAvatarId });
      },
      setCompactMode(enabled) {
        setCompactModeState(enabled);
        persist({ compactMode: enabled });
      },
      setPrivacyMode(enabled) {
        setPrivacyModeState(enabled);
        persist({ privacyMode: enabled });
      },
      setSettlementReminders(enabled) {
        setSettlementRemindersState(enabled);
        persist({ settlementReminders: enabled });
      },
      setAppCurrency(currency) {
        setAppCurrencyState(currency);
        persist({ appCurrency: currency });
      },
      setConverterFrom(currency) {
        setConverterFromState(currency);
        persist({ converterFrom: currency });
      },
      setConverterTo(currency) {
        setConverterToState(currency);
        persist({ converterTo: currency });
      },
      setConverterAmount(amount) {
        setConverterAmountState(amount);
        persist({ converterAmount: amount });
      },
      convertCurrency(amount, fromCurrency, toCurrency) {
        const amountInInr = amount / getCurrency(fromCurrency).rateFromInr;
        return amountInInr * getCurrency(toCurrency).rateFromInr;
      },
      formatCurrency(amountInInr, options = {}) {
        if (privacyMode) {
          return "Hidden";
        }

        const selectedCurrency = getCurrency(appCurrency);
        const convertedAmount = amountInInr * selectedCurrency.rateFromInr;
        const sign = options.signed
          ? convertedAmount > 0
            ? "+"
            : convertedAmount < 0
              ? "-"
              : ""
          : "";

        return `${sign}${selectedCurrency.symbol} ${Math.abs(convertedAmount).toLocaleString(
          "en-IN",
          {
            maximumFractionDigits: appCurrency === "JPY" ? 0 : 2,
          }
        )}`;
      },
    }),
    [
      appCurrency,
      avatarId,
      compactMode,
      converterAmount,
      converterFrom,
      converterTo,
      privacyMode,
      settlementReminders,
    ]
  );

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
}
