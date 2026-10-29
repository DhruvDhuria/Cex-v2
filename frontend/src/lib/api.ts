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

/** Channels published by the ws-server. */
export type WsChannelKind = "depth" | "trades" | "ticker";

export function wsChannel(symbol: string, kind: WsChannelKind): string {
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

// An expired / invalid token must not leave the UI in a "signed in" state
// where every request silently fails.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearToken();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/sign")) {
        window.location.assign("/signin");
      }
    }
    return Promise.reject(error);
  },
);

const USERNAME_KEY = "cex_username";

export function getToken(): string | null {
  return typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;
}

export function setToken(token: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TOKEN_KEY, token);
  }
}

export function setUsername(username: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(USERNAME_KEY, username);
  }
}

export function getUsername(): string | null {
  return typeof window !== "undefined" ? window.localStorage.getItem(USERNAME_KEY) : null;
}

export function clearToken(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USERNAME_KEY);
  }
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
  lastTradedPrice?: number | null;
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

export interface TradeRecord {
  price: number;
  qty: number;
  ts: number;
}

export async function fetchTradeHistory(
  symbol: string,
  limit = 1000,
): Promise<TradeRecord[]> {
  const { data } = await api.get<{ trades: TradeRecord[] }>(`/trades/${symbol}`, {
    params: { limit },
  });
  return data.trades ?? [];
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

export interface Order {
  id: string;
  userId: string;
  market: string;
  price: number | null;
  quantity: number;
  type: string;
  side: string;
  filledQuantity: number;
  status: string;
}

export interface FillRecord {
  id: string;
  quantity: number;
  side: string;
  type: string;
  userId: string;
  price: number;
  asset: string;
  orignalOrderId: string;
}

export async function fetchOrders(): Promise<Order[]> {
  const { data } = await api.get<{ orders: Order[] } | Order[]>("/orders");
  if (Array.isArray(data)) return data;
  return data.orders ?? [];
}

export async function fetchOpenOrders(): Promise<Order[]> {
  const { data } = await api.get<{ orders: Order[] } | Order[]>("/orders/open");
  if (Array.isArray(data)) return data;
  return data.orders ?? [];
}

export async function fetchFills(): Promise<FillRecord[]> {
  const { data } = await api.get<{ fills: FillRecord[] } | FillRecord[]>("/fills");
  if (Array.isArray(data)) return data;
  return data.fills ?? [];
}