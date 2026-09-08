import axios from "axios";

export const SUPPORTED_SYMBOLS = ["BTC", "ETH", "SOL"] as const;
export type Symbol_ = (typeof SUPPORTED_SYMBOLS)[number];

export const SUPPORTED_ASSETS = ["usd", "BTC", "ETH", "SOL"] as const;
export type FundingAsset = (typeof SUPPORTED_ASSETS)[number];

export const ASSET_LABELS: Record<FundingAsset, string> = {
  usd: "USD",
  BTC: "BTC",
  ETH: "ETH",
  SOL: "SOL",
};

export function quotePair(symbol: string): string {
  return `${symbol}_USD`;
}

export function wsChannel(symbol: string, kind: "depth" | "trades" | "bookticker"): string {
  return `${kind}.${quotePair(symbol)}`;
}

const TOKEN_KEY = "cex_jwt";

export const API_BASE_URL = "http://localhost:3000";

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function getToken(): string | null {
  return typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";

export interface PlaceOrderInput {
  type: OrderType;
  side: OrderSide;
  symbol: string;
  price?: number;
  qty: number;
}

export interface Fill {
  fillId: string;
  symbol: string;
  price: number;
  qty: number;
  type: string;
  orderId: string;
  createdAt: number;
}

export interface CreateOrderResponse {
  orderId: string;
  status: string;
  filledQty: number;
  averagePrice: string;
  fills: Fill[];
}

export interface DepthLevel {
  price: number;
  qty: number;
}

export interface DepthResponse {
  symbol: string;
  asks: DepthLevel[];
  bids: DepthLevel[];
}

export interface Balance {
  available: number;
  locked: number;
}

export type Balances = Record<string, Balance>;

export async function placeOrder(input: PlaceOrderInput): Promise<CreateOrderResponse> {
  const { data } = await api.post<CreateOrderResponse>("/order", input);
  return data;
}

export async function fetchDepth(symbol: string): Promise<DepthResponse> {
  const { data } = await api.get<DepthResponse>(`/depth/${symbol}`);
  return data;
}

export async function fetchBalance(): Promise<Balances> {
  const { data } = await api.get<{ balance: Balances | null }>("/balance");
  return data.balance ?? {};
}

export async function addBalance(symbol: string, amount: number): Promise<Balances> {
  const { data } = await api.post<{ balance: Balances }>("/balance", { symbol, amount });
  return data.balance ?? {};
}

export async function withdrawBalance(symbol: string, amount: number): Promise<Balances> {
  const { data } = await api.post<{ balance: Balances }>("/balance/withdraw", { symbol, amount });
  return data.balance ?? {};
}