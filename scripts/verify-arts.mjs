#!/usr/bin/env node
// scripts/verify-arts.mjs —— 七术后端验收（docs/plan-nine-arts.md §7 A1–A7）
//
// A1  POST /api/chart 七术均 200，id 以 d_ 开头，brief ≥ 60 字
// A2  管理列表按 artId 过滤可查到记录，且 summary 非空
// A3  GET /api/admin/records/:id 的 facts 与 POST 返回的 brief 逐字相同
// A4  /api/prompt 含「必须逐字引用下列排盘事实」+ persona 名 + brief 逐字；缺 resultRaw → 400 NEED_RESULT
// A5  qimen / liuren / xiaoliuren / bazi / ziwei 的 duanyu 非空（meihua / astrology 允许为空）
// A6  非法输入 → 400 BAD_INPUTS
// A7  bazi 时辰未知（hourIndex -1）→ hourGZ 为「未知」或空，prompt 含「时辰未知 · 最高约束」
//
// 端口优先级：VERIFY_BASE > 环境变量 PORT > 项目根 .env 的 PORT > 3901
// 管理接口口令：环境变量 DIVINATION_ADMIN_TOKEN > 项目根 .env 的 DIVINATION_ADMIN_TOKEN
// 输出：逐项 PASS/FAIL；任一 FAIL → exit 1。

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function readEnv(key) {
  if (process.env[key]) return process.env[key];
  try {
    const line = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => new RegExp('^' + key + '\\s*=').test(l));
    if (line) return line.split('=')[1].trim().split(/\s+#/)[0];
  } catch { /* 没有 .env */ }
  return '';
}

const BASE = process.env.VERIFY_BASE || `http://127.0.0.1:${readEnv('PORT') || '3901'}`;
const TOKEN = readEnv('DIVINATION_ADMIN_TOKEN');

