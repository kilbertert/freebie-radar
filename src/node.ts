// 先加载 .env* 到 process.env —— config.ts 在 import 时读它，顺序不能换
import "./server/env-node.ts";

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { config } from "./server/config.ts";
import { initNodeDb } from "./server/db-node.ts";
import { get, migrate, run } from "./server/db.ts";
import { registerApi } from "./server/routes.ts";
import { collectTick, cleanupTick, dailyTick } from "./server/cron.ts";
import { pushTick, startPushScheduler } from "./server/push.ts";
import { ensureSources } from "./server/collectors/index.ts";
import { releaseFlareSession, releaseFlareSessionIfIdle } from "./server/flaresolverr.ts";

initNodeDb(config.databasePath);
migrate();
ensureSources();
// 上次进程意外退出可能遗留 status='running' 的记录，启动时收口
run(
  "UPDATE runs SET status = 'failed', finished_at = ?, error = COALESCE(error, '进程重启中断') WHERE status = 'running'",
  new Date().toISOString(),
);

const app = new Hono();
app.use("*", logger());

app.get("/health", (c) => {
  const row = get<{ ok: number }>("SELECT 1 AS ok");
  return c.json({
    ok: row?.ok === 1,
    version: "0.1.0",
    time: new Date().toISOString(),
    sources: config.enabledSources.length || "all",
  });
});

registerApi(app);

// Hono 的 serveStatic 的 root/path 都相对 process.cwd()，传绝对路径会拼出错误路径；
// 另外带 hash 的 assets 应该长缓存，index.html 必须 no-store，否则发版后用户会拿到旧 HTML 白屏。
const webDistAbs = fileURLToPath(new URL("../dist/web", import.meta.url));
if (existsSync(webDistAbs)) {
  const relRoot = relative(process.cwd(), webDistAbs).split(sep).join("/") || ".";
  app.use(
    "/assets/*",
    serveStatic({
      root: relRoot,
      onFound: (_path, c) => {
        c.header("Cache-Control", "public, max-age=31536000, immutable");
      },
    }),
  );
  app.use(
    "/*",
    serveStatic({
      root: relRoot,
      onFound: (p, c) => {
        if (p.endsWith(".html")) c.header("Cache-Control", "no-store, must-revalidate");
      },
    }),
  );
  app.get(
    "*",
    serveStatic({
      path: relRoot + "/index.html",
      onFound: (_path, c) => {
        c.header("Cache-Control", "no-store, must-revalidate");
      },
    }),
  );
} else {
  app.get("/", (c) => c.text("freebie-radar API 已启动。前端未构建，运行 pnpm build。"));
}

if (config.enableScheduler) {
  startPushScheduler();
  // 与 DO.tick() 同一个 tick 体；30s 粒度贴近上游原版
  const tick = async () => {
    await collectTick();
    await pushTick();
    await dailyTick();
    cleanupTick();
    await releaseFlareSessionIfIdle();
  };
  void tick();
  const timer = setInterval(() => void tick(), 30_000);
  timer.unref();
}

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`[radar] listening on http://${config.host}:${info.port}`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    server.close();
    Promise.race([releaseFlareSession(), new Promise((r) => setTimeout(r, 800))]).finally(() => {
      process.exit(0);
    });
  });
}
