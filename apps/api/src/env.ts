export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.API_PORT ?? 3001),
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://openorder:openorder@127.0.0.1:5433/openorder",
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6380",
  jwtSecret: process.env.JWT_SECRET ?? "openorder-dev-secret-change-me",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "http://127.0.0.1:4010/v1",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "mock",
  openaiModel: process.env.OPENAI_MODEL ?? "openorder-mock",
  chatRateLimit: Number(process.env.CHAT_RATE_LIMIT_PER_MINUTE ?? 20),
};
