import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BellRing,
  Coins,
  CreditCard,
  Download,
  EyeOff,
  Mail,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserRound,
  ImagePlus,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";

import Dropdown, { type DropdownOption } from "../components/Dropdown";
import {
  useAppSettings,
  type AppLanguageCode,
  type CurrencyCode,
  type WalletTopUpMethod,
} from "../context/useAppSettings";
import { useAuth } from "../context/useAuth";
import {
  deleteAccount,
  deleteFriend,
  downloadMyData,
  getCurrentDbUser,
  getFriendsSummary,
  requestWalletPinResetOtp,
  resetWalletPinWithOtp,
  saveWalletPin,
  updateProfileSettings,
  uploadProfilePhoto,
  type Friend,
} from "../lib/api";
import { withTopProgress } from "../utils/topProgress";
import DashboardLayout from "./dashboard/DashboardLayout";
import "../styles/AppSettings.css";

const deleteAccountConfirmationText = "/DeleteAccount";

function getFriendLabel(friend: Friend) {
  return friend.name || friend.email.split("@")[0] || friend.email;
}

function formatFriendshipAge(days: number) {
  if (days <= 0) {
    return "Friends today";
  }

  if (days === 1) {
    return "Friends for 1 day";
  }

  return `Friends for ${days} days`;
}

function downloadJsonFile(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function getProfileInitials(
  userName?: string | null,
  userEmail?: string | null,
) {
  const source = userName || userEmail?.split("@")[0] || "SV";
  const parts = source.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "S";
  const second =
    parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || "V";

  return `${first}${second}`.toUpperCase();
}

function getFriendInitials(friend: Friend) {
  const source = friend.name || friend.email?.split("@")[0] || "SV";
  const parts = source.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "S";
  const second =
    parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || "V";

  return `${first}${second}`.toUpperCase();
}

function getFriendAvatarUrl(friend: Friend) {
  if (friend.avatar_mode === "initials") {
    return "";
  }

  return (
    friend.display_photo_url ||
    friend.profile_photo_url ||
    friend.photo_url ||
    ""
  );
}

function isProbablyImageUrl(value: string) {
  if (!value.trim()) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}


function normalizePinInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

function getWalletPinStrengthError(pin: string) {
  if (!/^\d{4,6}$/.test(pin)) {
    return "Wallet PIN must be 4 to 6 digits.";
  }

  if (/^(\d)\1+$/.test(pin)) {
    return "Use a stronger PIN. Repeated digits are too easy to guess.";
  }

  const commonPins = new Set([
    "0000",
    "1111",
    "2222",
    "3333",
    "4444",
    "5555",
    "6666",
    "7777",
    "8888",
    "9999",
    "1234",
    "4321",
    "12345",
    "54321",
    "123456",
    "654321",
    "1122",
    "1212",
    "2580",
  ]);

  if (commonPins.has(pin)) {
    return "Use a stronger PIN. This PIN is too common.";
  }

  const digits = pin.split("").map(Number);
  const increasing = digits.every(
    (digit, index) => index === 0 || digit === digits[index - 1] + 1,
  );
  const decreasing = digits.every(
    (digit, index) => index === 0 || digit === digits[index - 1] - 1,
  );

  if (increasing || decreasing) {
    return "Use a stronger PIN. Sequential digits are too easy to guess.";
  }

  return "";
}



function formatExchangeRateStatus({
  error,
  fetchedAt,
  loading,
  source,
}: {
  error: string;
  fetchedAt: string | null;
  loading: boolean;
  source: string;
}) {
  if (loading) {
    return "Loading realtime exchange rates...";
  }

  if (source === "fallback") {
    return error
      ? `Using fallback rates. ${error}`
      : "Using fallback exchange rates.";
  }

  const updatedText = fetchedAt
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(fetchedAt))
    : "recently";

  if (source === "live") {
    return `Rates updated: ${updatedText}`;
  }

  if (source === "stale-cache") {
    return `Using last available cached rates from ${updatedText}.`;
  }

  return `Using cached exchange rates from ${updatedText}.`;
}

