import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Trade from "@/pages/Trade";
import Dashboard from "@/pages/Dashboard";
import SigninPage from "@/pages/auth/SigninPage";
import SignupPage from "@/pages/auth/SignupPage";
import "./index.css";

export function App() {
  return (
    <div className="relative z-0 flex min-h-screen flex-col text-white">
      <Navbar />
      <main className="flex flex-1 flex-col bg-background">
        <Routes>
          <Route path="/" element={<Navigate to="/trade" replace />} />
          <Route path="/trade" element={<Trade />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/signin" element={<SigninPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;