let failures = 0;
const ok = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`);
  if (!pass) failures++;
};

async function postJson(url, body, headers = {}) {
  const res = await fetch(BASE + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* 非 JSON */ }
  return { status: res.status, json };
}

async function getJson(url, headers = {}) {
  const res = await fetch(BASE + url, { headers });
  let json = null;
  try { json = await res.json(); } catch { /* 非 JSON */ }
  return { status: res.status, json };
}

// 七术有效入参（与 chartInputs 归一化契约对应）
const CASES = [
  { artId: 'bazi', inputs: { y: 1990, m: 6, d: 15, hourIndex: 6, gender: '男' }, persona: '子平命理师' },
  { artId: 'ziwei', inputs: { y: 1990, m: 6, d: 15, hourIndex: 6, gender: '男' }, persona: '紫微斗数专家' },
  { artId: 'astrology', inputs: { y: 1990, m: 6, d: 15, hour: 12, min: 0, lng: 116.4, lat: 39.9 }, persona: '古典占星师' },
  { artId: 'qimen', inputs: { datetime: '2026-11-13T10:30:00+08:00' }, persona: '奇门遁甲师' },
  { artId: 'liuren', inputs: { datetime: '2026-11-13T10:30:00+08:00' }, persona: '大六壬课师' },
  { artId: 'meihua', inputs: { mode: 'number', n1: 7, n2: 13, n3: 5 }, persona: '梅花易数家' },
  { artId: 'xiaoliuren', inputs: { mode: 'number', n1: 7, n2: 13, n3: 5 }, persona: '掌诀占时师' },
];

const ADMIN_HEADERS = { 'x-admin-token': TOKEN };
const MINGPAN = new Set(['bazi', 'ziwei', 'astrology']);

const results = {};
let hardRule = false;
let personaHit = 0;

// ── A1：起盘 + brief ──
for (const c of CASES) {
  const { status, json } = await postJson('/api/chart', {
    artId: c.artId,
    question: `验收 ${c.artId}：此事走向如何`,
    category: '事业',
    inputs: c.inputs,
  });
  const brief = (json && json.brief) || '';
  const pass = status === 200 && typeof (json && json.id) === 'string' && json.id.startsWith('d_') &&
    brief.length >= 60 && json.artId === c.artId &&
    json.kind === (MINGPAN.has(c.artId) ? 'mingpan' : 'zhanwen');
  results[c.artId] = json;
  ok(`A1 ${c.artId} 起盘 200 · id d_ 前缀 · brief ≥ 60 字`,
    pass,
    `status=${status}，id=${json && json.id}，kind=${json && json.kind}，brief ${brief.length} 字`);
}

// ── A2：管理列表按 artId 过滤 + summary ──
for (const c of CASES) {
  if (!TOKEN) {
    ok(`A2 ${c.artId} 管理列表摘要`, false, '缺少 DIVINATION_ADMIN_TOKEN（.env 未配置）');
    continue;
  }
  const { status, json } = await getJson(`/api/admin/records?limit=1&artId=${c.artId}`, ADMIN_HEADERS);
  const row = json && json.list && json.list[0];
  ok(`A2 ${c.artId} 管理列表按 artId 可查且 summary 非空`,
    status === 200 && !!row && typeof row.summary === 'string' && row.summary.length > 0,
    `status=${status}，summary=${JSON.stringify(row && row.summary)}`);
}

// ── A3：记录详情的 facts 与 brief 逐字相同 ──
for (const c of CASES) {
  if (!TOKEN) {
    ok(`A3 ${c.artId} facts === brief`, false, '缺少 DIVINATION_ADMIN_TOKEN（.env 未配置）');
    continue;
  }
  const id = results[c.artId] && results[c.artId].id;
  const { status, json } = await getJson(`/api/admin/records/${encodeURIComponent(id || '')}`, ADMIN_HEADERS);
  const facts = (json && json.facts) || '';
  const brief = (results[c.artId] && results[c.artId].brief) || '';
  ok(`A3 ${c.artId} facts 与 brief 逐字相同`,
    status === 200 && facts === brief && facts.length > 0,
    `status=${status}，facts ${facts.length} 字 === brief ${brief.length} 字：${facts === brief}`);
}

// ── A4：/api/prompt 九术 persona + 硬约束 + brief 逐字 ──
for (const c of CASES) {
  const { status, json } = await postJson('/api/prompt', {
    artId: c.artId,
    question: `验收 ${c.artId}：此事走向如何`,
    category: '事业',
    resultRaw: results[c.artId] && results[c.artId].resultRaw,
  });
  const prompt = (json && json.prompt) || '';
  const brief = (results[c.artId] && results[c.artId].brief) || '';
  const pass = status === 200 && prompt.includes('必须逐字引用下列排盘事实') &&
    prompt.includes(c.persona) && prompt.includes(brief) && brief.length > 0;
  if (prompt.includes('必须逐字引用下列排盘事实')) hardRule = true;
  if (prompt.includes(c.persona)) personaHit++;
  ok(`A4 ${c.artId} 提示词含硬约束 + persona（${c.persona}）+ brief 逐字`,
    pass,
    `status=${status}，prompt ${prompt.length} 字，硬约束=${prompt.includes('必须逐字引用下列排盘事实')}，persona=${prompt.includes(c.persona)}，brief 逐字=${prompt.includes(brief)}`);
}

// A4 补充：七术缺 resultRaw → 400 NEED_RESULT
for (const c of CASES) {
  const { status, json } = await postJson('/api/prompt', { artId: c.artId, question: '缺盘面' });
  ok(`A4 ${c.artId} 缺 resultRaw → 400 NEED_RESULT`,
    status === 400 && json && json.error === 'NEED_RESULT',
    `status=${status}，error=${json && json.error}`);
}

// ── A5：断语非空（五术必填，梅花/占星允许为空）──
for (const artId of ['qimen', 'liuren', 'xiaoliuren', 'bazi', 'ziwei']) {
  const duanyu = (results[artId] && results[artId].duanyu) || '';
  ok(`A5 ${artId} duanyu 非空`, duanyu.length > 0, `${duanyu.length} 字`);
}

// ── A6：非法输入 → 400 ──
const BAD = [
  ['BAD_ART 不支持的艺术种', { artId: 'unknown', inputs: {}, question: 'q' }, 400, 'BAD_ART'],
  ['缺生日', { artId: 'bazi', inputs: { m: 6, d: 15, hourIndex: 6, gender: '男' } }, 400, 'BAD_INPUTS'],
  ['非法日期 2/31', { artId: 'bazi', inputs: { y: 1990, m: 2, d: 31, hourIndex: 6, gender: '男' } }, 400, 'BAD_INPUTS'],
  ['hourIndex 越界', { artId: 'bazi', inputs: { y: 1990, m: 6, d: 15, hourIndex: 12, gender: '男' } }, 400, 'BAD_INPUTS'],
  ['梅花缺 n3', { artId: 'meihua', inputs: { mode: 'number', n1: 7, n2: 13 } }, 400, 'BAD_INPUTS'],
  ['经度越界', { artId: 'astrology', inputs: { y: 1990, m: 6, d: 15, hour: 12, lng: 999 } }, 400, 'BAD_INPUTS'],
  ['非法 datetime', { artId: 'qimen', inputs: { datetime: 'not-a-date' } }, 400, 'BAD_INPUTS'],
  ['问题超长', { artId: 'bazi', question: 'x'.repeat(301), inputs: { y: 1990, m: 6, d: 15, hourIndex: 6, gender: '男' } }, 400, 'BAD_QUESTION'],
];
for (const [name, body, wantStatus, wantError] of BAD) {
  const { status, json } = await postJson('/api/chart', body);
  ok(`A6 ${name} → ${wantStatus} ${wantError}`,
    status === wantStatus && json && json.error === wantError,
    `status=${status}，error=${json && json.error}，message=${json && json.message}`);
}

// ── A7：bazi 时辰未知 ──
{
  const { status, json } = await postJson('/api/chart', {
    artId: 'bazi',
    question: '时辰未知的验收',
    category: '综合',
    inputs: { y: 1990, m: 6, d: 15, hourIndex: -1, gender: '男' },
  });
  const hourGZ = json && json.resultRaw && json.resultRaw.hourGZ;
  const unknownHour = hourGZ === '未知' || hourGZ === '' || hourGZ == null;
  const { status: ps, json: pj } = await postJson('/api/prompt', {
    artId: 'bazi', question: '时辰未知的验收', category: '综合', resultRaw: json && json.resultRaw,
  });
  const prompt = (pj && pj.prompt) || '';
  ok('A7 bazi 时辰未知：hourGZ 为未知/空，且提示词含「时辰未知 · 最高约束」',
    status === 200 && unknownHour && ps === 200 && prompt.includes('时辰未知 · 最高约束'),
    `hourGZ=${JSON.stringify(hourGZ)}，prompt 含约束=${prompt.includes('时辰未知 · 最高约束')}`);

  const { json: zj } = await postJson('/api/chart', {
    artId: 'ziwei', question: '紫微时辰未知', category: '综合',
    inputs: { y: 1990, m: 6, d: 15, hourIndex: -1, gender: '男' },
  });
  const { json: zp } = await postJson('/api/prompt', {
    artId: 'ziwei', question: '紫微时辰未知', category: '综合', resultRaw: zj && zj.resultRaw,
  });
  ok('A7 ziwei 时辰未知：correctedHour=-1 且提示词含约束',
    zj && zj.resultRaw && zj.resultRaw.correctedHour === -1 && ((zp && zp.prompt) || '').includes('时辰未知 · 最高约束'),
    `correctedHour=${zj && zj.resultRaw && zj.resultRaw.correctedHour}`);
}

ok('汇总：硬约束逐字保留 + 七术 persona 全命中', hardRule && personaHit === CASES.length,
  `硬约束=${hardRule}，persona=${personaHit}/${CASES.length}`);

console.log(failures === 0 ? '\n七术后端验收全部通过' : `\n${failures} 项未通过`);
process.exit(failures === 0 ? 0 : 1);
