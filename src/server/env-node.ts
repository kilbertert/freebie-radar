import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Node 部署形态专用：先加载 .env.local/.env，再由 config.ts 读 process.env。
// 必须在 import config 之前执行（见 src/node.ts 的 import 顺序）。
for (const file of [".env.local", ".env"]) {
  const p = resolve(process.cwd(), file);
  if (existsSync(p)) {
    try {
      process.loadEnvFile(p);
    } catch {
      /* 忽略损坏的 env 文件 */
    }
  }
}
