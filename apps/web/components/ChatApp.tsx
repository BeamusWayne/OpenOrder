"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createThread, guestLogin, readSse, type AgentEvent } from "../lib/api";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUS_LABEL: Record<string, string> = {
  draft_confirmed: "已确认",
  paid: "已支付",
  accepted: "已接单",
  making: "制作中",
  ready: "待取餐",
  completed: "已完成",
  cancelled: "已取消",
};

const TOOL_STATUS: Record<string, string> = {
  search_stores: "正在搜索附近门店…",
  get_menu: "正在查看菜单…",
  add_cart_item: "正在加入购物车…",
  get_cart: "正在读取购物车…",
  prepare_checkout: "正在生成确认单…",
  checkout: "正在提交订单…",
  pay_order: "正在模拟支付…",
  get_order: "正在查询订单…",
};

type Message = {
  role: "user" | "assistant";
  text: string;
  block?: Record<string, unknown>;
};

type Store = {
  id: string;
  brand: string;
  name: string;
  distanceMeters: number;
  rating?: number;
  etaMinutes: number;
};

type ConfirmLine = {
  name: string;
  quantity: number;
  unitPriceCents: number;
  modifiers?: string[];
};

type ModifierOption = {
  id: string;
  name: string;
  priceDeltaCents: number;
};

type ModifierGroup = {
  id: string;
  name: string;
  required: boolean;
  options: ModifierOption[];
};

type SkuOption = {
  id: string;
  name: string;
  size?: string;
  basePriceCents?: number;
  quantity?: number;
};

function yuan(cents: unknown) {
  const value = Number(cents);
  return `¥${(Number.isFinite(value) ? value / 100 : 0).toFixed(2)}`;
}

