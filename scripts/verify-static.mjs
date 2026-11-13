#!/usr/bin/env node
// scripts/verify-static.mjs —— 端到端验证的静态检查部分（t6 验证用，只读 public/）
//
// 检查项（对应 docs/verify.md 的验收 5/6）：
//   S1 HTML 默认 data-perf=low：静态属性 data-perf="low"，或 design.md:281-287 规定的
//      防闪烁早读脚本（localStorage 'high' ? 'high' : 'low'，缺省即 low）。
//   S2 禁项引用：public/ 内不得出现 three.js / requestAnimationFrame / particle（-i）。
//   S3 默认态样式硬约束：styles.css 中 box-shadow/filter/backdrop-filter/animation/transition
//      的生效声明只允许出现在 [data-perf="high"] 选择器下；允许"禁用值"（none / 0ms / 0.01ms）
//      的防御性 reset，以及 @keyframes 纯定义（未被 low 引用）。
//
// 输出：逐项 PASS/FAIL + 说明；任一 FAIL → exit 1。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const CSS = path.join(PUBLIC, 'assets', 'styles.css');

let failures = 0;
const ok = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`);
  if (!pass) failures++;
};

// ─── S1：HTML 默认 data-perf=low ───
const htmls = ['index.html', 'tarot.html', 'liuyao.html', 'bazi.html', 'ziwei.html', 'qimen.html', 'liuren.html', 'meihua.html', 'xiaoliuren.html', 'astrology.html'];
const STATIC_ATTR = /data-perf\s*=\s*["']low["']/;
const BOOTSTRAP = /dataset\.perf\s*=\s*localStorage\.getItem\(['"]divination\.perf['"]\)\s*===\s*['"]high['"]\s*\?\s*['"]high['"]\s*:\s*['"]low['"]/;
for (const f of htmls) {
  const html = fs.readFileSync(path.join(PUBLIC, f), 'utf8');
  const staticHit = STATIC_ATTR.test(html);
  const bootHit = BOOTSTRAP.test(html);
  ok(
    `S1 默认 low（${f}）`,
    staticHit || bootHit,
    staticHit
      ? '静态属性 data-perf="low" 存在'
      : bootHit
        ? '静态属性未内联（design.md:281-287 规定早读脚本方案），早读脚本默认 low 命中'
        : '既无 data-perf="low" 静态属性，也未找到默认 low 的早读脚本'
  );
}

// ─── S2：禁项引用 ───
const FORBIDDEN = /three\.js|requestAnimationFrame|particle/i;
const hits = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else {
      const m = fs.readFileSync(p, 'utf8').match(FORBIDDEN);
      if (m) hits.push(path.relative(ROOT, p) + ' → ' + m[0]);
    }
  }
})(PUBLIC);
ok('S2 禁项（three.js / requestAnimationFrame / particle）', hits.length === 0, hits.length ? hits.join('; ') : 'public/ 全树零命中');

// ─── S3：styles.css 效果属性作用域扫描 ───
const EFFECT_PROPS = /^(box-shadow|filter|backdrop-filter|animation|animation-[a-z-]+|transition|transition-[a-z-]+)$/;
const NEUTRAL = /^(none|initial|unset|revert|revert-layer)(\s*!important)?$/i;
const NEUTRAL_DUR = /^0(\.\d+)?m?s(\s*!important)?$/i; // 0s / 0ms / 0.01ms 之类

function parseCss(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = []; // {selector, decls:[{prop,value}], atRules:[]}
  let i = 0, selBuf = '', stack = [];
  let cur = null;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '{') {
      const sel = selBuf.trim();
      selBuf = '';
      if (/^@keyframes/i.test(sel) || /^@-webkit-keyframes/i.test(sel)) {
        stack.push({ type: 'keyframes', name: sel });
      } else if (sel.startsWith('@')) {
        stack.push({ type: 'atrule', name: sel });
      } else {
        cur = { selector: sel, decls: [], atRules: stack.filter(s => s.type === 'atrule').map(s => s.name), inKeyframes: stack.some(s => s.type === 'keyframes') };
        rules.push(cur);
        stack.push({ type: 'rule' });
      }
    } else if (ch === '}') {
      const top = stack.pop();
      if (top && top.type === 'rule') cur = null;
      selBuf = '';
    } else if (ch === ';' && cur && stack.length && stack[stack.length - 1].type === 'rule') {
      const decl = selBuf.trim();
      selBuf = '';
      const m = decl.match(/^([a-zA-Z-]+)\s*:\s*([\s\S]+)$/);
      if (m) cur.decls.push({ prop: m[1].toLowerCase(), value: m[2].trim() });
    } else {
      selBuf += ch;
    }
    i++;
  }
  return rules;
}

const rules = parseCss(fs.readFileSync(CSS, 'utf8'));
const violations = [];
for (const r of rules) {
  for (const d of r.decls) {
    if (!EFFECT_PROPS.test(d.prop)) continue;
    const neutral = NEUTRAL.test(d.value) || NEUTRAL_DUR.test(d.value);
    const scopedHigh = (r.selector + ' ' + r.atRules.join(' ')).includes('[data-perf="high"]');
    if (!neutral && !scopedHigh && !r.inKeyframes) {
      violations.push(`「${r.selector}」${d.prop}: ${d.value.slice(0, 40)}`);
    }
  }
}
ok(
  'S3 效果属性仅限 data-perf=high（box-shadow/filter/backdrop-filter/animation/transition）',
  violations.length === 0,
  violations.length
    ? violations.slice(0, 10).join('; ')
    : `扫描 ${rules.length} 条规则：生效的效果声明全部带 [data-perf="high"] 前缀；其余为 none/0ms 级防御 reset 与 @keyframes 纯定义`
);

console.log(failures === 0 ? '\n静态检查全部通过' : `\n${failures} 项未通过`);
process.exit(failures === 0 ? 0 : 1);
