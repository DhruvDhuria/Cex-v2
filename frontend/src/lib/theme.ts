const THEME_FALLBACKS = {
  "--accent": "#b8f36b",
  "--negative": "#f87171",
} as const;

export type ThemeColorVariable = keyof typeof THEME_FALLBACKS;

/**
 * Canvas-based libraries such as lightweight-charts cannot consume Tailwind
 * utility classes or reliably resolve CSS custom properties themselves.
 * Resolve the theme token to a concrete color string at runtime instead.
 */
export function getThemeColor(variable: ThemeColorVariable): string {
  if (typeof document === "undefined") {
    return THEME_FALLBACKS[variable];
  }

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();

  return value || THEME_FALLBACKS[variable];
}

/** Applies alpha to a hex theme color, returning a canvas-safe rgba string. */
export function withAlpha(color: string, alpha: number): string {
  if (!color.startsWith("#")) return color;

  const hex = color.slice(1);
  const normalized =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : hex;

  if (normalized.length !== 6) return color;

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  if (![red, green, blue].every(Number.isFinite)) return color;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
