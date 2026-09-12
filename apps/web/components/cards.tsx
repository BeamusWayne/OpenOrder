"use client";

import { useEffect, useState } from "react";
import { specUnitPrice, yuan, type DrinkSpec } from "../lib/format";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Store = {
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

export function StoreListCard({
  block,
  busy,
  selectedStoreId,
  onSelectStore,
}: {
  block: Record<string, unknown>;
  busy: boolean;
  selectedStoreId: string;
  onSelectStore: (store: Store) => void;
}) {
  const stores = (block.stores as Store[]) ?? [];
  return (
    <div className="card" data-testid="store-list">
      <p className="card-kicker">请选择门店</p>
      <h3>附近门店</h3>
      <div className="store-list">
        {stores.map((store) => {
          const selected = selectedStoreId === store.id;
          return (
            <button
              type="button"
              className={selected ? "store-row selected" : "store-row"}
              data-testid="store-row"
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

export function ModifierCard({
  block,
  busy,
  onSpecChange,
}: {
  block: Record<string, unknown>;
  busy: boolean;
  onSpecChange?: (spec: DrinkSpec) => void;
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

  const sku = skus.find((item) => item.id === skuId) ?? skus[0];
  const modifiers = groups
    .map((group) => group.options.find((option) => option.id === selected[group.id]))
    .filter((option): option is ModifierOption => Boolean(option));
  const spec: DrinkSpec = {
    skuId,
    skuName: sku?.name ?? itemName,
    basePriceCents: sku?.basePriceCents ?? 0,
    quantity: 1,
    modifiers,
  };
  const unitPrice = specUnitPrice(spec);

  useEffect(() => {
    onSpecChange?.(spec);
  }, [skuId, selected]);

  return (
    <div className="card" data-testid="modifier-picker">
      <p className="card-kicker">可改规格，点选即改价</p>
      <h3>{itemName}</h3>
      <p className="live-price">
        当前 <span>{yuan(unitPrice)}</span>
      </p>
      {skus.length > 0 ? (
        <div className="choice-group">
          <h4>杯型</h4>
          <div className="choice-row">
            {skus.map((item) => {
              const soldOut = item.quantity === 0;
              return (
                <button
                  type="button"
                  key={item.id}
                  className={skuId === item.id ? "choice selected" : "choice"}
                  data-testid={`sku-${item.size ?? item.name}`}
                  disabled={busy || soldOut}
                  onClick={() => setSkuId(item.id)}
                >
                  {item.name}
                  {item.basePriceCents != null ? ` ${yuan(item.basePriceCents)}` : ""}
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
                data-testid={`mod-${option.name}`}
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

export function ConfirmCard({
  block,
  busy,
  spec,
  onConfirm,
}: {
  block: Record<string, unknown>;
  busy: boolean;
  spec: DrinkSpec | null;
  onConfirm: (cartId: string) => void;
}) {
  const cartId = String(block.cartId ?? "");
  const lines = (block.lines as ConfirmLine[]) ?? [];
  const displayLines = spec
    ? [
        {
          name: spec.skuName,
          quantity: spec.quantity,
          unitPriceCents: specUnitPrice(spec),
          modifiers: spec.modifiers.map((item) => item.name),
        },
      ]
    : lines;
  const totalCents = displayLines.reduce(
    (sum, line) => sum + line.unitPriceCents * line.quantity,
    0,
  );

  return (
    <div className="card" data-testid="order-confirm">
      <p className="card-kicker">确认后进入模拟支付，现在还不会扣款</p>
      <h3>确认订单</h3>
      <p className="muted">{String(block.storeName ?? "")}</p>
      <div className="line-list">
        {displayLines.map((line, index) => (
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
        <span data-testid="confirm-total">{yuan(totalCents)}</span>
      </p>
      <button
        className="btn btn-primary"
        type="button"
        data-testid="confirm-order"
        disabled={busy || !UUID_RE.test(cartId)}
        onClick={() => onConfirm(cartId)}
      >
        {busy ? "提交中…" : "确认下单"}
      </button>
    </div>
  );
}