export default function AppSettings() {
  const navigate = useNavigate();
  const { user, logout, refreshDbUser } = useAuth();
  const {
    appCurrency,
    appLanguage,
    avatarId,
    compactMode,
    confirmBeforeWalletPayment,
    converterAmount,
    converterFrom,
    converterTo,
    currencies,
    defaultTopUpMethod,
    languages,
    notificationPreferences,
    exchangeRatesError,
    exchangeRatesFetchedAt,
    exchangeRatesLoading,
    exchangeRatesSource,
    privacyMode,
    settlementReminders,
    clearLocalAppSettings,
    convertCurrency,
    formatCurrency,
    formatCurrencyValue,
    setAppCurrency,
    setAppLanguage,
    setAvatarId,
    setCompactMode,
    setConfirmBeforeWalletPayment,
    setConverterAmount,
    setConverterFrom,
    setConverterTo,
    setDefaultTopUpMethod,
    setNotificationPreference,
    setPrivacyMode,
    setSettlementReminders,
  } = useAppSettings();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendSearch, setFriendSearch] = useState("");
  const [deletingFriendId, setDeletingFriendId] = useState("");
  const [friendDeleteMessage, setFriendDeleteMessage] = useState("");
  const [friendDeleteError, setFriendDeleteError] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [downloadingData, setDownloadingData] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [savedProfilePhotoUrl, setSavedProfilePhotoUrl] = useState("");
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profilePhotoPreviewUrl, setProfilePhotoPreviewUrl] = useState("");
  const profilePhotoObjectUrlRef = useRef("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [walletPinSet, setWalletPinSet] = useState(false);
  const [walletPinCurrent, setWalletPinCurrent] = useState("");
  const [walletPinNew, setWalletPinNew] = useState("");
  const [walletPinConfirm, setWalletPinConfirm] = useState("");
  const [savingWalletPin, setSavingWalletPin] = useState(false);
  const [walletPinResetOpen, setWalletPinResetOpen] = useState(false);
  const [walletPinResetOtp, setWalletPinResetOtp] = useState("");
  const [walletPinResetNew, setWalletPinResetNew] = useState("");
  const [walletPinResetConfirm, setWalletPinResetConfirm] = useState("");
  const [walletPinResetMessage, setWalletPinResetMessage] = useState("");
  const [walletPinResetError, setWalletPinResetError] = useState("");
  const [requestingWalletPinReset, setRequestingWalletPinReset] = useState(false);
  const [resettingWalletPin, setResettingWalletPin] = useState(false);

  const convertedAmount = convertCurrency(
    converterAmount,
    converterFrom,
    converterTo,
  );
  const exchangeRateStatusText = formatExchangeRateStatus({
    error: exchangeRatesError,
    fetchedAt: exchangeRatesFetchedAt,
    loading: exchangeRatesLoading,
    source: exchangeRatesSource,
  });

  useEffect(() => {
    if (!settingsMessage) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSettingsMessage("");
    }, 3600);

    return () => window.clearTimeout(timer);
  }, [settingsMessage]);

  const currencyOptions: DropdownOption<CurrencyCode>[] = currencies.map(
    (currency) => ({
      value: currency.code,
      label: `${currency.code} - ${currency.label}`,
    }),
  );
  const languageOptions: DropdownOption<AppLanguageCode>[] = languages.map(
    (language) => ({
      value: language.code,
      label:
        language.label === language.nativeLabel
          ? language.label
          : `${language.nativeLabel} - ${language.label}`,
    }),
  );
  const compactCurrencyOptions: DropdownOption<CurrencyCode>[] = currencies.map(
    (currency) => ({
      value: currency.code,
      label: currency.code,
    }),
  );
  const topUpMethodOptions: DropdownOption<WalletTopUpMethod>[] = [
    { value: "UPI", label: "UPI" },
    { value: "Card", label: "Card" },
    { value: "Net banking", label: "Net banking" },
  ];
  const canDeleteAccount = deleteConfirmation === deleteAccountConfirmationText;
  const trimmedFriendSearch = friendSearch.trim();
  const visibleFriends = useMemo(() => {
    const normalizedSearch = trimmedFriendSearch.toLowerCase();

    if (!normalizedSearch) {
      return friends;
    }

    return friends.filter((friend) =>
      `${friend.name ?? ""} ${friend.email}`
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [friends, trimmedFriendSearch]);
  const profileInitials = getProfileInitials(user?.displayName, user?.email);
  const profilePreviewUrl =
    avatarId === "initials"
      ? ""
      : profilePhotoPreviewUrl ||
        profilePhotoUrl.trim() ||
        savedProfilePhotoUrl ||
        user?.photoURL ||
        "";

  function isKnownCurrency(value: unknown): value is CurrencyCode {
    return currencies.some((currency) => currency.code === value);
  }

  function isKnownLanguage(value: unknown): value is AppLanguageCode {
    return languages.some((language) => language.code === value);
  }

  useEffect(() => {
    let active = true;

    async function loadFriends() {
      try {
        setFriendsLoading(true);
        setFriendDeleteError("");
        const data = await getFriendsSummary();

        if (active) {
          setFriends(data.friends);
        }
      } catch (error) {
        if (active) {
          setFriendDeleteError(
            error instanceof Error ? error.message : "Could not load friends.",
          );
        }
      } finally {
        if (active) {
          setFriendsLoading(false);
        }
      }
    }

    void loadFriends();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadProfileSettings() {
      try {
        setProfileLoading(true);
        const response = await getCurrentDbUser();

        if (!active) {
          return;
        }

        setSavedProfilePhotoUrl(
          response.user.profile_photo_url ||
            response.user.photo_url ||
            user?.photoURL ||
            "",
        );
        setProfilePhotoUrl("");
        setAvatarId(
          response.user.avatar_mode === "initials" ? "initials" : "current",
        );
        setWalletPinSet(Boolean(response.user.has_wallet_pin));

        if (isKnownCurrency(response.user.app_currency)) {
          setAppCurrency(response.user.app_currency);
        }

        if (isKnownLanguage(response.user.app_language)) {
          setAppLanguage(response.user.app_language);
        }
      } catch (error) {
        if (active) {
          console.error("Could not load profile display settings:", error);
        }
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    }

    void loadProfileSettings();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.photoURL]);

  useEffect(
    () => () => {
      if (profilePhotoObjectUrlRef.current) {
        URL.revokeObjectURL(profilePhotoObjectUrlRef.current);
      }
    },
    [],
  );

  function clearProfilePhotoPreview() {
    if (profilePhotoObjectUrlRef.current) {
      URL.revokeObjectURL(profilePhotoObjectUrlRef.current);
      profilePhotoObjectUrlRef.current = "";
    }

    setProfilePhotoPreviewUrl("");
  }

  function setProfilePhotoPreview(file: File) {
    clearProfilePhotoPreview();

    const objectUrl = URL.createObjectURL(file);
    profilePhotoObjectUrlRef.current = objectUrl;
    setProfilePhotoPreviewUrl(objectUrl);
  }

  function handleProfilePhotoFileChange(file: File | null) {
    setSettingsError("");
    setSettingsMessage("");

    if (!file) {
      setProfilePhotoFile(null);
      clearProfilePhotoPreview();
      return;
    }

    if (!file.type.startsWith("image/")) {
      setSettingsError("Choose a valid image file.");
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setSettingsError("Profile photo must be 3 MB or smaller.");
      return;
    }

    setProfilePhotoFile(file);
    setProfilePhotoPreview(file);
    setProfilePhotoUrl("");
  }

  async function saveProfileDisplay(
    nextAvatarId = avatarId,
    nextPhotoUrl: string | null | undefined = undefined,
    { quiet = false } = {},
  ) {
    const trimmedPhotoUrl = String(nextPhotoUrl ?? "").trim();
    const photoUrlForBackend = trimmedPhotoUrl || savedProfilePhotoUrl.trim() || null;

    if (!isProbablyImageUrl(trimmedPhotoUrl)) {
      setSettingsError("Enter a valid http or https profile photo URL.");
      return;
    }

    try {
      setProfileSaving(true);
      setSettingsError("");

      const response = await updateProfileSettings({
        avatarMode: nextAvatarId === "initials" ? "initials" : "photo",
        profilePhotoUrl: photoUrlForBackend,
      });

      setSavedProfilePhotoUrl(
        response.user.profile_photo_url || response.user.photo_url || "",
      );
      setProfilePhotoUrl("");
      setAvatarId(
        response.user.avatar_mode === "initials" ? "initials" : "current",
      );
      window.dispatchEvent(new Event("splitverse:profile-updated"));
      window.dispatchEvent(new Event("splitverse:data-updated"));

      if (!quiet) {
        setSettingsMessage(
          "Profile display updated. Friends will see your latest photo preference.",
        );
      }
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not update profile display settings.",
      );
    } finally {
      setProfileSaving(false);
    }
  }

  function handleAvatarModeChange(useInitials: boolean) {
    const nextAvatarId = useInitials ? "initials" : "current";

    setAvatarId(nextAvatarId);
    void saveProfileDisplay(nextAvatarId, undefined, { quiet: false });
  }

  async function handleSaveProfilePhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (profilePhotoFile) {
      try {
        setProfileSaving(true);
        setSettingsError("");
        setSettingsMessage("");

        const response = await withTopProgress(() =>
          uploadProfilePhoto(profilePhotoFile),
        );

        setSavedProfilePhotoUrl(
          response.user.profile_photo_url || response.user.photo_url || "",
        );
        setProfilePhotoUrl("");
        setProfilePhotoFile(null);
        clearProfilePhotoPreview();
        setAvatarId(
          response.user.avatar_mode === "initials" ? "initials" : "current",
        );
        window.dispatchEvent(new Event("splitverse:profile-updated"));
        window.dispatchEvent(new Event("splitverse:data-updated"));
        setSettingsMessage("Profile photo uploaded securely.");
      } catch (error) {
        setSettingsError(
          error instanceof Error
            ? error.message
            : "Could not upload profile photo.",
        );
      } finally {
        setProfileSaving(false);
      }

      return;
    }

    await saveProfileDisplay(avatarId, profilePhotoUrl);
  }

  async function saveApplicationDisplay(
    nextCurrency = appCurrency,
    nextLanguage = appLanguage,
  ) {
    try {
      setSettingsError("");
      await updateProfileSettings({
        appCurrency: nextCurrency,
        appLanguage: nextLanguage,
      });
      setSettingsMessage("Application display settings saved.");
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not save application display settings.",
      );
    }
  }

  function handleAppCurrencyChange(currency: CurrencyCode) {
    setAppCurrency(currency);
    void saveApplicationDisplay(currency, appLanguage);
  }

  function handleAppLanguageChange(language: AppLanguageCode) {
    setAppLanguage(language);
    void saveApplicationDisplay(appCurrency, language);
  }

  async function handleSaveWalletPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsError("");
    setSettingsMessage("");

    const nextPin = walletPinNew.trim();
    const confirmPin = walletPinConfirm.trim();
    const currentPin = walletPinCurrent.trim();
    const strengthError = getWalletPinStrengthError(nextPin);

    if (strengthError) {
      setSettingsError(strengthError);
      return;
    }

    if (nextPin !== confirmPin) {
      setSettingsError("Wallet PIN confirmation does not match.");
      return;
    }

    if (!/^\d{4,6}$/.test(currentPin)) {
      setSettingsError("Enter your current wallet PIN to change it.");
      return;
    }

    if (currentPin === nextPin) {
      setSettingsError("New wallet PIN cannot be the same as the old PIN.");
      return;
    }

    try {
      setSavingWalletPin(true);
      await withTopProgress(() =>
        saveWalletPin({
          pin: nextPin,
          currentPin,
        }),
      );
      await refreshDbUser();
      setWalletPinSet(true);
      setWalletPinCurrent("");
      setWalletPinNew("");
      setWalletPinConfirm("");
      setSettingsMessage("Wallet PIN changed successfully.");
    } catch (error) {
      setSettingsError(
        error instanceof Error ? error.message : "Could not change wallet PIN.",
      );
    } finally {
      setSavingWalletPin(false);
    }
  }

  function openForgotWalletPinDialog() {
    setWalletPinResetOpen(true);
    setWalletPinResetOtp("");
    setWalletPinResetNew("");
    setWalletPinResetConfirm("");
    setWalletPinResetMessage("");
    setWalletPinResetError("");
  }

  async function handleRequestWalletPinResetOtp() {
    try {
      setWalletPinResetError("");
      setWalletPinResetMessage("");
      setRequestingWalletPinReset(true);
      const response = await withTopProgress(() => requestWalletPinResetOtp());
      setWalletPinResetMessage(response.message);
    } catch (error) {
      setWalletPinResetError(
        error instanceof Error
          ? error.message
          : "Could not send wallet PIN reset OTP.",
      );
    } finally {
      setRequestingWalletPinReset(false);
    }
  }

  async function handleResetWalletPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWalletPinResetError("");
    setWalletPinResetMessage("");

    const otp = walletPinResetOtp.trim();
    const nextPin = walletPinResetNew.trim();
    const confirmPin = walletPinResetConfirm.trim();
    const strengthError = getWalletPinStrengthError(nextPin);

    if (!/^\d{6}$/.test(otp)) {
      setWalletPinResetError("Enter the 6-digit OTP sent to your email.");
      return;
    }

    if (strengthError) {
      setWalletPinResetError(strengthError);
      return;
    }

    if (nextPin !== confirmPin) {
      setWalletPinResetError("Wallet PIN confirmation does not match.");
      return;
    }

    try {
      setResettingWalletPin(true);
      const response = await withTopProgress(() =>
        resetWalletPinWithOtp({ otp, pin: nextPin }),
      );
      await refreshDbUser();
      setWalletPinSet(Boolean(response.user.has_wallet_pin));
      setWalletPinCurrent("");
      setWalletPinNew("");
      setWalletPinConfirm("");
      setWalletPinResetOpen(false);
      setSettingsMessage("Wallet PIN reset successfully.");
    } catch (error) {
      setWalletPinResetError(
        error instanceof Error ? error.message : "Could not reset wallet PIN.",
      );
    } finally {
      setResettingWalletPin(false);
    }
  }

  async function handleDeleteFriend(friend: Friend) {
    const previousFriends = friends;

    setDeletingFriendId(friend.id);
    setFriendDeleteMessage("");
    setFriendDeleteError("");
    setFriends((prev) => prev.filter((item) => item.id !== friend.id));

    try {
      await withTopProgress(async () => {
        await deleteFriend(friend.id);
      });

      window.dispatchEvent(new Event("splitverse:data-updated"));
      setFriendDeleteMessage(`${getFriendLabel(friend)} was removed.`);
    } catch (error) {
      setFriends(previousFriends);
      setFriendDeleteError(
        `${
          error instanceof Error ? error.message : "Could not delete friend."
        } ${getFriendLabel(friend)} was restored to your list.`,
      );
    } finally {
      setDeletingFriendId("");
    }
  }

  async function handleDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canDeleteAccount) {
      setDeleteError(`Type ${deleteAccountConfirmationText} to continue.`);
      return;
    }

    setDeletingAccount(true);
    setDeleteError("");

    try {
      await withTopProgress(async () => {
        await deleteAccount(deleteConfirmation);
        await logout();
      });
      navigate("/", { replace: true });
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Could not delete account. Please try again.",
      );
    } finally {
      setDeletingAccount(false);
    }
  }

  async function handleDownloadMyData() {
    setSettingsMessage("");
    setSettingsError("");
    setDownloadingData(true);

    try {
      const serverData = await withTopProgress(downloadMyData);
      const exportedAt = new Date();

      downloadJsonFile(
        `splitverse-data-${exportedAt.toISOString().slice(0, 10)}.json`,
        {
          ...serverData,
          localSettings: {
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
          },
        },
      );

      setSettingsMessage("Your SplitVerse data export was downloaded.");
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not download your SplitVerse data.",
      );
    } finally {
      setDownloadingData(false);
    }
  }

  function handleClearLocalSettings() {
    const confirmed = window.confirm(
      "Clear local app settings? This resets only this browser's SplitVerse preferences like currency, top-up method, privacy mode, and notification toggles. Your account, friends, wallet, and expenses will not be deleted.",
    );

    if (!confirmed) {
      return;
    }

    clearLocalAppSettings();
    setSettingsError("");
    setSettingsMessage("Local app settings were reset for this browser.");
  }

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
                  Hide your profile picture and show first and last initials to
                  friends.
                </small>
              </span>
              <input
                type="checkbox"
                checked={avatarId === "initials"}
                disabled={profileSaving || profileLoading}
                onChange={(event) =>
                  handleAvatarModeChange(event.target.checked)
                }
              />
            </label>
          </div>

          <form
            className="profile-photo-settings"
            onSubmit={handleSaveProfilePhoto}
          >
            <div className="profile-photo-preview-row">
              <div className="profile-photo-preview">
                {profilePreviewUrl ? (
                  <img src={profilePreviewUrl} alt="Profile preview" />
                ) : (
                  <span>{profileInitials}</span>
                )}
              </div>
              <div className="profile-photo-copy">
                <strong>Profile photo update</strong>
                <small>
                  Upload a profile photo securely. New uploads are stored on
                  Cloudinary; old URL fallback still works.
                </small>
                <label className="settings-field profile-photo-upload-field">
                  <span>Upload profile photo</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={profileSaving || profileLoading}
                    onChange={(event) =>
                      handleProfilePhotoFileChange(event.target.files?.[0] ?? null)
                    }
                  />
                  {profilePhotoFile && (
                    <small>{profilePhotoFile.name}</small>
                  )}
                </label>
                <label className="settings-field profile-photo-url-field">
                  <span>Or paste image URL</span>
                  <input
                    type="url"
                    placeholder="https://example.com/photo.jpg"
                    value={profilePhotoUrl}
                    disabled={profileSaving || profileLoading || Boolean(profilePhotoFile)}
                    autoComplete="off"
                    onChange={(event) => {
                      setProfilePhotoFile(null);
                      setProfilePhotoUrl(event.target.value);
                    }}
                  />
                </label>
              </div>
            </div>

            <button
              className="dashboard-secondary-button"
              type="submit"
              disabled={profileSaving || profileLoading}
            >
              <ImagePlus size={16} />
              {profileSaving ? "Saving profile" : "Save profile photo"}
            </button>
          </form>
        </article>

        <article className="bento-card settings-card currency-language-card">
          <div className="bento-card-head">
            <div>
              <span>Application currency</span>
              <h2>Money display</h2>
            </div>
            <Coins size={22} />
          </div>


          <div className="settings-locale-grid">
            <label className="settings-field">
              <span>Use this currency across the app</span>
              <Dropdown
                ariaLabel="Application currency"
                value={appCurrency}
                options={currencyOptions}
                onChange={handleAppCurrencyChange}
              />
            </label>

            <label className="settings-field">
              <span>Application language</span>
              <Dropdown
                ariaLabel="Application language"
                value={appLanguage}
                options={languageOptions}
                onChange={handleAppLanguageChange}
              />
            </label>
          </div>

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
            <strong>{formatCurrencyValue(convertedAmount, converterTo)}</strong>
          </div>
          <p className="dashboard-muted-text">{exchangeRateStatusText}</p>
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
                onChange={(event) =>
                  setSettlementReminders(event.target.checked)
                }
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

        <article className="bento-card settings-card">
          <div className="bento-card-head">
            <div>
              <span>Wallet defaults</span>
              <h2>Payment safety</h2>
            </div>
            <WalletCards size={22} />
          </div>

          <label className="settings-field">
            <span>Default wallet top-up method</span>
            <Dropdown
              ariaLabel="Default wallet top-up method"
              value={defaultTopUpMethod}
              options={topUpMethodOptions}
              onChange={setDefaultTopUpMethod}
            />
          </label>

          <div className="settings-toggle-list compact">
            <label>
              <ShieldCheck size={19} />
              <span>
                <strong>Ask before wallet payment</strong>
                <small>
                  Show a confirmation before paying split-room dues from wallet.
                </small>
              </span>
              <input
                type="checkbox"
                checked={confirmBeforeWalletPayment}
                onChange={(event) =>
                  setConfirmBeforeWalletPayment(event.target.checked)
                }
              />
            </label>
          </div>

          <form className="wallet-pin-form" onSubmit={handleSaveWalletPin}>
            <div className="wallet-pin-head">
              <strong>Change wallet PIN</strong>
              <small>
                Use your old PIN to set a new 4 to 6 digit wallet PIN.
              </small>
            </div>

            <label className="settings-field">
              <span>Old PIN</span>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={walletPinCurrent}
                disabled={savingWalletPin || profileLoading}
                onChange={(event) =>
                  setWalletPinCurrent(normalizePinInput(event.target.value))
                }
              />
            </label>

            <div className="wallet-pin-grid">
              <label className="settings-field">
                <span>New PIN</span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={walletPinNew}
                  disabled={savingWalletPin || profileLoading}
                  onChange={(event) =>
                    setWalletPinNew(normalizePinInput(event.target.value))
                  }
                />
              </label>
              <label className="settings-field">
                <span>Confirm new PIN</span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={walletPinConfirm}
                  disabled={savingWalletPin || profileLoading}
                  onChange={(event) =>
                    setWalletPinConfirm(normalizePinInput(event.target.value))
                  }
                />
              </label>
            </div>

            <div className="wallet-pin-actions-row">
              <button
                className="dashboard-secondary-button"
                type="submit"
                disabled={savingWalletPin || profileLoading || !walletPinSet}
              >
                <ShieldCheck size={16} />
                {savingWalletPin ? "Changing PIN" : "Change wallet PIN"}
              </button>

              <button
                className="wallet-pin-forgot-button"
                type="button"
                onClick={openForgotWalletPinDialog}
                disabled={savingWalletPin || profileLoading || !walletPinSet}
              >
                Forgot old PIN?
              </button>
            </div>
          </form>
        </article>

        <article className="bento-card settings-card">
          <div className="bento-card-head">
            <div>
              <span>Notifications</span>
              <h2>Preference center</h2>
            </div>
            <Mail size={22} />
          </div>

          <div className="settings-toggle-list">
            <label>
              <UsersRound size={19} />
              <span>
                <strong>Friend request emails</strong>
                <small>Allow email invites and friend request updates.</small>
              </span>
              <input
                type="checkbox"
                checked={notificationPreferences.friendRequestEmails}
                onChange={(event) =>
                  setNotificationPreference(
                    "friendRequestEmails",
                    event.target.checked,
                  )
                }
              />
            </label>
            <label>
              <ShieldCheck size={19} />
              <span>
                <strong>Login OTP emails</strong>
                <small>Receive email login codes for safer sign-in.</small>
              </span>
              <input
                type="checkbox"
                checked={notificationPreferences.loginOtpEmails}
                onChange={(event) =>
                  setNotificationPreference(
                    "loginOtpEmails",
                    event.target.checked,
                  )
                }
              />
            </label>
            <label>
              <BellRing size={19} />
              <span>
                <strong>Settlement reminder emails</strong>
                <small>Allow reminders for pending balances and dues.</small>
              </span>
              <input
                type="checkbox"
                checked={notificationPreferences.settlementReminderEmails}
                onChange={(event) =>
                  setNotificationPreference(
                    "settlementReminderEmails",
                    event.target.checked,
                  )
                }
              />
            </label>
            <label>
              <CreditCard size={19} />
              <span>
                <strong>Room due notifications</strong>
                <small>
                  Show room dues and wallet payment alerts in the app.
                </small>
              </span>
              <input
                type="checkbox"
                checked={notificationPreferences.roomDueNotifications}
                onChange={(event) =>
                  setNotificationPreference(
                    "roomDueNotifications",
                    event.target.checked,
                  )
                }
              />
            </label>
          </div>
        </article>

        <article className="bento-card settings-card friend-delete-card">
          <div className="bento-card-head">
            <div>
              <span>Friend control</span>
              <h2>Delete a friend</h2>
            </div>
            <UsersRound size={22} />
          </div>

          <label className="settings-field friend-search-field">
            <Search size={18} />
            <span>Search friend to delete</span>
            <input
              type="search"
              placeholder="Search by name or email"
              value={friendSearch}
              onChange={(event) => setFriendSearch(event.target.value)}
            />
          </label>

          <div className="settings-friend-delete-list">
            {friendsLoading && (
              <p className="dashboard-muted-text">Loading friends...</p>
            )}
            {!friendsLoading && friends.length === 0 && (
              <p className="dashboard-muted-text">No friends to delete.</p>
            )}
            {!friendsLoading &&
              friends.length > 0 &&
              visibleFriends.length === 0 && (
                <p className="dashboard-muted-text">
                  You are not friends with {trimmedFriendSearch}.
                </p>
              )}
            {visibleFriends.map((friend) => (
              <article className="settings-friend-card" key={friend.id}>
                <div className="settings-friend-main">
                  {getFriendAvatarUrl(friend) ? (
                    <img
                      className="settings-friend-avatar"
                      src={getFriendAvatarUrl(friend)}
                      alt=""
                    />
                  ) : (
                    <span className="settings-friend-avatar">
                      {getFriendInitials(friend)}
                    </span>
                  )}

                  <div className="settings-friend-info">
                    <strong>{getFriendLabel(friend)}</strong>
                    <span>{friend.email}</span>
                    <small>{formatFriendshipAge(friend.friendship_days)}</small>
                  </div>
                </div>

                <button
                  className="settings-danger-button settings-friend-delete-button"
                  type="button"
                  onClick={() => handleDeleteFriend(friend)}
                  disabled={deletingFriendId === friend.id}
                >
                  <Trash2 size={15} />
                  {deletingFriendId === friend.id ? "Deleting" : "Remove"}
                </button>
              </article>
            ))}
          </div>

          {(friendDeleteMessage || friendDeleteError) && (
            <p
              className={
                friendDeleteError
                  ? "settings-inline-message error"
                  : "settings-inline-message"
              }
            >
              {friendDeleteError || friendDeleteMessage}
            </p>
          )}
        </article>

        <article className="bento-card settings-card danger-zone-card">
          <div className="bento-card-head">
            <div>
              <span>Danger zone</span>
              <h2>Account control</h2>
            </div>
            <AlertTriangle size={22} />
          </div>
          <p>
            Download your SplitVerse data, reset this browser's local settings,
            or permanently delete your account after all dues are cleared.
          </p>

          <div className="settings-danger-actions">
            <button
              className="settings-safe-button"
              type="button"
              onClick={handleDownloadMyData}
              disabled={downloadingData}
            >
              <Download size={17} />
              {downloadingData ? "Preparing data" : "Download my data"}
            </button>
            <button
              className="settings-outline-danger-button"
              type="button"
              onClick={handleClearLocalSettings}
            >
              <RotateCcw size={17} />
              Clear local app settings
            </button>
            <button
              className="settings-danger-button settings-delete-account-button"
              type="button"
              onClick={() => {
                setDeleteConfirmation("");
                setDeleteError("");
                setDeleteDialogOpen(true);
              }}
            >
              <Trash2 size={17} />
              Delete account
            </button>
          </div>

          {settingsError && (
            <p
              className="settings-inline-message error"
            >
              {settingsError}
            </p>
          )}
        </article>
      </section>

      {settingsMessage && (
        <div className="settings-bottom-toast" role="status" aria-live="polite">
          {settingsMessage}
        </div>
      )}

      {walletPinResetOpen && (
        <div className="transaction-export-backdrop" role="presentation">
          <form
            className="transaction-export-dialog wallet-pin-reset-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-pin-reset-title"
            onSubmit={handleResetWalletPin}
          >
            <div className="transaction-export-head">
              <div>
                <span>Forgot wallet PIN</span>
                <h2 id="wallet-pin-reset-title">Reset with email OTP</h2>
              </div>
              <button
                type="button"
                aria-label="Close wallet PIN reset dialog"
                onClick={() => setWalletPinResetOpen(false)}
                disabled={requestingWalletPinReset || resettingWalletPin}
              >
                <X size={18} />
              </button>
            </div>

            <div className="account-delete-warning wallet-pin-reset-warning">
              <Mail size={18} />
              <p>
                We will send a 6-digit OTP to your registered email. The OTP
                expires quickly and can be used only once.
              </p>
            </div>

            <button
              className="dashboard-secondary-button wallet-pin-otp-button"
              type="button"
              onClick={handleRequestWalletPinResetOtp}
              disabled={requestingWalletPinReset || resettingWalletPin}
            >
              <Mail size={16} />
              {requestingWalletPinReset ? "Sending OTP" : "Send OTP to email"}
            </button>

            <label>
              <span>Email OTP</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={walletPinResetOtp}
                disabled={resettingWalletPin}
                onChange={(event) =>
                  setWalletPinResetOtp(normalizePinInput(event.target.value))
                }
                autoComplete="one-time-code"
              />
            </label>

            <div className="wallet-pin-grid">
              <label>
                <span>New wallet PIN</span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={walletPinResetNew}
                  disabled={resettingWalletPin}
                  onChange={(event) =>
                    setWalletPinResetNew(normalizePinInput(event.target.value))
                  }
                />
              </label>
              <label>
                <span>Confirm new PIN</span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={walletPinResetConfirm}
                  disabled={resettingWalletPin}
                  onChange={(event) =>
                    setWalletPinResetConfirm(normalizePinInput(event.target.value))
                  }
                />
              </label>
            </div>

            {(walletPinResetMessage || walletPinResetError) && (
              <p
                className={
                  walletPinResetError
                    ? "transaction-export-message error"
                    : "transaction-export-message"
                }
              >
                {walletPinResetError || walletPinResetMessage}
              </p>
            )}

            <div className="transaction-export-actions">
              <button
                className="dashboard-secondary-button"
                type="button"
                onClick={() => setWalletPinResetOpen(false)}
                disabled={resettingWalletPin}
              >
                Cancel
              </button>
              <button
                className="dashboard-primary-button"
                type="submit"
                disabled={resettingWalletPin}
              >
                {resettingWalletPin ? "Resetting PIN" : "Reset wallet PIN"}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteDialogOpen && (
        <div className="transaction-export-backdrop" role="presentation">
          <form
            className="transaction-export-dialog account-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-delete-title"
            onSubmit={handleDeleteAccount}
          >
            <div className="transaction-export-head">
              <div>
                <span>Delete account</span>
                <h2 id="account-delete-title">Confirm permanent deletion</h2>
              </div>
              <button
                type="button"
                aria-label="Close delete account dialog"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={deletingAccount}
              >
                <X size={18} />
              </button>
            </div>

            <div className="account-delete-warning">
              <AlertTriangle size={18} />
              <p>
                Your account can be deleted only after your wallet balance is
                zero and all pending dues are cleared.
              </p>
            </div>

            <label>
              <span>Type {deleteAccountConfirmationText}</span>
              <input
                type="text"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                disabled={deletingAccount}
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            {deleteError && (
              <p className="transaction-export-message">{deleteError}</p>
            )}

            <div className="transaction-export-actions">
              <button
                className="dashboard-secondary-button"
                type="button"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={deletingAccount}
              >
                Cancel
              </button>
              <button
                className="settings-danger-button"
                type="submit"
                disabled={deletingAccount || !canDeleteAccount}
              >
                {deletingAccount ? "Deleting account" : "Delete account"}
              </button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}
