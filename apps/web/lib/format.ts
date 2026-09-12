export function yuan(cents: unknown) {
  const value = Number(cents);
  return `¥${(Number.isFinite(value) ? value / 100 : 0).toFixed(2)}`;
}

export const STATUS_LABEL: Record<string, string> = {
  draft_confirmed: "待支付",
  paid: "已支付",
  accepted: "已接单",
  making: "制作中",
  ready: "待取餐",
  completed: "已完成",
  cancelled: "已取消",
};

export type DrinkSpec = {
  skuId: string;
  skuName: string;
  basePriceCents: number;
  quantity: number;
  modifiers: Array<{ id: string; name: string; priceDeltaCents: number }>;
};

export function specUnitPrice(spec: DrinkSpec) {
  return spec.basePriceCents + spec.modifiers.reduce((sum, item) => sum + item.priceDeltaCents, 0);
}
