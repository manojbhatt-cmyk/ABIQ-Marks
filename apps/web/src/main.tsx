import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { token } from "./api";
import Shell, { homeFor } from "./components/Shell";
import { AppProvider, useApp } from "./context";
import { installDisplayFilter } from "./display";
import "./index.css";
import Admin from "./pages/Admin";
import Approvals from "./pages/Approvals";
import Ask from "./pages/Ask";
import Committee from "./pages/Committee";
import Dashboard from "./pages/Dashboard";
import Distribution from "./pages/Distribution";
import Inbox from "./pages/Inbox";
import Intake from "./pages/Intake";
import Kickoff from "./pages/Kickoff";
import Lincoln from "./pages/Lincoln";
import Lineage from "./pages/Lineage";
import Loans from "./pages/Loans";
import LoanWorkspace from "./pages/LoanWorkspace";
import Login from "./pages/Login";
import Messages from "./pages/Messages";
import Work from "./pages/Work";
import Monthly from "./pages/Monthly";
import PricingList from "./pages/PricingList";
import Reconciliation from "./pages/Reconciliation";
import Reviews from "./pages/Reviews";
import Tracker from "./pages/Tracker";
import Universe from "./pages/Universe";

function Protected() {
  const { user } = useApp();
  const loc = useLocation();
  if (!token()) return <Navigate to="/login" replace />;
  if (!user) return <div className="p-10 text-sm text-slate-400">Loading...</div>;
  return (
    <Shell>
      <ErrorBoundary resetKey={loc.pathname}>
      <Routes>
        <Route path="/" element={<Navigate to={homeFor(user.role)} replace />} />
        <Route path="/work" element={<Work />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/universe" element={<Universe />} />
        <Route path="/kickoff" element={<Kickoff />} />
        <Route path="/intake" element={<Intake />} />
        <Route path="/lincoln" element={<Lincoln />} />
        <Route path="/loans" element={<Loans />} />
        <Route path="/loans/:id" element={<LoanWorkspace />} />
        <Route path="/loans/:id/:tab" element={<LoanWorkspace />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/pricing" element={<PricingList />} />
        <Route path="/tracker" element={<Tracker />} />
        <Route path="/committee" element={<Committee />} />
        <Route path="/committee/:tab" element={<Committee />} />
        <Route path="/reconciliation" element={<Reconciliation />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/distribution" element={<Distribution />} />
        <Route path="/monthly" element={<Monthly />} />
        <Route path="/ask" element={<Ask />} />
        <Route path="/lineage" element={<Lineage />} />
        <Route path="/lineage/:id" element={<Lineage />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ErrorBoundary>
    </Shell>
  );
}

installDisplayFilter();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<Protected />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  </React.StrictMode>,
);
