# OpenOrder

开源的对话下单助手：大模型可自行配置，首发垂直是茶饮/咖啡。

本仓库由 [Beamus Wayne](https://github.com/BeamusWayne) 维护。

## 本地运行

本机若已有 Postgres/Redis，Compose 使用 **5433 / 6380**，避免抢默认端口。

```bash
cp .env.example .env
docker compose -f infra/compose.yml up -d
pnpm install
DATABASE_URL=postgres://openorder:openorder@127.0.0.1:5433/openorder pnpm db:migrate
DATABASE_URL=postgres://openorder:openorder@127.0.0.1:5433/openorder pnpm db:seed
pnpm --filter @openorder/llm-mock dev
pnpm --filter @openorder/api dev
pnpm --filter @openorder/web dev
```

打开 http://127.0.0.1:3000 。默认 `OPENAI_BASE_URL=http://127.0.0.1:4010/v1`，不需要真实 API Key。换成任意 OpenAI 兼容网关时，只改 `.env` 里的 `baseURL` / `apiKey` / `model`。

## 测试

```bash
pnpm test
DATABASE_URL=postgres://openorder:openorder@127.0.0.1:5433/openorder pnpm --filter @openorder/domain test
pnpm db:seed
pnpm test:load
# 没有 k6 时：
pnpm test:load:node
```

限量 SKU 库存为 2。20 路并发结账必须恰好成功 2 单，其余售罄。压测前请重新 seed。

## 范围

当前分支交付 Web、领域下单、OpenAI 协议模拟 LLM、意图拦截、Redis 限流、MCP 工具目录和并发测试。iOS App 不在本分支。
