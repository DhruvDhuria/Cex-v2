import React from "react";
import Balance from "@/components/Balance";
import { useSearchParams } from "react-router-dom";

export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") === "withdraw" ? "withdraw" : "add";

  return (
    <div className="flex flex-col items-center gap-6">
      <Balance initialMode={initialMode} />
    </div>
  );
}
