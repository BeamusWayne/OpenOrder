"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { advanceOrder, payOrder } from "../lib/api";
import { yuan } from "../lib/format";

type PayLine = {
  name: string;
  quantity: number;
  unitPriceCents?: number;
  modifiers?: string[];
};

type Provider = "wechat" | "alipay";
type Phase = "choose" | "paying" | "receipt" | "progress";
type ProgressStatus = "paid" | "accepted" | "making" | "ready";

const STEPS: Array<{ key: ProgressStatus; label: string }> = [
  { key: "paid", label: "支付成功" },
  { key: "accepted", label: "商家接单" },
  { key: "making", label: "制作中" },
  { key: "ready", label: "可取餐" },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stepState(current: string, key: string) {
  const order = STEPS.map((step) => step.key);
  const currentIndex = order.indexOf(current as ProgressStatus);
  const index = order.indexOf(key as ProgressStatus);
  if (currentIndex < 0) {
    return "pending";
  }
  if (index < currentIndex) {
    return "done";
  }
  if (index === currentIndex) {
    return "current";
  }
  return "pending";
}

export function Timeline({
  status,
  steps,
}: {
  status: string;
  steps?: Array<{ key: string; label: string; state: string }>;
}) {
  const display = steps?.length
    ? steps
    : STEPS.map((step) => ({
        ...step,
        state: stepState(status, step.key),
      }));
  return (
    <ol className="timeline" data-testid="order-progress">
      {display.map((step, index) => (
        <li
          className={`timeline-step ${step.state}`}
          data-testid={`progress-${step.key}`}
          key={step.key}
        >
          <div className="timeline-rail">
            <span className="timeline-dot" />
            {index < display.length - 1 ? <span className="timeline-line" /> : null}
          </div>
          <div>
            <strong>{step.label}</strong>
            <div className="line-meta">
              {step.state === "current" ? "进行中" : step.state === "done" ? "已完成" : "等待中"}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ProgressCard({
  storeName,
  orderId,
  status,
  steps,
}: {
  storeName: string;
  orderId: string;
  status: string;
  steps?: Array<{ key: string; label: string; state: string }>;
}) {
  return (
    <div className="card" data-testid="order-progress-card">
      <p className="card-kicker">出餐进度</p>
      <h3>{storeName || "订单"}</h3>
      <p className="muted">订单 {orderId.slice(0, 8)}</p>
      <Timeline status={status} steps={steps} />
    </div>
  );
}

export function PaymentFlow({
  block,
  token,
}: {
  block: Record<string, unknown>;
  token: string;
}) {
  const orderId = String(block.orderId ?? "");
  const amountCents = Number(block.amountCents ?? 0);
  const merchantName = String(block.merchantName ?? "瑞幸咖啡");
  const storeName = String(block.storeName ?? "");
  const lines = (block.lines as PayLine[]) ?? [];
  const [overlay, setOverlay] = useState<Provider | null>(null);
  const [phase, setPhase] = useState<Phase>("choose");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [progress, setProgress] = useState<ProgressStatus>("paid");
  const [filledPins, setFilledPins] = useState(0);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  function openCashier(next: Provider) {
    if (phase !== "choose") {
      return;
    }
    setError("");
    setProvider(next);
    setFilledPins(0);
    setOverlay(next);
  }

  function cancelCashier() {
    if (phase === "paying") {
      return;
    }
    setOverlay(null);
    setFilledPins(0);
  }

  async function confirmCashier() {
    if (!overlay || !orderId) {
      return;
    }
    setError("");
    if (overlay === "wechat") {
      for (let index = 1; index <= 6; index += 1) {
        setFilledPins(index);
        await sleep(70);
      }
    }
    setPhase("paying");
    try {
      await sleep(700);
      await payOrder(token, orderId, overlay);
      setOverlay(null);
      setPhase("receipt");
      setProgress("paid");
      await sleep(1100);
      setPhase("progress");
      await advanceOrder(token, orderId);
      setProgress("accepted");
      await sleep(1400);
      await advanceOrder(token, orderId);
      setProgress("making");
      await sleep(1600);
      await advanceOrder(token, orderId);
      setProgress("ready");
    } catch {
      setPhase("choose");
      setError("支付未完成，请重新选择支付方式。");
    }
  }

  const summary = lines.map((line) => `${line.name} × ${line.quantity}`).join("、") || "饮品订单";

  return (
    <div className="card payment-card" data-testid="payment-sheet">
      <p className="card-kicker">{phase === "choose" ? "待支付" : "支付与出餐"}</p>
      <h3>{phase === "choose" ? "模拟支付" : storeName || "订单"}</h3>
      <p className="muted">{storeName}</p>
      <div className="line-list">
        {lines.map((line, index) => (
          <div className="line-row" key={`${line.name}-${index}`}>
            <div>
              <strong>
                {line.name} × {line.quantity}
              </strong>
              {line.modifiers?.length ? <div className="line-meta">{line.modifiers.join(" · ")}</div> : null}
            </div>
            {line.unitPriceCents != null ? (
              <span className="line-price">{yuan(line.unitPriceCents * line.quantity)}</span>
            ) : null}
          </div>
        ))}
      </div>
      <p className="total">
        <span>应付</span>
        <span data-testid="pay-amount">{yuan(amountCents)}</span>
      </p>

      {phase === "choose" ? (
        <>
          <p className="card-kicker">选择支付方式</p>
          <div className="pay-methods">
            <button
              type="button"
              className={provider === "wechat" ? "pay-method selected" : "pay-method"}
              data-testid="pay-wechat"
              onClick={() => openCashier("wechat")}
            >
              <span className="pay-badge wechat">微信</span>
              微信支付
            </button>
            <button
              type="button"
              className={provider === "alipay" ? "pay-method selected" : "pay-method"}
              data-testid="pay-alipay"
              onClick={() => openCashier("alipay")}
            >
              <span className="pay-badge alipay">支付宝</span>
              支付宝
            </button>
          </div>
          {error ? <p className="error-text">{error}</p> : null}
        </>
      ) : null}

      {phase === "receipt" || phase === "progress" ? (
        <div className="receipt" data-testid="pay-receipt">
          <p className="card-kicker">支付成功</p>
          <p className="receipt-amount">{yuan(amountCents)}</p>
          <p className="muted">
            {provider === "wechat" ? "微信支付" : "支付宝"} · {merchantName}
          </p>
          <p className="muted">订单 {orderId.slice(0, 8)}</p>
        </div>
      ) : null}

      {phase === "progress" ? <Timeline status={progress} /> : null}

      {mounted && overlay
        ? createPortal(
            <Cashier
              provider={overlay}
              amountCents={amountCents}
              merchantName={merchantName}
              orderId={orderId}
              summary={summary}
              paying={phase === "paying"}
              filledPins={filledPins}
              onCancel={cancelCashier}
              onConfirm={() => void confirmCashier()}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function Cashier({
  provider,
  amountCents,
  merchantName,
  orderId,
  summary,
  paying,
  filledPins,
  onCancel,
  onConfirm,
}: {
  provider: Provider;
  amountCents: number;
  merchantName: string;
  orderId: string;
  summary: string;
  paying: boolean;
  filledPins: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const wechat = provider === "wechat";
  return (
    <div className="cashier-overlay" role="dialog" aria-modal="true" data-testid="cashier-overlay">
      <div className={wechat ? "cashier wechat" : "cashier alipay"} data-testid={wechat ? "wechat-pay" : "alipay-pay"}>
        <header className="cashier-bar">
          <span>{wechat ? "微信支付" : "支付宝"}</span>
        </header>
        <div className="cashier-body">
          <p className="cashier-label">{wechat ? "付款给" : "向商家付款"}</p>
          <p className="cashier-merchant">{merchantName}</p>
          <p className="cashier-amount">{yuan(amountCents)}</p>
          <p className="cashier-summary">{summary}</p>
          <p className="cashier-summary">单号 {orderId.slice(0, 8)}</p>
          {wechat ? (
            <div className="pin-row" aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => (
                <span className={index < filledPins ? "pin-cell filled" : "pin-cell"} key={index} />
              ))}
            </div>
          ) : null}
          {paying ? <p className="cashier-status">支付中…</p> : null}
          <button
            className={wechat ? "btn cashier-confirm wechat" : "btn cashier-confirm alipay"}
            type="button"
            data-testid="cashier-confirm"
            disabled={paying}
            onClick={onConfirm}
          >
            {paying ? "支付中…" : "确认付款"}
          </button>
          <button
            className="btn cashier-cancel"
            type="button"
            data-testid="cashier-cancel"
            disabled={paying}
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReceiptCard({ block }: { block: Record<string, unknown> }) {
  return (
    <div className="card" data-testid="pay-receipt">
      <p className="card-kicker">支付成功</p>
      <h3>{String(block.merchantName ?? block.storeName ?? "订单")}</h3>
      <p className="receipt-amount">{yuan(block.amountCents)}</p>
      <p className="muted">
        {block.provider === "wechat" ? "微信支付" : block.provider === "alipay" ? "支付宝" : "模拟支付"}
        {" · "}
        订单 {String(block.orderId ?? "").slice(0, 8)}
      </p>
    </div>
  );
}
