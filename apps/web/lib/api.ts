const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

export type AgentEvent = {
  type: string;
  text?: string;
  intent?: string;
  reason?: string;
  name?: string;
  block?: Record<string, unknown>;
  message?: string;
};

export type OrderLine = {
  name: string;
  quantity: number;
  unitPriceCents: number;
  modifiers?: string[];
};

export type OrderRecord = {
  orderId: string;
  status: string;
  storeName: string;
  merchantName?: string;
  totalCents: number;
  paymentStatus?: string;
  paymentProvider?: string;
  lines?: OrderLine[];
};

export async function guestLogin() {
  const response = await fetch(`${API}/v1/auth/guest`, { method: "POST" });
  if (!response.ok) {
    throw new Error("guest login failed");
  }
  return response.json() as Promise<{ token: string }>;
}

export async function createThread(token: string) {
  const response = await fetch(`${API}/v1/threads`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error("create thread failed");
  }
  return response.json() as Promise<{ id: string }>;
}

function parseSseFrame(frame: string): AgentEvent | null {
  const payload = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line.length > 0 && line !== "[DONE]")
    .join("\n");
  if (!payload) {
    return null;
  }
  try {
    return JSON.parse(payload) as AgentEvent;
  } catch {
    return null;
  }
}

export async function readSse(
  url: string,
  token: string,
  body: unknown,
  onEvent: (event: AgentEvent) => void,
) {
  let response: Response;
  try {
    response = await fetch(`${API}${url}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    onEvent({ type: "error", message: "网络异常，请稍后再试。" });
    return;
  }
  if (response.status === 429) {
    onEvent({ type: "error", message: "说得太快了，请稍后再试。" });
    return;
  }
  if (!response.ok || !response.body) {
    onEvent({ type: "error", message: "请求失败，请稍后再试。" });
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const emit = (frame: string) => {
    const event = parseSseFrame(frame);
    if (event) {
      onEvent(event);
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      emit(frame);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    emit(buffer);
  }
}

export async function listOrders(token: string) {
  const response = await fetch(`${API}/v1/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error("list orders failed");
  }
  return response.json() as Promise<OrderRecord[]>;
}

export async function configureCart(
  token: string,
  cartId: string,
  input: { skuId: string; modifierIds: string[]; quantity?: number },
) {
  const response = await fetch(`${API}/v1/carts/${cartId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error("configure cart failed");
  }
  return response.json();
}

export async function payOrder(token: string, orderId: string, provider: "wechat" | "alipay") {
  const response = await fetch(`${API}/v1/orders/${orderId}/pay`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ provider }),
  });
  if (!response.ok) {
    throw new Error("pay failed");
  }
  return response.json() as Promise<OrderRecord>;
}

export async function advanceOrder(token: string, orderId: string) {
  const response = await fetch(`${API}/v1/orders/${orderId}/advance`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error("advance failed");
  }
  return response.json() as Promise<OrderRecord>;
}
