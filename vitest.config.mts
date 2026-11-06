import { defineConfig } from "vitest/config";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

// 测试必须连接独立的测试库，避免清空开发/生产数据。
// 默认把 DATABASE_URL 的库名替换为 <db>_test，也可用 TEST_DATABASE_URL 显式指定。
const databaseUrl = process.env.TEST_DATABASE_URL ?? (() => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure your database connection.");
  }
  if (/\/[a-z_][a-z0-9_]*(\?|$)/i.test(url)) {
    return url.replace(/\/([a-z0-9_]+)(\?|$)/i, (_m, db: string, q: string) => `/${db}_test${q}`);
  }
  throw new Error(`Cannot derive a test database name from DATABASE_URL: ${url}`);
})();

if (/_test(\?|$)/.test(databaseUrl) === false) {
  throw new Error(`Refusing to run tests against a non-test database: ${databaseUrl}`);
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30000,
    env: {
      DATABASE_URL: databaseUrl,
    },
  },
});
