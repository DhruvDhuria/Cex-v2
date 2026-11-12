import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Navbar from "@/components/Navbar";
import LandingPage from "@/pages/LandingPage";
import Trade from "@/pages/Trade";
import Dashboard from "@/pages/Dashboard";
import SigninPage from "@/pages/auth/SigninPage";
import SignupPage from "@/pages/auth/SignupPage";
import { getToken } from "@/lib/api";
import "./index.css";

export function App() {
  // Read the location so sign-in/out navigations re-evaluate the token below.
  useLocation();
  const authed = Boolean(getToken());

  return (
    <div className="relative z-0 flex min-h-screen flex-col text-white">
      <Navbar />
      <main className="flex flex-1 flex-col bg-background">
        <Routes>
          <Route
            path="/"
            element={authed ? <Navigate to="/trade" replace /> : <LandingPage />}
          />
          <Route path="/trade" element={<Trade />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route
            path="/signin"
            element={authed ? <Navigate to="/trade" replace /> : <SigninPage />}
          />
          <Route
            path="/signup"
            element={authed ? <Navigate to="/trade" replace /> : <SignupPage />}
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;