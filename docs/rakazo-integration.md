# rakazo 消费对接

生产实例：`https://radar.ranlei.work`（svc-gz-117，service-host 隧道入口）。
feed 读接口公开；管理接口要 `ADMIN_TOKEN`（dev 机 `~/.config/freebie-radar/admin-token`）。

## 增量轮询契约

```
GET /api/items?after_id=<last_id>&sort=id&limit=100&status=active
```

- `after_id`：自增主键游标，`id > N` 升序返回 —— 比时间戳 `since` 严格，同刻多条不漏不重。
- 消费方存「见过的最大 id」为下次游标；`total` 字段是剩余总数（游标之后）。
- 可选过滤：`minScore`、`obtain=free`、`kind`、`hasCodes=1`、`freeOnly=1`、
  `unexpired=1`、`lang=zh`、`search`、`source`、`limit`≤200。
- 注意：AI 二审未配置时 `ai_keep` 为 NULL，`aiOnly=1` 会全部过滤掉 ——
  别拿它当默认过滤。

## Luna routine（粘进 rakazo 即用）

```
每 15 分钟执行：
1. 读工作目录 freebie-radar-cursor 里的 last_id（不存在当 0）。
2. GET https://radar.ranlei.work/api/items?after_id={last_id}&sort=id&limit=100&status=active
3. 对新条目按「真白嫖价值」筛选：限免/兑换码/免费额度优先，
   抽奖/试用/推广/纯新闻跳过；值得通知的用微信发给我，
   格式「🎁 <标题> · <来源名>」+ 链接 + 一句中文说明。没有值得发的就不发。
4. 把本批最大 id 写回 cursor。
```

## 验收

```bash
curl -s "https://radar.ranlei.work/api/items?after_id=0&sort=id&limit=2" | jq '.items[].id'
# rakazo-api 容器内 node -e fetch 实测连通（2026-11-14）
```
