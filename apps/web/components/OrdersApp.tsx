"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listOrders, type OrderRecord } from "../lib/api";

const STATUS_LABEL: Record<string, string> = {
  draft_confirmed: "已确认",
  paid: "已支付",
  accepted: "已接单",
  making: "制作中",
  ready: "待取餐",
  completed: "已完成",
  cancelled: "已取消",
};

function yuan(cents: unknown) {
  const value = Number(cents);
  return `¥${(Number.isFinite(value) ? value / 100 : 0).toFixed(2)}`;
}

export function OrdersApp() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingSession, setMissingSession] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem("openorder.token");
    if (!token) {
      setMissingSession(true);
      setLoading(false);
      return;
    }
    listOrders(token)
      .then((rows) => setOrders(Array.isArray(rows) ? rows : []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>订单</h1>
          <p>与对话页同一账户下的模拟订单。</p>
        </div>
        <Link className="topbar-link" href="/">
          返回对话
        </Link>
      </header>
      <div className="thread">
        {loading ? <div className="status-row">正在读取订单…</div> : null}
        {!loading && missingSession ? (
          <div className="card empty">还没有会话。先回去点一杯，再来看订单。</div>
        ) : null}
        {!loading && !missingSession && orders.length === 0 ? (
          <div className="card empty">还没有订单。</div>
        ) : null}
        {orders.map((order) => (
          <div className="card" key={order.orderId}>
            <div className="order-head">
              <h3>{order.storeName || "订单"}</h3>
              <span className="order-status">{STATUS_LABEL[order.status] ?? order.status}</span>
            </div>
            <p className="muted">订单 {order.orderId.slice(0, 8)}</p>
            {order.lines?.length ? (
              <div className="line-list">
                {order.lines.map((line, index) => (
                  <div className="line-row" key={`${order.orderId}-${line.name}-${index}`}>
                    <div>
                      <strong>
                        {line.name} × {line.quantity}
                      </strong>
                      {line.modifiers?.length ? (
                        <div className="line-meta">{line.modifiers.join(" · ")}</div>
                      ) : null}
                    </div>
                    <span className="line-price">{yuan(line.unitPriceCents * line.quantity)}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="total">
              <span>合计</span>
              <span>{yuan(order.totalCents)}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
