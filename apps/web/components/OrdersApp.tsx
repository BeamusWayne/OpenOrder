"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listOrders, type OrderRecord } from "../lib/api";
import { STATUS_LABEL, yuan } from "../lib/format";

function reorderText(order: OrderRecord) {
  const drink = order.lines?.[0]?.name ?? "生椰拿铁";
  const brand = order.storeName.includes("蜜雪")
    ? "蜜雪"
    : order.storeName.includes("喜茶")
      ? "喜茶"
      : order.storeName.includes("奈雪")
        ? "奈雪"
        : "瑞幸";
  return `帮我点杯${brand}${drink}`;
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

  function orderAgain(order: OrderRecord) {
    sessionStorage.setItem("openorder.reorder", reorderText(order));
    sessionStorage.removeItem("openorder.threadId");
    sessionStorage.removeItem("openorder.messages");
    window.location.assign("/");
  }

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
          <div className="card" key={order.orderId} data-testid="order-card">
            <div className="order-head">
              <h3>{order.storeName || "订单"}</h3>
              <span className="order-status">{STATUS_LABEL[order.status] ?? order.status}</span>
            </div>
            <p className="muted">订单 {order.orderId.slice(0, 8)}</p>
            {order.pickupCode ? (
              <div className="pickup-code">
                <span className="card-kicker">取餐码</span>
                <strong>{order.pickupCode}</strong>
              </div>
            ) : null}
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
            <button
              className="btn btn-primary"
              type="button"
              data-testid="order-again"
              onClick={() => orderAgain(order)}
            >
              再来一单
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
