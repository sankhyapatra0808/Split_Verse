import {
  BellRing,
  Coins,
  EyeOff,
  Shield,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";

import Dropdown, { type DropdownOption } from "../components/Dropdown";
import { useAppSettings, type CurrencyCode } from "../context/useAppSettings";
import DashboardLayout from "./dashboard/DashboardLayout";

export default function AppSettings() {
  const {
    appCurrency,
    avatarId,
    compactMode,
    converterAmount,
    converterFrom,
    converterTo,
    currencies,
    privacyMode,
    settlementReminders,
    convertCurrency,
    formatCurrency,
    setAppCurrency,
    setAvatarId,
    setCompactMode,
    setConverterAmount,
    setConverterFrom,
    setConverterTo,
    setPrivacyMode,
    setSettlementReminders,
  } = useAppSettings();

  const convertedAmount = convertCurrency(
    converterAmount,
    converterFrom,
    converterTo
  );
  const currencyOptions: DropdownOption<CurrencyCode>[] = currencies.map(
    (currency) => ({
      value: currency.code,
      label: `${currency.code} - ${currency.label}`,
    }),
  );
  const compactCurrencyOptions: DropdownOption<CurrencyCode>[] = currencies.map(
    (currency) => ({
      value: currency.code,
      label: currency.code,
    }),
  );

  return (
    <DashboardLayout eyebrow="Settings">
      <section className="dashboard-page-grid settings-grid">
        <article className="bento-card settings-card">
          <div className="bento-card-head">
            <div>
              <span>Profile privacy</span>
              <h2>Photo display</h2>
            </div>
            <Shield size={22} />
          </div>
          <div className="settings-toggle-list compact">
            <label>
              <UserRound size={19} />
              <span>
                <strong>Use initials instead of photo</strong>
                <small>
                  Hide your profile picture and show first and last initials.
                </small>
              </span>
              <input
                type="checkbox"
                checked={avatarId === "initials"}
                onChange={(event) =>
                  setAvatarId(event.target.checked ? "initials" : "current")
                }
              />
            </label>
          </div>
        </article>

        <article className="bento-card settings-card">
          <div className="bento-card-head">
            <div>
              <span>Application currency</span>
              <h2>Money display</h2>
            </div>
            <Coins size={22} />
          </div>
          <label className="settings-field">
            <span>Use this currency across the app</span>
            <Dropdown
              ariaLabel="Application currency"
              value={appCurrency}
              options={currencyOptions}
              onChange={setAppCurrency}
            />
          </label>
          <div className="settings-preview">
            <span>Example display</span>
            <strong>{formatCurrency(2480)}</strong>
          </div>
        </article>

        <article className="bento-card settings-card">
          <div className="bento-card-head">
            <div>
              <span>Currency converter</span>
              <h2>Quick conversion</h2>
            </div>
            <Coins size={22} />
          </div>
          <div className="converter-grid">
            <label className="settings-field">
              <span>Amount</span>
              <input
                type="number"
                min="0"
                value={converterAmount}
                onChange={(event) =>
                  setConverterAmount(Number(event.target.value || 0))
                }
              />
            </label>
            <label className="settings-field">
              <span>From</span>
              <Dropdown
                ariaLabel="Convert from currency"
                value={converterFrom}
                options={compactCurrencyOptions}
                onChange={setConverterFrom}
              />
            </label>
            <label className="settings-field">
              <span>To</span>
              <Dropdown
                ariaLabel="Convert to currency"
                value={converterTo}
                options={compactCurrencyOptions}
                onChange={setConverterTo}
              />
            </label>
          </div>
          <div className="settings-preview strong">
            <span>Converted amount</span>
            <strong>
              {
                currencies.find((currency) => currency.code === converterTo)
                  ?.symbol
              }{" "}
              {convertedAmount.toLocaleString("en-IN", {
                maximumFractionDigits: converterTo === "JPY" ? 0 : 2,
              })}
            </strong>
          </div>
        </article>

        <article className="bento-card settings-card">
          <div className="bento-card-head">
            <div>
              <span>Experience</span>
              <h2>User preferences</h2>
            </div>
            <SlidersHorizontal size={22} />
          </div>
          <div className="settings-toggle-list">
            <label>
              <BellRing size={19} />
              <span>
                <strong>Settlement reminders</strong>
                <small>Keep gentle nudges visible for pending dues.</small>
              </span>
              <input
                type="checkbox"
                checked={settlementReminders}
                onChange={(event) => setSettlementReminders(event.target.checked)}
              />
            </label>
            <label>
              <EyeOff size={19} />
              <span>
                <strong>Privacy mode</strong>
                <small>Hide money values when sharing your screen.</small>
              </span>
              <input
                type="checkbox"
                checked={privacyMode}
                onChange={(event) => setPrivacyMode(event.target.checked)}
              />
            </label>
            <label>
              <SlidersHorizontal size={19} />
              <span>
                <strong>Compact workspace</strong>
                <small>Prefer denser cards and tighter lists.</small>
              </span>
              <input
                type="checkbox"
                checked={compactMode}
                onChange={(event) => setCompactMode(event.target.checked)}
              />
            </label>
          </div>
        </article>
      </section>
    </DashboardLayout>
  );
}
