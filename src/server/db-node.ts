import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { initDbBackend, type DbBackend, type SqlValue } from "./db.ts";

/**
 * node:sqlite 后端：文件库（Node 部署形态）或 :memory:（测试）。
 * 与 DO storage.sql 同为同步 API，语义对齐。
 */
export function makeNodeBackend(path: string): DbBackend {
  const p = path === ":memory:" ? path : resolve(process.cwd(), path);
  if (p !== ":memory:") mkdirSync(dirname(p), { recursive: true });
  const db = new DatabaseSync(p);
  if (p !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA busy_timeout = 20000;");
    db.exec("PRAGMA cache_size = -8000;");
  }
  return {
    exec: (query, params: SqlValue[]) => {
      const sql = query.trim();
      // node:sqlite 的 prepare 对多语句串只执行第一条 —— 多于一句走 exec
      if (sql.split(";").filter((s) => s.trim()).length > 1) {
        db.exec(sql);
        return { rows: [], rowsWritten: 0 };
      }
      const stmt = db.prepare(sql.replace(/;+\s*$/, ""));
      if (/^(select|pragma|with|explain)/i.test(sql)) {
        return { rows: stmt.all(...params) as Record<string, unknown>[], rowsWritten: 0 };
      }
      const info = stmt.run(...params);
      return { rows: [], rowsWritten: Number(info.changes) };
    },
    transactionSync: <T,>(fn: () => T): T => {
      db.exec("BEGIN");
      try {
        const out = fn();
        db.exec("COMMIT");
        return out;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
}

export function initNodeDb(path: string): void {
  initDbBackend(makeNodeBackend(path));
}
