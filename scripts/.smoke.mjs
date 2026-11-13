#!/usr/bin/env node
// 临时探针：单页起盘 → 简要 → 深度 → 截图。用法：node scripts/.smoke.mjs bazi
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ART = process.argv[2] || 'bazi';
const BASE = process.env.VERIFY_BASE || 'http://127.0.0.1:3905';
const DEBUG_PORT = 4446;

const SETUP = {
  bazi: `
    document.querySelector('[data-birth="date"]').value = '1990-06-15';
    document.querySelector('[data-birth="hour"]').value = '6';
    document.querySelector('[data-birth="gender"]').value = '男';
    document.querySelector('#question').value = '今年换工作是否顺利？';
  `,
  ziwei: `
    document.querySelector('[data-birth="date"]').value = '1990-06-15';
    document.querySelector('[data-birth="hour"]').value = '6';
    document.querySelector('[data-birth="gender"]').value = '男';
  `,
  astrology: `
    document.querySelector('[data-birth="date"]').value = '1990-06-15';
    document.querySelector('[data-birth="hour"]').value = '12';
    document.querySelector('[data-birth="min"]').value = '0';
  `,
};

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
  return {
    send: (method, params = {}) => new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
      setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error('BiDi 超时: ' + method)); } }, 20000);
    }),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-smoke-'));
  const ff = spawn('firefox', ['--headless', `--remote-debugging-port=${DEBUG_PORT}`, '--profile', profile, '-no-remote', 'about:blank'], { stdio: 'ignore' });
  let ws;
  try {
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) {
      try { await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`); ready = true; } catch { await sleep(250); }
    }
    if (!ready) throw new Error('Firefox 调试端口未就绪');
    ws = new WebSocket(`ws://127.0.0.1:${DEBUG_PORT}/session`);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WS 连接失败')); });
    const { send } = bdiClient(ws);
    await send('session.new', { capabilities: {} });
    const ctx = (await send('browsingContext.getTree')).contexts[0].context;

    const ev = async (expr) => {
      const r = await send('script.evaluate', { expression: expr, target: { context: ctx }, awaitPromise: true, resultOwnership: 'root' });
      if (r.type === 'exception') throw new Error('脚本异常: ' + JSON.stringify(r.exceptionDetails || r));
      return r.result?.value;
    };
    const waitFor = async (expr, desc, ms = 15000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr) === true) return; } catch { /* retry */ }
        await sleep(200);
      }
      throw new Error('超时: ' + desc);
    };

    await send('browsingContext.navigate', { context: ctx, url: `${BASE}/${ART}.html` });
    await waitFor(`typeof window.DS !== 'undefined' && !!document.getElementById('castBtn')`, '页面载入');
    console.log('perf =', await ev(`document.documentElement.dataset.perf`));
    await ev(`(() => { ${SETUP[ART] || ''} return true; })()`);
    await ev(`document.getElementById('castBtn').click(); true`);
    await waitFor(`!!document.querySelector('#result .chart-brief')`, '简要盘面');
    const briefLen = await ev(`document.querySelector('#result .chart-brief').innerText.length`);
    console.log('brief text len =', briefLen);
    await waitFor(`(()=>{var d=document.querySelector('#result .deep-panel');return !d.open && d.querySelector('.deep-body').innerHTML.trim()==='';})()`, '深度初始为空');
    await ev(`document.querySelector('#result .deep-panel summary').click(); true`);
    await waitFor(`var d=document.querySelector('#result .deep-panel'); d.open && d.getAttribute('data-loaded')==='1' && d.querySelector('.deep-body').innerHTML.length > 800`, '深度注入');
    console.log('deep html len =', await ev(`document.querySelector('#result .deep-panel .deep-body').innerHTML.length`));
    console.log('ai/copy:', await ev(`!!document.querySelector('#result .deep-panel .btn-ai') && !!document.querySelector('#result .deep-panel .btn-copy')`));
    console.log('prompt chars:', await ev(`(document.querySelector('#result .deep-panel .prompt-box')||{}).value.length`));

    console.log('BRIEF TEXT:\n' + await ev(`document.querySelector('#result .chart-brief').innerText`));
    console.log('DIAG ' + await ev(`JSON.stringify({
      cells: document.querySelectorAll('#result .pan-cell').length,
      grids: Array.from(document.querySelectorAll('#result .pan-grid')).map(g => getComputedStyle(g).gridTemplateColumns.split(' ').length),
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      deepCells: document.querySelectorAll('#result .deep-panel .pan-cell').length,
      keyCells: document.querySelectorAll('#result .pan-cell.is-key').length
    })`));

    const shot = await send('browsingContext.captureScreenshot', { context: ctx });
    const b64 = shot && shot.data ? shot.data : shot;
    fs.mkdirSync('scripts/.shots', { recursive: true });
    const file = `scripts/.shots/${ART}.png`;
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log('screenshot →', file);
  } finally {
    try { ws && ws.close(); } catch { /* ignore */ }
    ff.kill('SIGKILL');
  }
}

main().catch((e) => { console.error('SMOKE FAIL:', e.message); process.exit(1); });
