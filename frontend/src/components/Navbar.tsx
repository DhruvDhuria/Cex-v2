import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { clearToken, getToken } from "@/lib/api";

const LOGO_NAME = "CoinPulse";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition-colors ${
    isActive ? "text-white" : "text-gray-400 hover:text-white"
  }`;

export default function Navbar() {
  const navigate = useNavigate();
  const authed = Boolean(getToken());

  const handleSignOut = () => {
    clearToken();
    if (typeof window !== "undefined") {
      localStorage.removeItem("cex_username");
    }
    navigate("/trade");
  };

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link to="/trade" className="text-lg font-bold tracking-tight text-white">
            {LOGO_NAME}
          </Link>
          <nav className="flex items-center gap-4">
            <NavLink to="/trade" className={navLinkClass}>
              Trade
            </NavLink>
            <NavLink to="/dashboard" className={navLinkClass}>
              Dashboard
            </NavLink>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {authed ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link to="/dashboard?mode=add">Deposit</Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="outline" size="sm">
                <Link to="/signup">Sign up</Link>
              </Button>
              <Button asChild variant="default" size="sm">
                <Link to="/signin">Sign in</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
