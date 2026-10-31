import React from "react";
import { Route, Routes } from "react-router-dom";
import Navbar from "@/components/Navbar";
import LandingPage from "@/pages/LandingPage";
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
          <Route path="/" element={<LandingPage />} />
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