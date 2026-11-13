#!/usr/bin/env node
// scripts/verify-e2e.mjs —— 端到端验证的真浏览器行为测试（t6 验证用）
//
// 覆盖验收 7「双模式来回切换不刷新页面，切换后已抽结果与已展开的深度面板状态不丢失」，
// 并顺带实证验收 6 的运行时语义（首访默认 data-perf=low）：
//   E1  全新配置（无 localStorage）首访 tarot.html / liuyao.html → dataset.perf === 'low'
//   E2  塔罗：选牌阵 → 服务端抽牌 → 简要结果；深度面板展开前 .deep-body 无内容（深度默认不入 DOM）→ 展开后注入
//   E3  切 high：页面不刷新（window 标记存活）、结果节点身份不变（=== 同一 DOM 节点）、
//       简要文本与已展开深度内容不丢失
//   E4  回切 low：同 E3
//   E5  localStorage 持久化：high 刷新后仍 high；回 low 刷新后仍 low
//   E6  六爻：起卦 → 简要 → 展开深度 → 切 high/low，状态同样零丢失
//   E7  （F1）问题留空直接抽牌：深度仍渲染全部段落（开篇/总览/逐张牌位解读×3/深度与建议/提示词），
//       且结构签名与填写问题时一致（E7b 对比）
//   E8  （F2）塔罗深度已加载后切换问题分类 → 深度内容按新分类刷新（innerHTML 变化）
//   E9  （F3）六爻深度收起态切换问题分类 → data-loaded 失效，重展开按新分类刷新（用神图例含新分类）
//
// 运行前提：整站已在 http://127.0.0.1:3901 运行（npm start）；本机有 firefox。
// 端口优先级：VERIFY_BASE > 环境变量 PORT > 项目根 .env 里的 PORT > 3901
// 输出：逐项 PASS/FAIL；任一 FAIL → exit 1。

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 端口：环境变量 PORT > 项目根 .env 的 PORT > 3901（.env 里 PORT=3904 就跟着 3904 跑）
function readPort() {
  if (process.env.PORT) return process.env.PORT;
  try {
    const envFile = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '.env');
    const line = fs.readFileSync(envFile, 'utf8').split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /^PORT\s*=/.test(l));
    if (line) return line.split('=')[1].trim().split(/\s+#/)[0];
  } catch { /* 没有 .env 就用默认 */ }
  return '3901';
}

const BASE = process.env.VERIFY_BASE || `http://127.0.0.1:${readPort()}`;
const DEBUG_PORT = 4444;

