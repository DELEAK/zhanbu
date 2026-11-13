#!/usr/bin/env node
// scripts/backfill-reports.mjs —— 给历史记录批量补生成 AI 解读（可选，会消耗 AI 额度）
//
// 用法：
//   node scripts/backfill-reports.mjs --token <管理口令> [--base http://127.0.0.1:3901] [--limit 5] [--dry-run]
//
// 逻辑：先拉 /api/admin/records（分页）→ 过滤 hasReport=false → 逐条 POST /api/admin/records/:id/interpret
//      每条 10-60 秒；失败只记录不中断。默认只处理 5 条（防止手滑烧额度），--limit 0 表示全部。
//
// 注意：脚本只调用本项目的 admin 接口，不直接读写 SQLite；API Key 由服务端持有。
const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
}
const TOKEN = arg('token', process.env.DIVINATION_ADMIN_TOKEN || '');
const BASE = (arg('base', process.env.BASE || 'http://127.0.0.1:3901')).replace(/\/$/, '');
const LIMIT = Number(arg('limit', '5'));
const DRY = args.includes('--dry-run');
const ART = arg('artId', 'all');

if (!TOKEN) {
  console.error('缺少 --token（或环境变量 DIVINATION_ADMIN_TOKEN）');
  process.exit(2);
}

async function api(path, init) {
  const r = await fetch(BASE + path, {
    ...init,
    headers: { 'x-admin-token': TOKEN, 'content-type': 'application/json', ...(init?.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(body.message || `HTTP ${r.status}`);
    e.code = body.error;
    throw e;
  }
  return body;
}

const PAGE = 100;
let offset = 0;
const targets = [];
while (true) {
  const page = await api(`/api/admin/records?limit=${PAGE}&offset=${offset}&artId=${encodeURIComponent(ART)}`);
  const rows = page.list || [];
  rows.filter((r) => !r.hasReport).forEach((r) => targets.push(r));
  offset += rows.length;
  if (!rows.length || offset >= (page.total || 0)) break;
}

console.log(`待补生成：${targets.length} 条（hasReport=false）`);
const todo = LIMIT > 0 ? targets.slice(0, LIMIT) : targets;
if (DRY) {
  todo.forEach((r) => console.log(`  [dry-run] ${r.id} ${r.artId} ${r.createdAt} ${(r.question || '(空)').slice(0, 30)}`));
  console.log(`dry-run：不实际调用（--limit 0 表示全部；本次将处理 ${todo.length} 条）`);
  process.exit(0);
}

let ok = 0, fail = 0;
for (const [i, r] of todo.entries()) {
  const t0 = Date.now();
  process.stdout.write(`[${i + 1}/${todo.length}] ${r.id} ${r.artId} … `);
  try {
    const out = await api(`/api/admin/records/${encodeURIComponent(r.id)}/interpret`, { method: 'POST', body: '{}' });
    ok++;
    console.log(`ok（${out.model}，${(out.text || '').length} 字，${((Date.now() - t0) / 1000).toFixed(0)}s）`);
  } catch (e) {
    fail++;
    console.log(`失败：${e.code || ''} ${e.message}`);
    if (e.code === 'AI_NOT_CONFIGURED' || e.code === 'MIMO_NOT_CONFIGURED') break; // 没配 Key 就别继续了
  }
}
console.log(`\n完成：成功 ${ok}，失败 ${fail}；剩余未补 ${Math.max(targets.length - ok, 0)} 条（再跑一次可继续）`);
