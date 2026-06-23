import { useMemo, useState, type ReactNode } from "react";

import {
  AppSettingsContext,
  type AppSettingsValue,
  type AvatarId,
  type CurrencyCode,
  type CurrencyOption,
  type NotificationPreferences,
  type WalletTopUpMethod,
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

const defaultNotificationPreferences: NotificationPreferences = {
  friendRequestEmails: true,
  loginOtpEmails: true,
  settlementReminderEmails: true,
  roomDueNotifications: true,
};

type StoredSettings = Partial<{
  avatarId: AvatarId;
  compactMode: boolean;
  privacyMode: boolean;
  settlementReminders: boolean;
  appCurrency: CurrencyCode;
  converterFrom: CurrencyCode;
  converterTo: CurrencyCode;
  converterAmount: number;
  defaultTopUpMethod: WalletTopUpMethod;
  confirmBeforeWalletPayment: boolean;
  notificationPreferences: Partial<NotificationPreferences>;
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

function isWalletTopUpMethod(value: unknown): value is WalletTopUpMethod {
  return value === "UPI" || value === "Card" || value === "Net banking";
}

function normalizeNotificationPreferences(
  value: StoredSettings["notificationPreferences"],
): NotificationPreferences {
  return {
    ...defaultNotificationPreferences,
    ...(value ?? {}),
  };
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
    isAvatarId(storedSettings.avatarId) ? storedSettings.avatarId : "current",
  );
  const [compactMode, setCompactModeState] = useState(
    storedSettings.compactMode ?? false,
  );
  const [privacyMode, setPrivacyModeState] = useState(
    storedSettings.privacyMode ?? false,
  );
  const [settlementReminders, setSettlementRemindersState] = useState(
    storedSettings.settlementReminders ?? true,
  );
  const [appCurrency, setAppCurrencyState] = useState<CurrencyCode>(
    isCurrencyCode(storedSettings.appCurrency) ? storedSettings.appCurrency : "INR",
  );
  const [converterFrom, setConverterFromState] = useState<CurrencyCode>(
    isCurrencyCode(storedSettings.converterFrom) ? storedSettings.converterFrom : "INR",
  );
  const [converterTo, setConverterToState] = useState<CurrencyCode>(
    isCurrencyCode(storedSettings.converterTo) ? storedSettings.converterTo : "USD",
  );
  const [converterAmount, setConverterAmountState] = useState(
    storedSettings.converterAmount ?? 1000,
  );
  const [defaultTopUpMethod, setDefaultTopUpMethodState] =
    useState<WalletTopUpMethod>(
      isWalletTopUpMethod(storedSettings.defaultTopUpMethod)
        ? storedSettings.defaultTopUpMethod
        : "UPI",
    );
  const [confirmBeforeWalletPayment, setConfirmBeforeWalletPaymentState] =
    useState(storedSettings.confirmBeforeWalletPayment ?? true);
  const [notificationPreferences, setNotificationPreferencesState] =
    useState<NotificationPreferences>(
      normalizeNotificationPreferences(storedSettings.notificationPreferences),
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
      defaultTopUpMethod,
      confirmBeforeWalletPayment,
      notificationPreferences,
      ...updates,
    });
  };

  const clearLocalAppSettings = () => {
    window.localStorage.removeItem(settingsStorageKey);
    setAvatarIdState("current");
    setCompactModeState(false);
    setPrivacyModeState(false);
    setSettlementRemindersState(true);
    setAppCurrencyState("INR");
    setConverterFromState("INR");
    setConverterToState("USD");
    setConverterAmountState(1000);
    setDefaultTopUpMethodState("UPI");
    setConfirmBeforeWalletPaymentState(true);
    setNotificationPreferencesState(defaultNotificationPreferences);
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
      defaultTopUpMethod,
      confirmBeforeWalletPayment,
      notificationPreferences,
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
      setDefaultTopUpMethod(method) {
        setDefaultTopUpMethodState(method);
        persist({ defaultTopUpMethod: method });
      },
      setConfirmBeforeWalletPayment(enabled) {
        setConfirmBeforeWalletPaymentState(enabled);
        persist({ confirmBeforeWalletPayment: enabled });
      },
      setNotificationPreference(key, enabled) {
        const nextPreferences = {
          ...notificationPreferences,
          [key]: enabled,
        };
        setNotificationPreferencesState(nextPreferences);
        persist({ notificationPreferences: nextPreferences });
      },
      clearLocalAppSettings,
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
          },
        )}`;
      },
    }),
    [
      appCurrency,
      avatarId,
      compactMode,
      confirmBeforeWalletPayment,
      converterAmount,
      converterFrom,
      converterTo,
      defaultTopUpMethod,
      notificationPreferences,
      privacyMode,
      settlementReminders,
    ],
  );

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
}