export function ChatApp() {
  const [token, setToken] = useState("");
  const [threadId, setThreadId] = useState("");
  const [input, setInput] = useState("帮我点杯瑞幸生椰拿铁少糖");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("正在连接…");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [ready, setReady] = useState(false);
  const inFlight = useRef(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = sessionStorage.getItem("openorder.token");
        const session = existing ? { token: existing } : await guestLogin();
        const thread = await createThread(session.token);
        if (!cancelled) {
          setToken(session.token);
          setThreadId(thread.id);
          sessionStorage.setItem("openorder.token", session.token);
          setReady(true);
          setStatus("");
        }
      } catch {
        if (!cancelled) {
          setStatus("");
          setMessages([
            { role: "assistant", text: "连接失败，请刷新页面重试。" },
          ]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const node = threadRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, busy, status]);

  function applyEvent(event: AgentEvent) {
    if (event.type === "tool_start" && event.name) {
      setStatus(TOOL_STATUS[event.name] ?? "处理中…");
    }
    if (event.type === "token" && event.text) {
      setStatus("");
      setMessages((current) => {
        const last = current[current.length - 1];
        const incoming = event.text ?? "";
        if (last?.role === "assistant" && !last.block) {
          if (!last.text) {
            return [...current.slice(0, -1), { ...last, text: incoming }];
          }
          if (last.text === incoming || last.text.endsWith(incoming)) {
            return current;
          }
          return [...current.slice(0, -1), { ...last, text: `${last.text}${incoming}` }];
        }
        return [...current, { role: "assistant", text: incoming }];
      });
    }
    if (event.type === "ui" && event.block) {
      setStatus("");
      if (event.block.type === "intercept") {
        const text = String(event.block.message ?? "我只能帮你点饮品、改规格、确认下单或查询已有订单。");
        setMessages((current) => {
          const last = current[current.length - 1];
          if (last?.role === "assistant" && last.text === text) {
            return current;
          }
          return [...current, { role: "assistant", text }];
        });
        return;
      }
      setMessages((current) => [
        ...current,
        { role: "assistant", text: "", block: event.block },
      ]);
    }
    if (event.type === "error") {
      setStatus("");
      setMessages((current) => [
        ...current,
        { role: "assistant", text: event.message ?? "出错了，请稍后再试。" },
      ]);
    }
  }

  async function runTurn(url: string, body: unknown, userText?: string) {
    if (!token || !threadId || inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setStatus("正在处理…");
    if (userText) {
      setMessages((current) => [...current, { role: "user", text: userText }]);
    }
    try {
      await readSse(url, token, body, applyEvent);
    } finally {
      inFlight.current = false;
      setBusy(false);
      setStatus("");
    }
  }

  async function send(text: string, displayText = text) {
    await runTurn(`/v1/threads/${threadId}/messages`, { text }, displayText);
  }

  async function selectStore(store: Store) {
    if (inFlight.current || !store.id) {
      return;
    }
    setSelectedStoreId(store.id);
    await send(`就这家：${store.name} storeId=${store.id}`, `就这家：${store.name}`);
  }

  async function confirm(cartId: string) {
    if (!UUID_RE.test(cartId)) {
      setMessages((current) => [
        ...current,
        { role: "assistant", text: "订单还没准备好，请先选择门店。" },
      ]);
      return;
    }
    await runTurn(
      `/v1/threads/${threadId}/confirm`,
      { cartId },
      "确认并模拟支付",
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy || !ready) {
      return;
    }
    setInput("");
    await send(text);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const canSend = ready && !busy && Boolean(input.trim());

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>OpenOrder</h1>
          <p>一句话点茶饮，选门店后确认即可下单。</p>
        </div>
        <Link className="topbar-link" href="/orders">
          查看订单
        </Link>
      </header>
      <div className="thread" ref={threadRef}>
        {messages.map((message, index) => (
          <div className={message.role === "user" ? "turn user" : "turn"} key={`${message.role}-${index}`}>
            {message.text ? (
              <div className={message.role === "user" ? "bubble user" : "bubble"}>{message.text}</div>
            ) : null}
            {message.block ? (
              <Block
                block={message.block}
                busy={busy}
                selectedStoreId={selectedStoreId}
                onSelectStore={selectStore}
                onConfirm={confirm}
              />
            ) : null}
          </div>
        ))}
        {busy && status ? (
          <div className="status-row" aria-live="polite">
            <span className="dot" />
            {status}
          </div>
        ) : null}
      </div>
      <form className="composer" onSubmit={onSubmit}>
        <textarea
          value={input}
          rows={2}
          placeholder={ready ? "继续说说口味、门店或数量" : "正在连接…"}
          disabled={!ready}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button className="btn btn-primary" type="submit" disabled={!canSend}>
          发送
        </button>
      </form>
    </div>
  );
}

function Block({
  block,
  busy,
  selectedStoreId,
  onSelectStore,
  onConfirm,
}: {
  block: Record<string, unknown>;
  busy: boolean;
  selectedStoreId: string;
  onSelectStore: (store: Store) => void;
  onConfirm: (cartId: string) => void;
}) {
  if (block.type === "store_list") {
    const stores = (block.stores as Store[]) ?? [];
    return (
      <div className="card">
        <p className="card-kicker">请选择门店</p>
        <h3>附近门店</h3>
        <div className="store-list">
          {stores.map((store) => {
            const selected = selectedStoreId === store.id;
            return (
              <button
                type="button"
                className={selected ? "store-row selected" : "store-row"}
                key={store.id}
                disabled={busy}
                onClick={() => onSelectStore(store)}
              >
                <div>
                  <strong>{store.name}</strong>
                  <div className="store-meta">
                    {store.brand} · {store.distanceMeters}m
                    {store.rating ? ` · ${store.rating}` : ""}
                  </div>
                </div>
                <span className="store-eta">{store.etaMinutes} 分钟</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (block.type === "modifier_picker") {
    return <ModifierCard block={block} busy={busy} />;
  }

  if (block.type === "order_confirm") {
    const cartId = String(block.cartId ?? "");
    const lines = (block.lines as ConfirmLine[]) ?? [];
    return (
      <div className="card">
        <p className="card-kicker">确认后将发起模拟支付</p>
        <h3>确认订单</h3>
        <p className="muted">{String(block.storeName ?? "")}</p>
        <div className="line-list">
          {lines.map((line, index) => (
            <div className="line-row" key={`${line.name}-${index}`}>
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
        <p className="total">
          <span>合计</span>
          <span>{yuan(block.totalCents)}</span>
        </p>
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy || !UUID_RE.test(cartId)}
          onClick={() => onConfirm(cartId)}
        >
          {busy ? "提交中…" : "确认并模拟支付"}
        </button>
      </div>
    );
  }

  if (block.type === "payment" || block.type === "order_status") {
    const orderId = String(block.orderId ?? "");
    const title = block.type === "payment" ? "模拟支付已发起" : "订单状态";
    return (
      <div className="card">
        <p className="card-kicker">{title}</p>
        <h3>{block.type === "order_status" ? String(block.storeName ?? "订单") : "支付"}</h3>
        <p className="muted">
          订单 {orderId.slice(0, 8)}
          {block.type === "order_status"
            ? ` · ${STATUS_LABEL[String(block.status)] ?? String(block.status ?? "")}`
            : ""}
          {block.amountCents != null ? ` · ${yuan(block.amountCents)}` : ""}
        </p>
      </div>
    );
  }

  return null;
}

function ModifierCard({
  block,
  busy,
}: {
  block: Record<string, unknown>;
  busy: boolean;
}) {
  const groups = (block.groups as ModifierGroup[]) ?? [];
  const skus = (block.skus as SkuOption[]) ?? [];
  const itemName = String(block.itemName ?? "饮品");
  const [skuId, setSkuId] = useState(() => {
    const available = skus.find((sku) => sku.quantity !== 0);
    return String(block.skuId ?? available?.id ?? skus[0]?.id ?? "");
  });
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const group of groups) {
      const preferred = group.options.find((option) => /少糖|去冰/.test(option.name));
      const option = preferred ?? group.options[0];
      if (option) {
        initial[group.id] = option.id;
      }
    }
    return initial;
  });

  return (
    <div className="card">
      <p className="card-kicker">可改规格</p>
      <h3>{itemName}</h3>
      {skus.length > 0 ? (
        <div className="choice-group">
          <h4>杯型</h4>
          <div className="choice-row">
            {skus.map((sku) => {
              const soldOut = sku.quantity === 0;
              return (
                <button
                  type="button"
                  key={sku.id}
                  className={skuId === sku.id ? "choice selected" : "choice"}
                  disabled={busy || soldOut}
                  onClick={() => setSkuId(sku.id)}
                >
                  {sku.name}
                  {soldOut ? " · 售罄" : ""}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {groups.map((group) => (
        <div className="choice-group" key={group.id}>
          <h4>{group.name}</h4>
          <div className="choice-row">
            {group.options.map((option) => (
              <button
                type="button"
                key={option.id}
                className={selected[group.id] === option.id ? "choice selected" : "choice"}
                disabled={busy}
                onClick={() => setSelected((current) => ({ ...current, [group.id]: option.id }))}
              >
                {option.name}
                {option.priceDeltaCents
                  ? ` ${option.priceDeltaCents > 0 ? "+" : ""}${yuan(option.priceDeltaCents)}`
                  : ""}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