let failures = 0;
const ok = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`);
  if (!pass) failures++;
};

// ─── Firefox BiDi 最小客户端 ───
function bdiClient(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
      setTimeout(() => {
        if (pending.has(i)) { pending.delete(i); rej(new Error('BiDi 超时: ' + method)); }
      }, 15000);
    });
  return { send };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evalIn(send, ctx, expression) {
  const r = await send('script.evaluate', {
    expression,
    target: { context: ctx },
    awaitPromise: true,
    resultOwnership: 'root',
  });
  if (r.type === 'exception') throw new Error('页面脚本异常: ' + JSON.stringify(r.exceptionDetails || r));
  return r.result?.value;
}

async function waitFor(send, ctx, expression, desc, timeoutMs = 8000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeoutMs) {
    last = await evalIn(send, ctx, expression).catch((e) => (last = e.message));
    if (last === true) return true;
    await sleep(150);
  }
  throw new Error(`等待超时（${desc}）：最后取值 ${JSON.stringify(last)}`);
}

// ─── 主流程 ───
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-verify-'));
const ff = spawn('firefox', ['--headless', `--remote-debugging-port=${DEBUG_PORT}`, '--profile', profile, '-no-remote', 'about:blank'], {
  stdio: 'ignore',
});
let ws;
try {
  // 等 Firefox 远程端口就绪
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    try {
      await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      ready = true;
    } catch { await sleep(250); }
  }
  if (!ready) throw new Error('Firefox 远程调试端口未就绪');

  ws = new WebSocket(`ws://127.0.0.1:${DEBUG_PORT}/session`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('BiDi WS 连接失败')); });
  const { send } = bdiClient(ws);
  await send('session.new', { capabilities: {} });
  const tree = await send('browsingContext.getTree');
  const ctx = tree.contexts[0].context;

  // ── E1+E2+E3+E4+E5：塔罗页 ──
  await send('browsingContext.navigate', { context: ctx, url: `${BASE}/tarot.html` });
  await waitFor(send, ctx, `document.querySelectorAll('.spread-card').length > 0`, '牌阵列表渲染');

  ok('E1 首访默认 low（tarot.html，全新配置）',
    (await evalIn(send, ctx, `document.documentElement.dataset.perf`)) === 'low',
    'documentElement.dataset.perf === "low"');

  // 选牌阵（未选前按钮 disabled 也顺带断言）
  const disabledBefore = await evalIn(send, ctx, `document.getElementById('drawBtn').disabled`);
  await evalIn(send, ctx, `document.querySelector('.spread-card[data-id="three-card"]').click(); true`);
  await waitFor(send, ctx, `!document.getElementById('drawBtn').disabled`, '抽牌按钮启用');
  ok('E2a 未选牌阵时抽牌按钮 disabled', disabledBefore === true && (await evalIn(send, ctx, `document.getElementById('drawBtn').disabled`)) === false,
    '选择 three-card 前 disabled=true，点击后 disabled=false');

  await evalIn(send, ctx, `document.getElementById('drawBtn').click(); true`);
  await waitFor(send, ctx, `!!document.querySelector('#result .card-row')`, '简要结果渲染');
  await waitFor(send, ctx, `document.querySelectorAll('#result .card-row .card-slot').length === 3`, '三张牌渲染');

  const deepEmptyBefore = await evalIn(send, ctx, `var d=document.querySelector('#result .deep-panel'); d && !d.open && d.querySelector('.deep-body').innerHTML.trim()===''`);
  ok('E2b 深度默认不入 DOM（未展开时 .deep-body 为空）', deepEmptyBefore === true, 'deep-panel 未 open，.deep-body 空字符串');

  await evalIn(send, ctx, `document.querySelector('#result .deep-panel summary').click(); true`);
  await waitFor(send, ctx, `var d=document.querySelector('#result .deep-panel'); d.open && d.getAttribute('data-loaded')==='1' && d.querySelector('.deep-body').innerHTML.length > 500`, '深度内容注入');
  const briefText = await evalIn(send, ctx, `document.querySelector('#result .result-meta').innerText`);
  const deepLen = await evalIn(send, ctx, `document.querySelector('#result .deep-body').innerHTML.length`);

  // ── E3：切 high ──
  await evalIn(send, ctx, `window.__noReloadMark = 1; window.__resultNode = document.getElementById('result'); true`);
  await evalIn(send, ctx, `document.querySelector('.perf-toggle').click(); true`);
  await waitFor(send, ctx, `document.documentElement.dataset.perf === 'high'`, '切换到 high');
  const e3 = await evalIn(send, ctx, `JSON.stringify({
    mark: window.__noReloadMark === 1,
    sameNode: window.__resultNode === document.getElementById('result'),
    briefSame: document.querySelector('#result .result-meta').innerText === ${JSON.stringify(briefText)},
    deepOpen: document.querySelector('#result .deep-panel').open,
    deepLen: document.querySelector('#result .deep-body').innerHTML.length
  })`);
  const j3 = JSON.parse(e3);
  ok('E3 切 high：不刷新 + 结果/深度状态零丢失', j3.mark && j3.sameNode && j3.briefSame && j3.deepOpen && j3.deepLen >= deepLen,
    `window 标记存活=${j3.mark}，结果节点身份不变=${j3.sameNode}，简要文本不变=${j3.briefSame}，深度仍展开=${j3.deepOpen}，深度内容 ${j3.deepLen}≥${deepLen}`);

  // ── E4：回 low ──
  await evalIn(send, ctx, `document.querySelector('.perf-toggle').click(); true`);
  await waitFor(send, ctx, `document.documentElement.dataset.perf === 'low'`, '切回 low');
  const e4 = await evalIn(send, ctx, `JSON.stringify({
    mark: window.__noReloadMark === 1,
    sameNode: window.__resultNode === document.getElementById('result'),
    briefSame: document.querySelector('#result .result-meta').innerText === ${JSON.stringify(briefText)},
    deepOpen: document.querySelector('#result .deep-panel').open
  })`);
  const j4 = JSON.parse(e4);
  ok('E4 回切 low：不刷新 + 状态零丢失', j4.mark && j4.sameNode && j4.briefSame && j4.deepOpen,
    `标记=${j4.mark}，节点不变=${j4.sameNode}，简要不变=${j4.briefSame}，深度仍展开=${j4.deepOpen}`);

  // ── E5：localStorage 持久化 ──
  await evalIn(send, ctx, `document.querySelector('.perf-toggle').click(); true`); // → high
  await waitFor(send, ctx, `document.documentElement.dataset.perf === 'high'`, '再切 high');
  await send('browsingContext.navigate', { context: ctx, url: `${BASE}/tarot.html` });
  await waitFor(send, ctx, `document.querySelectorAll('.spread-card').length > 0`, '刷新后重载');
  const persistHigh = await evalIn(send, ctx, `localStorage.getItem('divination.perf')==='high' && document.documentElement.dataset.perf==='high'`);
  await evalIn(send, ctx, `document.querySelector('.perf-toggle').click(); true`); // → low
  await send('browsingContext.navigate', { context: ctx, url: `${BASE}/tarot.html` });
  await waitFor(send, ctx, `document.querySelectorAll('.spread-card').length > 0`, '刷新后重载 2');
  const persistLow = await evalIn(send, ctx, `localStorage.getItem('divination.perf')==='low' && document.documentElement.dataset.perf==='low'`);
  ok('E5 切换写 localStorage，刷新后保持', persistHigh === true && persistLow === true, `high 持久=${persistHigh}，low 持久=${persistLow}`);

  // ── E6：六爻页同款状态保持 ──
  await send('browsingContext.navigate', { context: ctx, url: `${BASE}/liuyao.html` });
  await waitFor(send, ctx, `typeof window.DS !== 'undefined' && !!document.getElementById('castBtn')`, '六爻页载入且脚本就绪');
  // 轮询内重复点击直到出结果：静态按钮可能先于 liuyao.js init 绑定监听，早点击会被吞（onCast 有 busy 防重入，重试安全）
  await waitFor(send, ctx,
    `(function(){var q=document.getElementById('question');if(q&&q.value!=='测试：事业走向')q.value='测试：事业走向';var b=document.getElementById('castBtn');if(b&&!document.querySelector('#result .deep-panel'))b.click();return !!document.querySelector('#result .deep-panel');})()`,
    '六爻简要结果渲染', 12000);
  await evalIn(send, ctx, `document.querySelector('#result .deep-panel summary').click(); true`);
  await waitFor(send, ctx, `var d=document.querySelector('#result .deep-panel'); d.open && d.getAttribute('data-loaded')==='1' && d.querySelector('.deep-body').innerHTML.length > 500`, '六爻深度注入');
  const lyBrief = await evalIn(send, ctx, `document.querySelector('#result').innerText.slice(0, 200)`);
  await evalIn(send, ctx, `window.__noReloadMark = 6; window.__resultNode = document.getElementById('result'); true`);
  await evalIn(send, ctx, `document.querySelector('.perf-toggle').click(); true`);
  await waitFor(send, ctx, `document.documentElement.dataset.perf === 'high'`, '六爻切 high');
  await evalIn(send, ctx, `document.querySelector('.perf-toggle').click(); true`);
  await waitFor(send, ctx, `document.documentElement.dataset.perf === 'low'`, '六爻切回 low');
  const e6 = await evalIn(send, ctx, `JSON.stringify({
    mark: window.__noReloadMark === 6,
    sameNode: window.__resultNode === document.getElementById('result'),
    briefSame: document.querySelector('#result').innerText.slice(0, 200) === ${JSON.stringify(lyBrief)},
    deepOpen: document.querySelector('#result .deep-panel').open,
    deepFilled: document.querySelector('#result .deep-body').innerHTML.length > 500
  })`);
  const j6 = JSON.parse(e6);
  ok('E6 六爻页：双模式来回切换状态零丢失', j6.mark && j6.sameNode && j6.briefSame && j6.deepOpen && j6.deepFilled,
    `标记=${j6.mark}，节点不变=${j6.sameNode}，简要不变=${j6.briefSame}，深度仍展开=${j6.deepOpen}，深度仍有内容=${j6.deepFilled}`);

  // ── E9（F3）：六爻深度收起态改分类 → 重展开按新分类刷新 ──
  await evalIn(send, ctx, `document.querySelector('#result .deep-panel summary').click(); true`); // 收起
  await waitFor(send, ctx, `!document.querySelector('#result .deep-panel').open`, 'E9 深度收起');
  const legendBefore = await evalIn(send, ctx, `(function(){var l=document.querySelector('#result .yong-legend');return l?l.innerHTML:'';})()`);
  await evalIn(send, ctx, `var s=document.getElementById('category'); s.value='财运'; s.dispatchEvent(new Event('change')); true`);
  const invalidated = await evalIn(send, ctx, `var d=document.querySelector('#result .deep-panel'); !d.getAttribute('data-loaded')`);
  await evalIn(send, ctx, `document.querySelector('#result .deep-panel summary').click(); true`); // 重展开
  await waitFor(send, ctx,
    `var d=document.querySelector('#result .deep-panel'); d.getAttribute('data-loaded')==='1' && (function(){var l=document.querySelector('#result .yong-legend');return !!l && l.innerHTML.indexOf('财运')>=0;})()`,
    'E9 重展开按新分类加载', 10000);
  const legendAfter = await evalIn(send, ctx, `(function(){var l=document.querySelector('#result .yong-legend');return l?l.innerHTML:'';})()`);
  ok('E9（F3）六爻深度收起态切换分类 → 重展开按新分类刷新',
    invalidated === true && legendBefore.indexOf('综合') >= 0 && legendAfter.indexOf('财运') >= 0,
    `收起时 data-loaded 已清除=${invalidated}；改前图例含「综合」=${legendBefore.indexOf('综合') >= 0}；重展开图例含「财运」=${legendAfter.indexOf('财运') >= 0}`);

  // ── E7（F1）：空问题直接抽牌，深度仍渲染全部段落 ──
  await send('browsingContext.navigate', { context: ctx, url: `${BASE}/tarot.html` });
  await waitFor(send, ctx, `document.querySelectorAll('.spread-card').length > 0`, 'E7 牌阵列表重载');
  const emptyQ = await evalIn(send, ctx, `document.getElementById('question').value === ''`);
  await evalIn(send, ctx, `document.querySelector('.spread-card[data-id="three-card"]').click(); true`);
  await waitFor(send, ctx, `!document.getElementById('drawBtn').disabled`, 'E7 抽牌按钮启用');
  await evalIn(send, ctx, `document.getElementById('drawBtn').click(); true`);
  await waitFor(send, ctx, `document.querySelectorAll('#result .card-row .card-slot').length === 3`, 'E7 三张牌渲染');
  await evalIn(send, ctx, `document.querySelector('#result .deep-panel summary').click(); true`);
  await waitFor(send, ctx,
    `var d=document.querySelector('#result .deep-panel'); d.getAttribute('data-loaded')==='1' && d.querySelector('.deep-body').innerHTML.indexOf('牌位解读')>=0`,
    'E7 空问题深度注入（含牌位解读）', 10000);

  const sigExpr = `(function(){
    var b=document.querySelector('#result .deep-body');
    var cards=[].slice.call(b.querySelectorAll('.deep-card'));
    return JSON.stringify({
      h4: [].slice.call(b.querySelectorAll('h4')).map(function(e){return e.textContent;}),
      items: b.querySelectorAll('.deep-sec-item').length,
      cards: cards.length,
      posRead: cards.filter(function(c){return c.innerHTML.indexOf('牌位解读')>=0;}).length,
      prompt: !!b.querySelector('.prompt-box')
    });})()`;
  const sigEmpty = JSON.parse(await evalIn(send, ctx, sigExpr));
  ok('E7（F1）空问题深度：段落结构完整（开篇+总览+逐张牌位解读×3+深度与建议+提示词）',
    emptyQ === true && sigEmpty.items === 6 && sigEmpty.cards === 3 && sigEmpty.posRead === 3 && sigEmpty.prompt === true &&
      sigEmpty.h4.join('|') === '开篇与总览|逐张牌义与牌位|深度与建议|AI 解读提示词',
    `问题为空=${emptyQ}；deep-sec-item=${sigEmpty.items}（开篇2+深度4）；牌卡=${sigEmpty.cards} 含牌位解读=${sigEmpty.posRead}；提示词=${sigEmpty.prompt}；h4=${sigEmpty.h4.join(' / ')}`);

  // ── E8（F2）：塔罗深度已加载后切换分类 → 内容刷新 ──
  const htmlBefore = await evalIn(send, ctx, `document.querySelector('#result .deep-body').innerHTML`);
  await evalIn(send, ctx, `var s=document.getElementById('category'); s.value='事业'; s.dispatchEvent(new Event('change')); true`);
  await waitFor(send, ctx,
    `var b=document.querySelector('#result .deep-body'); b.innerHTML !== ${JSON.stringify(htmlBefore)} && b.innerHTML.indexOf('牌位解读')>=0 && !!b.querySelector('.prompt-box')`,
    'E8 分类切换后深度刷新', 10000);
  const htmlAfter = await evalIn(send, ctx, `document.querySelector('#result .deep-body').innerHTML`);
  ok('E8（F2）塔罗深度已加载后切换问题分类 → 内容按新分类刷新',
    htmlAfter !== htmlBefore && htmlAfter.length > 500 && htmlAfter.indexOf('牌位解读') >= 0,
    `deep-body 已更新（${htmlBefore.length} → ${htmlAfter.length} 字符），仍含牌位解读与提示词`);

  // ── E7b：填写问题后重抽，深度结构签名应与空问题一致（F1「结构一致」）──
  // 注意：drawBtn 为异步重渲染，须等 #result 被新面板替换后再展开，否则会读到旧/空面板
  await evalIn(send, ctx, `document.getElementById('question').value='事业该往哪走'; true`);
  await evalIn(send, ctx, `window.__oldPanel = document.querySelector('#result .deep-panel'); document.getElementById('drawBtn').click(); true`);
  await waitFor(send, ctx,
    `document.querySelector('#result .deep-panel') !== window.__oldPanel && document.querySelectorAll('#result .card-row .card-slot').length === 3`,
    'E7b 填问题重抽渲染（新面板替换）', 10000);
  await evalIn(send, ctx, `document.querySelector('#result .deep-panel summary').click(); true`);
  await waitFor(send, ctx,
    `var d=document.querySelector('#result .deep-panel'); d.open && d.getAttribute('data-loaded')==='1' && d.querySelector('.deep-body').innerHTML.indexOf('牌位解读')>=0`,
    'E7b 填问题深度注入', 10000);
  const sigFilled = JSON.parse(await evalIn(send, ctx, sigExpr));
  ok('E7b 深度结构与填写问题时一致（同为 9 段）',
    sigFilled.items === sigEmpty.items && sigFilled.cards === sigEmpty.cards &&
      sigFilled.posRead === sigEmpty.posRead && sigFilled.prompt === sigEmpty.prompt &&
      sigFilled.h4.join('|') === sigEmpty.h4.join('|'),
    `空问题=${JSON.stringify(sigEmpty)}；填问题=${JSON.stringify(sigFilled)}`);

  // ── E10：七个新术页面同款验收（首访 low → 起盘 → 简要 → 深度 → 双模式状态零丢失）──
  const PAGES = [
    { url: '/bazi.html', name: '八字', cast: 'bazi' },
    { url: '/ziwei.html', name: '紫微', cast: 'ziwei' },
    { url: '/qimen.html', name: '奇门', cast: 'qimen' },
    { url: '/liuren.html', name: '六壬', cast: 'liuren' },
    { url: '/meihua.html', name: '梅花', cast: 'meihua' },
    { url: '/xiaoliuren.html', name: '小六壬', cast: 'xiaoliuren' },
    { url: '/astrology.html', name: '占星', cast: 'astrology' },
  ];
  for (const pg of PAGES) {
    await send('browsingContext.navigate', { context: ctx, url: `${BASE}${pg.url}` });
    await waitFor(send, ctx, `typeof window.DS !== 'undefined' && !!document.getElementById('castBtn')`, `${pg.name}页载入`, 10000);
    const perf = await evalIn(send, ctx, `document.documentElement.dataset.perf`);
    await waitFor(send, ctx,
      `(function(){var q=document.getElementById('question');if(q&&q.value!=='验收：此事走向如何')q.value='验收：此事走向如何';var b=document.getElementById('castBtn');if(b&&!document.querySelector('#result .pan'))b.click();return !!document.querySelector('#result .chart-brief')&&!!document.querySelector('#result .deep-panel');})()`,
      `${pg.name}简要结果渲染`, 12000);

    const deepEmptyBefore = await evalIn(send, ctx,
      `var d=document.querySelector('#result .deep-panel'); d && !d.open && d.querySelector('.deep-body').innerHTML.trim()===''`);
    await evalIn(send, ctx, `document.querySelector('#result .deep-panel summary').click(); true`);
    await waitFor(send, ctx,
      `var d=document.querySelector('#result .deep-panel'); d.open && d.getAttribute('data-loaded')==='1' && d.querySelector('.deep-body').innerHTML.length > 800`,
      `${pg.name}深度注入`, 12000);
    const deepLen = await evalIn(send, ctx, `document.querySelector('#result .deep-body').innerHTML.length`);
    const buttons = await evalIn(send, ctx, `!!document.querySelector('#result .deep-body .btn-ai') && !!document.querySelector('#result .deep-body .btn-copy')`);
    const promptBox = await evalIn(send, ctx, `!!document.querySelector('#result .deep-body .prompt-box')`);
    const brief = await evalIn(send, ctx, `document.querySelector('#result .result-meta').innerText + '|' + document.querySelector('#result .chart-brief').innerText.slice(0,160)`);

    await evalIn(send, ctx, `window.__noReloadMark = '${pg.cast}'; window.__resultNode = document.getElementById('result'); true`);
    await evalIn(send, ctx, `document.querySelector('.perf-toggle').click(); true`);
    await waitFor(send, ctx, `document.documentElement.dataset.perf === 'high'`, `${pg.name}切 high`);
    await evalIn(send, ctx, `document.querySelector('.perf-toggle').click(); true`);
    await waitFor(send, ctx, `document.documentElement.dataset.perf === 'low'`, `${pg.name}切回 low`);
    const after = await evalIn(send, ctx, `JSON.stringify({
      mark: window.__noReloadMark === '${pg.cast}',
      sameNode: window.__resultNode === document.getElementById('result'),
      briefSame: document.querySelector('#result .result-meta').innerText + '|' + document.querySelector('#result .chart-brief').innerText.slice(0,160) === ${JSON.stringify(brief)},
      deepOpen: document.querySelector('#result .deep-panel').open,
      deepLen: document.querySelector('#result .deep-body').innerHTML.length
    })`);
    const ja = JSON.parse(after);
    ok(`E10 ${pg.name}页：首访 low → 简要 → deep-body 空 → 深度 >800 → 双模式切换零丢失`,
      perf === 'low' && deepEmptyBefore === true && deepLen > 800 && buttons === true && promptBox === true &&
        ja.mark && ja.sameNode && ja.briefSame && ja.deepOpen && ja.deepLen >= deepLen,
      `perf=${perf}，空深度=${deepEmptyBefore}，深度 ${deepLen} 字，AI/复制=${buttons}，提示词=${promptBox}，标记=${ja.mark}，节点不变=${ja.sameNode}，简要不变=${ja.briefSame}，深度仍展开=${ja.deepOpen}(${ja.deepLen}≥${deepLen})`);
  }

} catch (e) {
  ok('E2E 执行', false, e.message);
} finally {
  try { ws?.close(); } catch {}
  ff.kill('SIGKILL');
  fs.rmSync(profile, { recursive: true, force: true });
}

console.log(failures === 0 ? '\n行为测试全部通过' : `\n${failures} 项未通过`);
process.exit(failures === 0 ? 0 : 1);
