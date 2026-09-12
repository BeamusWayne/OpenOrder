"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { configureCart, createThread, guestLogin, readSse, type AgentEvent } from "../lib/api";
import { type DrinkSpec } from "../lib/format";
import {
  ClarifyCard,
  ConfirmCard,
  ModifierCard,
  SoldOutCard,
  StoreListCard,
  type SoldOutAlternative,
  type Store,
} from "./cards";
import { PaymentFlow, ProgressCard, ReceiptCard } from "./payment";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TOOL_STATUS: Record<string, string> = {
  search_stores: "正在找店…",
  get_menu: "正在看菜单…",
  add_cart_item: "正在加入购物车…",
  get_cart: "正在读取购物车…",
  prepare_checkout: "正在算价…",
  checkout: "正在提交订单…",
  pay_order: "正在确认支付结果…",
  get_order: "正在查询订单…",
};

type Message = {
  role: "user" | "assistant";
  text: string;
  block?: Record<string, unknown>;
  streaming?: boolean;
};

export function ChatApp() {
  const [token, setToken] = useState("");
  const [threadId, setThreadId] = useState("");
  const [input, setInput] = useState("帮我点杯瑞幸生椰拿铁少糖");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("正在连接…");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [spec, setSpec] = useState<DrinkSpec | null>(null);
  const [ready, setReady] = useState(false);
  const inFlight = useRef(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const persistReady = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = sessionStorage.getItem("openorder.token");
        const session = existing ? { token: existing } : await guestLogin();
        const reorder = sessionStorage.getItem("openorder.reorder");
        const savedThread = sessionStorage.getItem("openorder.threadId");
        const savedMessages = sessionStorage.getItem("openorder.messages");
        sessionStorage.setItem("openorder.token", session.token);
        if (!cancelled) {
          setToken(session.token);
        }
        if (reorder) {
          sessionStorage.removeItem("openorder.reorder");
          sessionStorage.removeItem("openorder.messages");
          const thread = await createThread(session.token);
          if (cancelled) {
            return;
          }
          setThreadId(thread.id);
          sessionStorage.setItem("openorder.threadId", thread.id);
          setReady(true);
          setStatus("");
          persistReady.current = true;
          setInput("");
          await runTurnAfterReady(session.token, thread.id, reorder);
          return;
        }
        if (savedThread && savedMessages) {
          if (cancelled) {
            return;
          }
          setThreadId(savedThread);
          setSelectedStoreId(sessionStorage.getItem("openorder.selectedStoreId") ?? "");
          try {
            setMessages(JSON.parse(savedMessages) as Message[]);
          } catch {
            setMessages([]);
          }
          setReady(true);
          setStatus("");
          persistReady.current = true;
          return;
        }
        const thread = await createThread(session.token);
        if (!cancelled) {
          setThreadId(thread.id);
          sessionStorage.setItem("openorder.threadId", thread.id);
          setReady(true);
          setStatus("");
          persistReady.current = true;
        }
      } catch {
        if (!cancelled) {
          setStatus("");
          setMessages([{ role: "assistant", text: "连接失败，请刷新页面重试。" }]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!persistReady.current || !threadId) {
      return;
    }
    sessionStorage.setItem("openorder.threadId", threadId);
    sessionStorage.setItem("openorder.messages", JSON.stringify(messages.map(({ streaming, ...rest }) => rest)));
    if (selectedStoreId) {
      sessionStorage.setItem("openorder.selectedStoreId", selectedStoreId);
    }
  }, [messages, threadId, selectedStoreId]);

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
    if (event.type === "tool_end") {
      setStatus("");
    }
    if (event.type === "token" && event.text) {
      setMessages((current) => {
        const last = current[current.length - 1];
        const incoming = event.text ?? "";
        if (last?.role === "assistant" && !last.block) {
          if (!last.text) {
            return [...current.slice(0, -1), { ...last, text: incoming, streaming: true }];
          }
          if (last.text === incoming || last.text.endsWith(incoming)) {
            return current.map((item, index) =>
              index === current.length - 1 ? { ...item, streaming: true } : item,
            );
          }
          return [
            ...current.slice(0, -1),
            { ...last, text: `${last.text}${incoming}`, streaming: true },
          ];
        }
        return [...current, { role: "assistant", text: incoming, streaming: true }];
      });
    }
    if (event.type === "ui" && event.block) {
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
        ...current.map((item) => ({ ...item, streaming: false })),
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
    if (event.type === "done") {
      setMessages((current) => current.map((item) => ({ ...item, streaming: false })));
    }
  }

  async function runTurnAfterReady(authToken: string, nextThreadId: string, text: string) {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setStatus("正在处理…");
    setMessages((current) => [...current, { role: "user", text }]);
    try {
      await readSse(`/v1/threads/${nextThreadId}/messages`, authToken, { text }, applyEvent);
    } finally {
      inFlight.current = false;
      setBusy(false);
      setStatus("");
      setMessages((current) => current.map((item) => ({ ...item, streaming: false })));
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
      setMessages((current) => current.map((item) => ({ ...item, streaming: false })));
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
    if (spec) {
      try {
        await configureCart(token, cartId, {
          skuId: spec.skuId,
          modifierIds: spec.modifiers.map((item) => item.id),
          quantity: spec.quantity,
        });
      } catch {
        setMessages((current) => [
          ...current,
          { role: "assistant", text: "规格没有保存成功，请再选一次后确认。" },
        ]);
        return;
      }
    }
    await runTurn(`/v1/threads/${threadId}/confirm`, { cartId }, "确认下单");
  }

  async function pickAlternative(alternative: SoldOutAlternative) {
    if (alternative.kind === "store" && alternative.storeId) {
      await selectStore({
        id: alternative.storeId,
        brand: "",
        name: alternative.storeName ?? "这家店",
        distanceMeters: 0,
        etaMinutes: 15,
      });
      return;
    }
    if (alternative.skuId) {
      const storePart = alternative.storeId ? ` storeId=${alternative.storeId}` : "";
      const label = alternative.skuName ?? alternative.itemName ?? "另一杯";
      await send(`换成${label} skuId=${alternative.skuId}${storePart}`, `换成${label}`);
    }
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
              <div
                className={[
                  message.role === "user" ? "bubble user" : "bubble",
                  message.streaming ? "streaming" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {message.text}
              </div>
            ) : null}
            {message.block ? (
              <Block
                block={message.block}
                busy={busy}
                token={token}
                spec={spec}
                selectedStoreId={selectedStoreId}
                onSelectStore={selectStore}
                onSpecChange={setSpec}
                onConfirm={confirm}
                onSoldOut={pickAlternative}
                onClarify={(text) => void send(text)}
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
  token,
  spec,
  selectedStoreId,
  onSelectStore,
  onSpecChange,
  onConfirm,
  onSoldOut,
  onClarify,
}: {
  block: Record<string, unknown>;
  busy: boolean;
  token: string;
  spec: DrinkSpec | null;
  selectedStoreId: string;
  onSelectStore: (store: Store) => void;
  onSpecChange: (spec: DrinkSpec) => void;
  onConfirm: (cartId: string) => void;
  onSoldOut: (alternative: SoldOutAlternative) => void;
  onClarify: (text: string) => void;
}) {
  if (block.type === "store_list") {
    return (
      <StoreListCard
        block={block}
        busy={busy}
        selectedStoreId={selectedStoreId}
        onSelectStore={onSelectStore}
      />
    );
  }
  if (block.type === "modifier_picker") {
    return <ModifierCard block={block} busy={busy} onSpecChange={onSpecChange} />;
  }
  if (block.type === "order_confirm") {
    return (
      <ConfirmCard
        block={block}
        busy={busy}
        spec={spec}
        onSpecChange={onSpecChange}
        onConfirm={onConfirm}
      />
    );
  }
  if (block.type === "sold_out") {
    return <SoldOutCard block={block} busy={busy} onPick={onSoldOut} />;
  }
  if (block.type === "clarify") {
    return <ClarifyCard block={block} busy={busy} onPick={onClarify} />;
  }
  if (block.type === "payment_sheet") {
    return <PaymentFlow block={block} token={token} />;
  }
  if (block.type === "pay_receipt") {
    return <ReceiptCard block={block} />;
  }
  if (block.type === "order_progress") {
    return (
      <ProgressCard
        storeName={String(block.storeName ?? "订单")}
        orderId={String(block.orderId ?? "")}
        status={String(block.status ?? "")}
        steps={block.steps as Array<{ key: string; label: string; state: string }> | undefined}
        pickupCode={typeof block.pickupCode === "string" ? block.pickupCode : undefined}
      />
    );
  }
  return null;
}
