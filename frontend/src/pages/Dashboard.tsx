import React from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchFills, fetchOpenOrders, fetchOrders, getToken, getUsername, type FillRecord, type Order } from "@/lib/api";
import ProfileHeader from "@/components/ProfileHeader";
import BalancesPanel from "@/components/BalancesPanel";
import DepositWithdrawModal from "@/components/DepositWithdrawModal";

function OrdersTable({ orders, title }: { orders: Order[]; title: string }) {
  return (
    <div className="w-full overflow-hidden rounded-md border border-hairline bg-surface">
      <div className="flex h-9 items-center justify-between border-b border-hairline px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</h2>
      </div>
      <div className="overflow-x-auto p-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4">Market</th>
              <th className="pb-2 pr-4">Side</th>
              <th className="pb-2 pr-4">Type</th>
              <th className="pb-2 pr-4">Price</th>
              <th className="pb-2 pr-4">Qty</th>
              <th className="pb-2 pr-4">Filled</th>
              <th className="pb-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td className="py-2 text-xs text-muted-foreground" colSpan={7}>
                  No orders
                </td>
              </tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-hairline">
                <td className="py-2 pr-4">{o.market}</td>
                <td className="py-2 pr-4 uppercase">{o.side}</td>
                <td className="py-2 pr-4 uppercase">{o.type}</td>
                <td className="py-2 pr-4">{o.price ?? "-"}</td>
                <td className="py-2 pr-4">{o.quantity}</td>
                <td className="py-2 pr-4">{o.filledQuantity}</td>
                <td className="py-2 pr-4 uppercase">{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FillsTable({ fills }: { fills: FillRecord[] }) {
  return (
    <div className="w-full overflow-hidden rounded-md border border-hairline bg-surface">
      <div className="flex h-9 items-center justify-between border-b border-hairline px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">Fills</h2>
      </div>
      <div className="overflow-x-auto p-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4">Asset</th>
              <th className="pb-2 pr-4">Side</th>
              <th className="pb-2 pr-4">Type</th>
              <th className="pb-2 pr-4">Price</th>
              <th className="pb-2 pr-4">Qty</th>
              <th className="pb-2 pr-4">Order</th>
            </tr>
          </thead>
          <tbody>
            {fills.length === 0 && (
              <tr>
                <td className="py-2 text-xs text-muted-foreground" colSpan={6}>
                  No fills
                </td>
              </tr>
            )}
            {fills.map((f) => (
              <tr key={f.id} className="border-t border-hairline">
                <td className="py-2 pr-4">{f.asset}</td>
                <td className="py-2 pr-4 uppercase">{f.side}</td>
                <td className="py-2 pr-4 uppercase">{f.type}</td>
                <td className="py-2 pr-4">{f.price}</td>
                <td className="py-2 pr-4">{f.quantity}</td>
                <td className="py-2 pr-4 truncate max-w-[200px]">{f.orignalOrderId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") === "withdraw" ? "withdraw" : "add";
  const authed = Boolean(getToken());
  const username = getUsername();

  const [openOrders, setOpenOrders] = React.useState<Order[]>([]);
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [fills, setFills] = React.useState<FillRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalMode, setModalMode] = React.useState<"add" | "withdraw">(initialMode);
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    if (searchParams.get("mode")) {
      setModalMode(initialMode);
      setModalOpen(true);
    }
  }, [searchParams, initialMode]);

  const load = React.useCallback(async () => {
    if (!authed) {
      setLoading(false);
      return;
    }
    try {
      const [o, all, f] = await Promise.all([fetchOpenOrders(), fetchOrders(), fetchFills()]);
      setOpenOrders(o);
      setOrders(all);
      setFills(f);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [authed]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <ProfileHeader
        username={username}
        onDeposit={() => {
          setModalMode("add");
          setModalOpen(true);
        }}
        onWithdraw={() => {
          setModalMode("withdraw");
          setModalOpen(true);
        }}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <BalancesPanel refreshKey={refreshKey} />
        </div>
        <div className="lg:col-span-2">
          <Tabs defaultValue="open" className="w-full">
            <TabsList className="h-9 w-fit gap-2 bg-muted/60 p-0.5">
              <TabsTrigger value="open" className="h-8 px-3 text-[11px]">
                Open Orders
              </TabsTrigger>
              <TabsTrigger value="history" className="h-8 px-3 text-[11px]">
                Order History
              </TabsTrigger>
              <TabsTrigger value="fills" className="h-8 px-3 text-[11px]">
                Fills
              </TabsTrigger>
            </TabsList>
            <TabsContent value="open" className="mt-4">
              {loading ? <p className="text-xs text-muted-foreground">Loading...</p> : <OrdersTable orders={openOrders} title="Open Orders" />}
            </TabsContent>
            <TabsContent value="history" className="mt-4">
              {loading ? <p className="text-xs text-muted-foreground">Loading...</p> : <OrdersTable orders={orders} title="Order History" />}
            </TabsContent>
            <TabsContent value="fills" className="mt-4">
              {loading ? <p className="text-xs text-muted-foreground">Loading...</p> : <FillsTable fills={fills} />}
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <DepositWithdrawModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initialMode={modalMode}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
