import React from "react";
import { Button } from "@/components/ui/button";

function getInitials(name: string | null) {
  if (!name) return "U";
  const trimmed = name.trim();
  if (!trimmed) return "U";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function ProfileHeader({
  username,
  onDeposit,
  onWithdraw,
}: {
  username: string | null;
  onDeposit: () => void;
  onWithdraw: () => void;
}) {
  const initials = getInitials(username);

  return (
    <div className="flex w-full items-center justify-between rounded-md border border-hairline bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-sm font-semibold">
          {initials}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium">{username || "User"}</span>
          <span className="text-xs text-muted-foreground">Account</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onDeposit}>
          Deposit
        </Button>
        <Button size="sm" variant="outline" onClick={onWithdraw}>
          Withdraw
        </Button>
      </div>
    </div>
  );
}
