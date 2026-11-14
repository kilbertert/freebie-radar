import type { DatabaseSync } from "node:sqlite";
import { initDbBackend } from "../src/server/db.ts";
import { makeNodeBackend } from "../src/server/db-node.ts";

/**
 * 测试用内存库：与 Node 部署同一个后端实现（src/server/db-node.ts），
 * 只是路径换成 :memory:。只服务 tests/，不进 Worker bundle。
 */
export function useMemoryDb(): void {
  initDbBackend(makeNodeBackend(":memory:"));
}

export type { DatabaseSync };
