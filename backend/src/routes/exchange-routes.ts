import { Router } from "express";
import {
  cancelOrder,
  createOrder,
  getBalance,
  getDepth,
  getOrder,
  getTradeHistory,
  addBalance,
  withdrawBalance,
  getOrders,
  getFills,
  getOpenOrders
} from "../controllers/exchange-controller.js";
import { requireAuth } from "../utils/auth.js";
import { asyncHandler } from "../utils/async-handler.js";

export const exchangeRouter = Router();

exchangeRouter.post("/order", requireAuth, asyncHandler(createOrder));
// Market data is public: the orderbook is needed before signing in.
exchangeRouter.get("/depth/:symbol", asyncHandler(getDepth));
exchangeRouter.get("/trades/:symbol", asyncHandler(getTradeHistory));
exchangeRouter.get("/balance", requireAuth, asyncHandler(getBalance));
exchangeRouter.post('/balance', requireAuth, asyncHandler(addBalance));
exchangeRouter.post('/balance/withdraw', requireAuth, asyncHandler(withdrawBalance));
exchangeRouter.get("/order/:orderId", requireAuth, asyncHandler(getOrder));
exchangeRouter.delete("/order/:orderId", requireAuth, asyncHandler(cancelOrder));
exchangeRouter.get("/orders", requireAuth, asyncHandler(getOrders));
exchangeRouter.get("/orders/open", requireAuth, asyncHandler(getOpenOrders));
exchangeRouter.get("/fills", requireAuth, asyncHandler(getFills));
