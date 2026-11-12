function getInitials(name: string | null) {
  if (!name) return "U";
  const trimmed = name.trim();
  if (!trimmed) return "U";
  const parts = trimmed.split(/\s+/);
  const first = parts[0] ?? "";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const second = parts[1] ?? "";
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}

export default function ProfileHeader({
  username,
}: {
  username: string | null;
}) {
  const initials = getInitials(username);

  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md border border-hairline bg-surface px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold">
          {initials}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{username || "User"}</span>
          <span className="text-xs text-muted-foreground">Account</span>
        </div>
      </div>
    </div>
  );
}
