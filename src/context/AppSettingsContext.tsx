import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  AppSettingsContext,
  type AppLanguageCode,
  type AppSettingsValue,
  type AvatarId,
  type CurrencyCode,
  type CurrencyFormatOptions,
  type CurrencyOption,
  type ExchangeRatesSource,
  type LanguageOption,
  type NotificationPreferences,
  type WalletTopUpMethod,
} from "./useAppSettings";
import { observeUiTranslations } from "../i18n/uiTranslations";
import { getExchangeRates } from "../lib/api";

const settingsStorageKey = "splitverse-app-settings";

const currencies: CurrencyOption[] = [
  { code: "INR", label: "Indian Rupee", symbol: "₹", rateFromInr: 1, countryHint: "India" },
  { code: "CAD", label: "Canadian Dollar", symbol: "$", rateFromInr: 0.0165, countryHint: "Canada" },
  { code: "USD", label: "US Dollar", symbol: "$", rateFromInr: 0.012, countryHint: "United States" },
  { code: "EUR", label: "Euro", symbol: "€", rateFromInr: 0.011, countryHint: "Europe" },
  { code: "GBP", label: "British Pound", symbol: "£", rateFromInr: 0.0095, countryHint: "United Kingdom" },
  { code: "AED", label: "UAE Dirham", symbol: "د.إ", rateFromInr: 0.044, countryHint: "United Arab Emirates" },
  { code: "AUD", label: "Australian Dollar", symbol: "$", rateFromInr: 0.018, countryHint: "Australia" },
  { code: "SGD", label: "Singapore Dollar", symbol: "$", rateFromInr: 0.016, countryHint: "Singapore" },
  { code: "CHF", label: "Swiss Franc", symbol: "CHF", rateFromInr: 0.0098, countryHint: "Switzerland" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥", rateFromInr: 1.87, countryHint: "Japan" },
  { code: "CNY", label: "Chinese Yuan", symbol: "¥", rateFromInr: 0.086, countryHint: "China" },
];

const languages: LanguageOption[] = [
  { code: "en", label: "English", nativeLabel: "English", locale: "en-IN" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", locale: "hi-IN" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা", locale: "bn-IN" },
  { code: "fr", label: "French", nativeLabel: "Français", locale: "fr-FR" },
  { code: "es", label: "Spanish", nativeLabel: "Español", locale: "es-ES" },
  { code: "de", label: "German", nativeLabel: "Deutsch", locale: "de-DE" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", locale: "ar-AE" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語", locale: "ja-JP" },
  { code: "zh", label: "Chinese", nativeLabel: "中文", locale: "zh-CN" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português", locale: "pt-BR" },
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
  appLanguage: AppLanguageCode;
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

const regionCurrencyMap: Record<string, CurrencyCode> = {
  IN: "INR",
  CA: "CAD",
  US: "USD",
  GB: "GBP",
  IE: "EUR",
  FR: "EUR",
  DE: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  BE: "EUR",
  PT: "EUR",
  AE: "AED",
  JP: "JPY",
  AU: "AUD",
  SG: "SGD",
  CH: "CHF",
  CN: "CNY",
};

const timezoneCurrencyHints: Array<[string, CurrencyCode]> = [
  ["Asia/Calcutta", "INR"],
  ["Asia/Kolkata", "INR"],
  ["America/Toronto", "CAD"],
  ["America/Vancouver", "CAD"],
  ["America/Winnipeg", "CAD"],
  ["America/Edmonton", "CAD"],
  ["America/Halifax", "CAD"],
  ["America/St_Johns", "CAD"],
  ["America/New_York", "USD"],
  ["America/Chicago", "USD"],
  ["America/Denver", "USD"],
  ["America/Los_Angeles", "USD"],
  ["Europe/London", "GBP"],
  ["Europe/", "EUR"],
  ["Asia/Dubai", "AED"],
  ["Asia/Tokyo", "JPY"],
  ["Australia/", "AUD"],
  ["Asia/Singapore", "SGD"],
  ["Asia/Shanghai", "CNY"],
];

function loadStoredSettings(): StoredSettings {
  try {
    const stored = window.localStorage.getItem(settingsStorageKey);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function getBrowserLocales() {
  if (typeof navigator === "undefined") {
    return [];
  }

  return Array.from(
    new Set([...(navigator.languages ?? []), navigator.language].filter(Boolean)),
  );
}

function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

function getRegionFromLocale(locale: string) {
  const region = locale.split("-")[1];
  return region?.toUpperCase() ?? "";
}

function detectCurrencyCode(): CurrencyCode {
  const locales = getBrowserLocales();

  for (const locale of locales) {
    const currency = regionCurrencyMap[getRegionFromLocale(locale)];

    if (currency) {
      return currency;
    }
  }

  const timezone = getBrowserTimezone();
  const timezoneHint = timezoneCurrencyHints.find(([hint]) =>
    timezone.toLowerCase().startsWith(hint.toLowerCase()),
  );

  return timezoneHint?.[1] ?? "INR";
}

function detectLanguageCode(): AppLanguageCode {
  const locales = getBrowserLocales();

  for (const locale of locales) {
    const language = locale.split("-")[0]?.toLowerCase();

    if (languages.some((item) => item.code === language)) {
      return language as AppLanguageCode;
    }
  }

  return "en";
}

function isCurrencyCode(value: unknown): value is CurrencyCode {
  return currencies.some((currency) => currency.code === value);
}

function isAppLanguageCode(value: unknown): value is AppLanguageCode {
  return languages.some((language) => language.code === value);
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

function getLanguage(languageCode: AppLanguageCode) {
  return languages.find((language) => language.code === languageCode) ?? languages[0];
}


function getCurrencyFractionDigits(currencyCode: CurrencyCode) {
  return currencyCode === "JPY" || currencyCode === "CNY" ? 0 : 2;
}

function getStaticExchangeRates(): Record<CurrencyCode, number> {
  return currencies.reduce(
    (rates, currency) => ({
      ...rates,
      [currency.code]: currency.rateFromInr,
    }),
    {} as Record<CurrencyCode, number>,
  );
}

function normalizeExchangeRates(
  rates: Record<string, number> | undefined,
): Record<CurrencyCode, number> {
  const nextRates = getStaticExchangeRates();
  nextRates.INR = 1;

  currencies.forEach((currency) => {
    const rate = Number(rates?.[currency.code]);

    if (Number.isFinite(rate) && rate > 0) {
      nextRates[currency.code] = rate;
    }
  });

  return nextRates;
}

export function AppSettingsProvider({ children }: AppSettingsProviderProps) {
  const storedSettings = useMemo(() => loadStoredSettings(), []);
  const detectedCurrency = useMemo(() => detectCurrencyCode(), []);
  const detectedLanguage = useMemo(() => detectLanguageCode(), []);
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
    isCurrencyCode(storedSettings.appCurrency)
      ? storedSettings.appCurrency
      : detectedCurrency,
  );
  const [appLanguage, setAppLanguageState] = useState<AppLanguageCode>(
    isAppLanguageCode(storedSettings.appLanguage)
      ? storedSettings.appLanguage
      : detectedLanguage,
  );
  const [converterFrom, setConverterFromState] = useState<CurrencyCode>(
    isCurrencyCode(storedSettings.converterFrom)
      ? storedSettings.converterFrom
      : detectedCurrency,
  );
  const [converterTo, setConverterToState] = useState<CurrencyCode>(
    isCurrencyCode(storedSettings.converterTo)
      ? storedSettings.converterTo
      : detectedCurrency === "USD"
        ? "INR"
        : "USD",
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
  const [exchangeRates, setExchangeRates] = useState<Record<CurrencyCode, number>>(
    () => getStaticExchangeRates(),
  );
  const [exchangeRatesSource, setExchangeRatesSource] =
    useState<ExchangeRatesSource>("fallback");
  const [exchangeRatesFetchedAt, setExchangeRatesFetchedAt] = useState<string | null>(
    null,
  );
  const [exchangeRatesExpiresAt, setExchangeRatesExpiresAt] = useState<string | null>(
    null,
  );
  const [exchangeRatesLoading, setExchangeRatesLoading] = useState(true);
  const [exchangeRatesError, setExchangeRatesError] = useState("");

  useEffect(() => observeUiTranslations(appLanguage), [appLanguage]);

  useEffect(() => {
    let active = true;
    const symbols = currencies
      .map((currency) => currency.code)
      .filter((currency) => currency !== "INR");

    async function loadExchangeRates() {
      try {
        setExchangeRatesLoading(true);
        setExchangeRatesError("");
        const response = await getExchangeRates("INR", symbols);

        if (!active) {
          return;
        }

        setExchangeRates(normalizeExchangeRates(response.rates));
        setExchangeRatesSource(response.source);
        setExchangeRatesFetchedAt(response.fetchedAt);
        setExchangeRatesExpiresAt(response.expiresAt);
      } catch (error) {
        if (!active) {
          return;
        }

        setExchangeRates(getStaticExchangeRates());
        setExchangeRatesSource("fallback");
        setExchangeRatesFetchedAt(null);
        setExchangeRatesExpiresAt(null);
        setExchangeRatesError(
          error instanceof Error
            ? error.message
            : "Could not load live exchange rates.",
        );
      } finally {
        if (active) {
          setExchangeRatesLoading(false);
        }
      }
    }

    void loadExchangeRates();

    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback((updates: StoredSettings) => {
    saveSettings({
      avatarId,
      compactMode,
      privacyMode,
      settlementReminders,
      appCurrency,
      appLanguage,
      converterFrom,
      converterTo,
      converterAmount,
      defaultTopUpMethod,
      confirmBeforeWalletPayment,
      notificationPreferences,
      ...updates,
    });
  }, [
    appCurrency,
    appLanguage,
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
  ]);

  const clearLocalAppSettings = useCallback(() => {
    window.localStorage.removeItem(settingsStorageKey);
    setAvatarIdState("current");
    setCompactModeState(false);
    setPrivacyModeState(false);
    setSettlementRemindersState(true);
    setAppCurrencyState(detectedCurrency);
    setAppLanguageState(detectedLanguage);
    setConverterFromState(detectedCurrency);
    setConverterToState(detectedCurrency === "USD" ? "INR" : "USD");
    setConverterAmountState(1000);
    setDefaultTopUpMethodState("UPI");
    setConfirmBeforeWalletPaymentState(true);
    setNotificationPreferencesState(defaultNotificationPreferences);
  }, [detectedCurrency, detectedLanguage]);

  const currenciesWithLiveRates = useMemo<CurrencyOption[]>(
    () =>
      currencies.map((currency) => ({
        ...currency,
        rateFromInr: exchangeRates[currency.code] ?? currency.rateFromInr,
      })),
    [exchangeRates],
  );

  const value = useMemo<AppSettingsValue>(
    () => {
      const activeLocale = getLanguage(appLanguage).locale;

      function getRateFromInr(currencyCode: CurrencyCode) {
        const fallbackRate = getCurrency(currencyCode).rateFromInr;
        const liveRate = exchangeRates[currencyCode];

        return Number.isFinite(liveRate) && liveRate > 0
          ? liveRate
          : fallbackRate;
      }

      function formatCurrencyValue(
        amount: number,
        currency: CurrencyCode,
        options: CurrencyFormatOptions = {},
      ) {
        if (privacyMode) {
          return "Hidden";
        }

        const numericAmount = Number.isFinite(amount) ? amount : 0;
        const sign = options.signed
          ? numericAmount > 0
            ? "+"
            : numericAmount < 0
              ? "-"
              : ""
          : "";
        const formatter = new Intl.NumberFormat(activeLocale, {
          style: "currency",
          currency,
          notation: options.compact ? "compact" : "standard",
          maximumFractionDigits: getCurrencyFractionDigits(currency),
        });

        return `${sign}${formatter.format(Math.abs(numericAmount))}`;
      }

      return {
        avatarId,
        compactMode,
        privacyMode,
        settlementReminders,
        appCurrency,
        detectedCurrency,
        appLanguage,
        converterFrom,
        converterTo,
        converterAmount,
        defaultTopUpMethod,
        confirmBeforeWalletPayment,
        notificationPreferences,
        exchangeRates,
        exchangeRatesSource,
        exchangeRatesFetchedAt,
        exchangeRatesExpiresAt,
        exchangeRatesLoading,
        exchangeRatesError,
        currencies: currenciesWithLiveRates,
        languages,
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
        setAppLanguage(language) {
          setAppLanguageState(language);
          persist({ appLanguage: language });
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
          const fromRate = getRateFromInr(fromCurrency);
          const toRate = getRateFromInr(toCurrency);
          const amountInInr = amount / fromRate;

          return amountInInr * toRate;
        },
        formatCurrency(amountInInr, options = {}) {
          const convertedAmount = amountInInr * getRateFromInr(appCurrency);

          return formatCurrencyValue(convertedAmount, appCurrency, options);
        },
        formatCurrencyValue,
      };
    },
    [
      appCurrency,
      appLanguage,
      avatarId,
      compactMode,
      confirmBeforeWalletPayment,
      converterAmount,
      converterFrom,
      converterTo,
      defaultTopUpMethod,
      detectedCurrency,
      clearLocalAppSettings,
      currenciesWithLiveRates,
      exchangeRates,
      exchangeRatesError,
      exchangeRatesExpiresAt,
      exchangeRatesFetchedAt,
      exchangeRatesLoading,
      exchangeRatesSource,
      notificationPreferences,
      persist,
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
