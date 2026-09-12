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
  return response.json() as Promise<{ id: string }>;
}

export async function readSse(
  url: string,
  token: string,
  body: unknown,
  onEvent: (event: AgentEvent) => void,
) {
  const response = await fetch(`${API}${url}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (response.status === 429) {
    onEvent({ type: "error", message: "说得太快了，请稍后再试。" });
    return;
  }
  if (!response.ok || !response.body) {
    onEvent({ type: "error", message: await response.text() });
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const dataLine = chunk.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) {
        continue;
      }
      onEvent(JSON.parse(dataLine.slice(5).trim()) as AgentEvent);
    }
  }
}

export async function listOrders(token: string) {
  const response = await fetch(`${API}/v1/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.json();
}
