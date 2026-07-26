import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/useAuth";
import DashboardPageLoader from "../pageloaders/DashboardPageLoader";
import MandatoryWalletPinSetup from "./MandatoryWalletPinSetup";
import type { DashboardLoaderVariant } from "../pageloaders/DashboardPageLoader";

type ProtectedRouteProps = {
  children: ReactNode;
  loaderVariant?: DashboardLoaderVariant;
};

export default function ProtectedRoute({
  children,
  loaderVariant = "dashboard",
}: ProtectedRouteProps) {
  const { user, dbUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <DashboardPageLoader variant={loaderVariant} />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const needsGoogleUsername = Boolean(
    dbUser &&
      !dbUser.username &&
      ["google", "google.com"].includes(String(dbUser.provider || "")),
  );

  if (dbUser && (dbUser.has_wallet_pin === false || needsGoogleUsername)) {
    return <MandatoryWalletPinSetup />;
  }

  return <>{children}</>;
}
