import pino from "pino";

export const logger = pino({
  name: "openorder-api",
  level: process.env.LOG_LEVEL ?? "info",
});

export const metrics = {
  chatAccepted: 0,
  chatIntercepted: 0,
  chatRateLimited: 0,
  checkoutSucceeded: 0,
  checkoutFailed: 0,
};

export function renderMetrics(): string {
  return [
    `# HELP openorder_chat_accepted_total Chat turns that entered the agent host.`,
    `# TYPE openorder_chat_accepted_total counter`,
    `openorder_chat_accepted_total ${metrics.chatAccepted}`,
    `# HELP openorder_chat_intercepted_total Out-of-scope turns intercepted before tools.`,
    `# TYPE openorder_chat_intercepted_total counter`,
    `openorder_chat_intercepted_total ${metrics.chatIntercepted}`,
    `# HELP openorder_chat_rate_limited_total Chat turns rejected by Redis rate limit.`,
    `# TYPE openorder_chat_rate_limited_total counter`,
    `openorder_chat_rate_limited_total ${metrics.chatRateLimited}`,
    `# HELP openorder_checkout_succeeded_total Successful checkouts.`,
    `# TYPE openorder_checkout_succeeded_total counter`,
    `openorder_checkout_succeeded_total ${metrics.checkoutSucceeded}`,
    `# HELP openorder_checkout_failed_total Failed checkouts.`,
    `# TYPE openorder_checkout_failed_total counter`,
    `openorder_checkout_failed_total ${metrics.checkoutFailed}`,
    "",
  ].join("\n");
}
