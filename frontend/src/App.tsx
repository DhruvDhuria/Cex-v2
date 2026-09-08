import React from "react";
import Orderbook from "./components/Orderbook";
import Trades from "./components/Trades";
import PlaceOrder from "./components/PlaceOrder";
import Balance from "./components/Balance";
import Signin from "./pages/auth/Signin";
import Signup from "./pages/auth/Signup";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clearToken, getToken, SUPPORTED_SYMBOLS, type Symbol_ } from "@/lib/api";
import "./index.css";

export function App() {
  const [symbol, setSymbol] = React.useState<Symbol_>("BTC");
  const [authed, setAuthed] = React.useState(() => Boolean(getToken()));
  const [authMode, setAuthMode] = React.useState<"signin" | "signup">("signup");

  const handleSignOut = () => {
    clearToken();
    setAuthed(false);
  };

  return (
    <div className="relative z-10 flex flex-col text-white items-center gap-6 p-8">
      {!authed && (
        <div className="flex w-80 flex-col gap-4 rounded-lg bg-slate-950 p-6 text-sm">
          <div className="flex justify-between">
            <Button
              variant="ghost"
              size="sm"
              className={authMode === "signin" ? "bg-foreground/10" : ""}
              onClick={() => setAuthMode("signin")}
            >
              Sign in
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={authMode === "signup" ? "bg-foreground/10" : ""}
              onClick={() => setAuthMode("signup")}
            >
              Sign up
            </Button>
          </div>
          {authMode === "signin" ? <Signin /> : <Signup />}
        </div>
      )}

      <div className="flex items-center justify-center gap-4">
        <Select value={symbol} onValueChange={(v) => setSymbol(v as Symbol_)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_SYMBOLS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {authed && (
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        )}
      </div>

      <div className="flex items-start justify-center gap-4">
        <Orderbook symbol={symbol} />
        <Trades symbol={symbol} />
        <PlaceOrder symbol={symbol} />
        <Balance />
      </div>
    </div>
  );
}

export default App;