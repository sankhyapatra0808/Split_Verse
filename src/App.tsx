import { lazy, Suspense, type ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardPageLoader from "./pageloaders/DashboardPageLoader";
import type { DashboardLoaderVariant } from "./pageloaders/DashboardPageLoader";

const Home = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/auth/Login"));
const Signup = lazy(() => import("./pages/auth/Signup"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const SharedSplitRooms = lazy(() => import("./pages/SharedSplitRooms"));
const WalletBalance = lazy(() => import("./pages/WalletBalance"));
const WalletTopUp = lazy(() => import("./pages/WalletTopUp"));
const TransactionHistory = lazy(() => import("./pages/TransactionHistory"));

function publicPage(page: ReactNode) {
  return <Suspense fallback={null}>{page}</Suspense>;
}

function dashboardPage(page: ReactNode, loaderVariant: DashboardLoaderVariant) {
  return (
    <ProtectedRoute loaderVariant={loaderVariant}>
      <Suspense fallback={<DashboardPageLoader variant={loaderVariant} />}>
        {page}
      </Suspense>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={publicPage(<Home />)} />
      <Route path="/login" element={publicPage(<Login />)} />
      <Route path="/signup" element={publicPage(<Signup />)} />
      <Route path="/forgot-password" element={publicPage(<ForgotPassword />)} />

      <Route path="/dashboard" element={dashboardPage(<Dashboard />, "dashboard")} />
      <Route path="/split-rooms" element={dashboardPage(<SharedSplitRooms />, "splitRooms")} />
      <Route path="/wallet" element={dashboardPage(<WalletBalance />, "wallet")} />
      <Route path="/wallet-top-up" element={dashboardPage(<WalletTopUp />, "walletTopUp")} />
      <Route path="/transactions" element={dashboardPage(<TransactionHistory />, "transactions")} />
    </Routes>
  );
}

export default App;
