"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createThread, guestLogin, readSse, type AgentEvent } from "../lib/api";

type Message = {
  role: "user" | "assistant";
  text: string;
  block?: Record<string, unknown>;
};

export function ChatApp() {
  const [token, setToken] = useState("");
  const [threadId, setThreadId] = useState("");
  const [input, setInput] = useState("帮我点杯瑞幸生椰拿铁少糖");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = sessionStorage.getItem("openorder.token");
      const session = existing ? { token: existing } : await guestLogin();
      const thread = await createThread(session.token);
      if (!cancelled) {
        setToken(session.token);
        setThreadId(thread.id);
        sessionStorage.setItem("openorder.token", session.token);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function send(text: string) {
    if (!token || !threadId || busy) {
      return;
    }
    setBusy(true);
    setMessages((current) => [...current, { role: "user", text }]);
    await readSse(`/v1/threads/${threadId}/messages`, token, { text }, (event) => {
      applyEvent(event);
    });
    setBusy(false);
  }

  function applyEvent(event: AgentEvent) {
    if (event.type === "token" && event.text) {
      setMessages((current) => [...current, { role: "assistant", text: event.text ?? "" }]);
    }
    if (event.type === "ui" && event.block) {
      setMessages((current) => [
        ...current,
        { role: "assistant", text: "", block: event.block },
      ]);
    }
    if (event.type === "error") {
      setMessages((current) => [
        ...current,
        { role: "assistant", text: event.message ?? "出错了" },
      ]);
    }
  }

  async function confirm(cartId: string) {
    setBusy(true);
    await readSse(`/v1/threads/${threadId}/confirm`, token, { cartId }, applyEvent);
    setBusy(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text) {
      return;
    }
    setInput("");
    await send(text);
  }

  return (
    <main>
      <header>
        <h1>OpenOrder</h1>
        <p>
          一句话点茶饮。试一句「帮我点杯瑞幸生椰拿铁少糖」，或故意问「解释一下 Transformer
          原理」看拦截。
        </p>
        <p className="orders">
          <Link href="/orders">查看订单</Link>
        </p>
      </header>
      <div className="thread">
        {messages.map((message, index) => (
          <article className={message.role === "user" ? "bubble user" : "bubble"} key={index}>
            {message.text}
            {message.block ? <Block block={message.block} onConfirm={confirm} /> : null}
          </article>
        ))}
      </div>
      <form onSubmit={onSubmit}>
        <textarea value={input} onChange={(event) => setInput(event.target.value)} />
        <button type="submit" disabled={busy || !token}>
          发送
        </button>
      </form>
    </main>
  );
}

function Block({
  block,
  onConfirm,
}: {
  block: Record<string, unknown>;
  onConfirm: (cartId: string) => void;
}) {
  if (block.type === "intercept") {
    return <div className="card">{String(block.message)}</div>;
  }
  if (block.type === "store_list") {
    const stores = (block.stores as Array<Record<string, unknown>>) ?? [];
    return (
      <div className="card">
        <h3>附近门店</h3>
        {stores.map((store) => (
          <div className="store" key={String(store.id)}>
            <div>
              <strong>{String(store.name)}</strong>
              <div>
                {String(store.brand)} · {String(store.distanceMeters)}m
              </div>
            </div>
            <span>{String(store.etaMinutes)} 分钟</span>
          </div>
        ))}
      </div>
    );
  }
  if (block.type === "order_confirm") {
    return (
      <div className="card">
        <h3>确认订单 · {String(block.storeName)}</h3>
        <p>合计 ¥{(Number(block.totalCents) / 100).toFixed(2)}</p>
        <button type="button" onClick={() => onConfirm(String(block.cartId))}>
          确认并模拟支付
        </button>
      </div>
    );
  }
  if (block.type === "payment" || block.type === "order_status") {
    return (
      <div className="card">
        <h3>订单 {String(block.orderId).slice(0, 8)}</h3>
        <p>{block.type === "payment" ? "模拟支付已发起" : `状态 ${String(block.status)}`}</p>
      </div>
    );
  }
  return null;
}
