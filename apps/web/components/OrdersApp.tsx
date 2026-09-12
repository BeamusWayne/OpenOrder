"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listOrders } from "../lib/api";

export function OrdersApp() {
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    const token = sessionStorage.getItem("openorder.token");
    if (!token) {
      return;
    }
    listOrders(token).then(setOrders).catch(() => setOrders([]));
  }, []);

  return (
    <main>
      <header>
        <h1>订单</h1>
        <p>
          <Link href="/">返回对话</Link>
        </p>
      </header>
      <div className="thread">
        {orders.length === 0 ? <div className="card">还没有订单。</div> : null}
        {orders.map((order) => (
          <div className="card" key={String(order.orderId)}>
            <h3>{String(order.storeName)}</h3>
            <p>
              {String(order.status)} · ¥{(Number(order.totalCents) / 100).toFixed(2)}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
