#!/usr/bin/env node
// 公版韦特牌面（Rider–Waite–Smith, Pamela Colman Smith, 1909 —— 已进入公共领域）
// 构建期脚本：从 Wikimedia Commons 取 78 张原图缩略 → 生成 480w / 1200w 的 WebP(+AVIF)。
// 运行时零网络依赖：产物落在 public/img/cards/{480,1200}/。
//
// 用法：node scripts/fetch-cards.mjs [--skip-download] [--refresh-meta]
//   --skip-download  只用 .card-cache 里已有的源图重新编码（离线可跑）
//   --refresh-meta   忽略元数据缓存，重新查询 Commons API
//
// ── 网络故障与修复（2026-11-11 诊断）────────────────────────────────
// 原实现直接 fetch commons.wikimedia.org / upload.wikimedia.org，报 `✗ fetch failed`。实测：
//   · upload.wikimedia.org（v4 103.102.166.240 / v6 2001:df2:…::2:b）TCP/443 连不通：
//     v6 路由 immediate unreachable，v4 连接超时；用 curl --resolve 换成别的 Wikimedia 边缘 IP
//     （208.80.154.240）能通 → 是本机到该 anycast 地址的路由问题，不是域名或脚本问题。
//   · commons.wikimedia.org API 与 thumb.wikimedia.org（103.102.166.224）可达，但偶发
//     ETIMEDOUT（约 10–30%），连打还会 429 限流。
// 对策：
//   1) 只从 thumb.wikimedia.org 取图，且必须用「标准缩略尺寸」
//      （20/40/60/120/250/330/500/960/1280/1920/3840，见 https://w.wiki/GHai ）：
//      imageinfo 请求 iiurlwidth=1200 会被 MediaWiki 向上取整到 1280px 标准尺寸 → 正好 ≥ 产物 1200w；
//      非标准尺寸热链直连被 400 拒绝（T414805）；请求宽度 ≥ 原图宽度会回退到 upload 主机原图
//      （本机不可达）——所以请求 1200，不要请求 999 或 ≥2100 的宽度。
//   2) 所有 HTTP 走 fetchRetry：指数退避 + 抖动，429 读 Retry-After，默认 6 次。
//   3) 优先 IPv4（本机 v6 路由不可达）。
//   4) 元数据 meta.json 与源图 .card-cache/<slug>.src 落盘缓存 → 重复运行零网络。
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import { fileURLToPath } from 'node:url';

try { dns.setDefaultResultOrder('ipv4first'); } catch { /* 老版本 Node 忽略 */ }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, '.card-cache');
const OUT = path.join(ROOT, 'public', 'img', 'cards');
const META = path.join(CACHE, 'meta.json');
const UA = 'divination-station/1.0 (self-hosted divination site; build-time image fetch)';
const API = 'https://commons.wikimedia.org/w/api.php';
const PHRASE = '(Rider-Waite Smith tarot deck).png';
// 与 guanwei shared/core/data/tarotCards.ts 的 nameEn 对齐：
// 小阿卡纳两张王牌在 Commons 存为 One of …
const ALIASES = { 'Ace of Pentacles': 'One of Pentacles', 'Ace of Swords': 'One of Swords' };
const REQ_W = 1200;              // 请求宽度 → MediaWiki 取整到 1280px 标准缩略尺寸
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIN_SRC = 50_000;          // 源图最小字节数（1280px PNG 约 4MB，远高于此）
const CONCURRENCY = 4;

const SKIP_DOWNLOAD = process.argv.includes('--skip-download');
const REFRESH_META = process.argv.includes('--refresh-meta');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class FatalError extends Error {}

/** 带重试/退避的 fetch：429/5xx/网络错误可重试，其余 4xx 视为致命。 */
async function fetchRetry(url, { retries = 6, timeoutMs = 45_000, headers = {} } = {}) {
  let last;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after'));
        const err = new Error(`HTTP ${res.status}`);
        err.retryAfter = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 0;
        throw err;
      }
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} ${url}`);
        err.fatal = true;
        throw err;
      }
      return res;
    } catch (e) {
      if (e.fatal) throw e;
      last = e;
      if (attempt === retries) break;
      const wait = Math.min(20_000, (e.retryAfter || 800 * 2 ** (attempt - 1)) + Math.random() * 400);
      process.stderr.write(`\n  ⟳ 第 ${attempt}/${retries} 次重试（${e.message}），${(wait / 1000).toFixed(1)}s 后再试`);
      await sleep(wait);
    }
  }
  throw last;
}

// nameEn → 产物 slug：小写、非字母数字压成 '-'
function slugOf(en) {
  return en.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

// 从 guanwei 牌义数据里取 78 个 nameEn（保证与运行时牌名一一对应）
function guanweiNameEn() {
  const src = fs.readFileSync(path.join(ROOT, 'vendor/guanwei/shared/core/data/tarotCards.ts'), 'utf8');
  const names = [...src.matchAll(/nameEn: '([^']+)'/g)].map((m) => m[1]);
  if (names.length !== 78) throw new FatalError(`期望 78 张牌，实际解析到 ${names.length} 张`);
  return names;
}

/** 缩略图 URL 归一到 thumb.wikimedia.org；若被回退到 upload 主机原图则直接报错（本机不可达）。 */
function normalizeThumb(raw) {
  const u = new URL(raw);
  if (u.hostname === 'upload.wikimedia.org') {
    if (!u.pathname.includes('/thumb/')) {
      throw new FatalError(`缩略图回退成了 upload 主机原图（本机不可达），请调小 iiurlwidth: ${raw}`);
    }
    u.hostname = 'thumb.wikimedia.org';
  }
  if (u.hostname !== 'thumb.wikimedia.org') throw new FatalError(`意外的缩略图主机: ${u.hostname}`);
  return u.toString();
}

async function apiQuery(titles) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', titles: titles.join('|'),
    prop: 'imageinfo', iiprop: 'url|size', iiurlwidth: String(REQ_W),
  });
  const res = await fetchRetry(`${API}?${params}`);
  const d = await res.json();
  const map = new Map();
  for (const p of Object.values(d.query.pages)) map.set(p.title, p.imageinfo?.[0] ?? null);
  return map;
}

/** 查询 78 张牌的 imageinfo（先标准标题，缺的再查 ALIASES），返回 meta 结构。 */
async function buildMeta(nameEns) {
  const info = new Map();
  const baseTitles = nameEns.map((en) => `File:${en} ${PHRASE}`);
  for (let i = 0; i < baseTitles.length; i += 26) {
    const got = await apiQuery(baseTitles.slice(i, i + 26));
    for (const [t, v] of got) info.set(t, v);
    await sleep(900);
  }
  const aliasTitles = [...new Set(nameEns.filter((en) => ALIASES[en]).map((en) => `File:${ALIASES[en]} ${PHRASE}`))];
  if (aliasTitles.length) {
    const got = await apiQuery(aliasTitles);
    for (const [t, v] of got) info.set(t, v);
  }

  const cards = {};
  const missing = [];
  for (const en of nameEns) {
    const base = `File:${en} ${PHRASE}`;
    const alt = `File:${ALIASES[en] || en} ${PHRASE}`;
    const ii = info.get(base) || info.get(alt);
    if (!ii) { missing.push(en); continue; }
    cards[slugOf(en)] = {
      en, title: info.get(base) ? base : alt,
      thumb: normalizeThumb(ii.thumburl),
      ow: ii.width, oh: ii.height,
      tw: ii.thumbwidth, th: ii.thumbheight,
    };
  }
  if (missing.length) throw new FatalError(`Commons 缺少 ${missing.length} 张牌面: ${missing.join(', ')}`);
  return {
    generatedAt: new Date().toISOString(),
    source: 'Wikimedia Commons — Rider–Waite–Smith tarot deck (public domain)',
    requestWidth: REQ_W,
    cards,
  };
}

function validSrc(file) {
  try {
    if (fs.statSync(file).size < MIN_SRC) return false;
    const fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(8);
    fs.readSync(fd, head, 0, 8, 0);
    fs.closeSync(fd);
    return head.equals(PNG_SIG);
  } catch {
    return false;
  }
}

async function downloadAll(cards) {
  const entries = Object.entries(cards);
  const queue = [...entries];
  let done = 0, skipped = 0;
  const errors = [];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      const [slug, meta] = item;
      const dest = path.join(CACHE, `${slug}.src`);
      try {
        if (validSrc(dest)) { skipped++; continue; }
        const res = await fetchRetry(meta.thumb, { retries: 6, timeoutMs: 90_000 });
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < MIN_SRC || !buf.subarray(0, 8).equals(PNG_SIG)) {
          throw new FatalError(`下载内容不是有效 PNG: ${slug}（${buf.length}B）`);
        }
        const tmp = `${dest}.part`;
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, dest);
        done++;
        process.stdout.write(`\r  下载 ${done + skipped}/${entries.length}（缓存命中 ${skipped}）`);
      } catch (e) {
        errors.push(`${slug}: ${e.message}`);
      }
    }
  }));
  process.stdout.write('\n');
  if (errors.length) throw new FatalError(`下载失败 ${errors.length} 张：\n    ${errors.slice(0, 8).join('\n    ')}`);
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  fs.mkdirSync(path.join(OUT, '480'), { recursive: true });
  fs.mkdirSync(path.join(OUT, '1200'), { recursive: true });

  const nameEns = guanweiNameEn();
  const slugs = nameEns.map(slugOf);
  if (new Set(slugs).size !== 78) throw new FatalError(`slug 去重后只有 ${new Set(slugs).size} 个（期望 78）`);

  // ① 元数据（带缓存）
  let meta = null;
  if (!REFRESH_META && fs.existsSync(META)) {
    try { meta = JSON.parse(fs.readFileSync(META, 'utf8')); } catch { meta = null; }
    if (meta && slugs.some((s) => !meta.cards?.[s])) meta = null;
  }
  if (meta) {
    console.log(`① 元数据缓存命中（${Object.keys(meta.cards).length} 张），跳过 API 查询`);
  } else {
    console.log('① 查询 Commons imageinfo…');
    meta = await buildMeta(nameEns);
    fs.writeFileSync(META, JSON.stringify(meta, null, 2));
    console.log(`   ✓ 已缓存元数据 → ${path.relative(ROOT, META)}`);
  }

  // ② 下载源图（带缓存）
  if (SKIP_DOWNLOAD) {
    const absent = slugs.filter((s) => !validSrc(path.join(CACHE, `${s}.src`)));
    if (absent.length) {
      console.log(`② --skip-download：缺 ${absent.length} 张源图，跳过编码（请先正常跑一次 fetch）`);
      return;
    }
    console.log('② --skip-download：源图缓存齐全');
  } else {
    console.log(`② 下载源图 → ${path.relative(ROOT, CACHE)}（已有缓存自动跳过）`);
    await downloadAll(meta.cards);
  }

  // ③ 编码 480w/1200w WebP + 1200w AVIF
  console.log('③ 编码 WebP/AVIF…');
  const { encode } = await import('./encode-cards.mjs');
  await encode(CACHE, OUT, slugs);

  // ④ 自检：78 × (480.webp + 1200.webp + 1200.avif)
  const miss = [];
  for (const s of slugs) {
    for (const p of [`480/${s}.webp`, `1200/${s}.webp`, `1200/${s}.avif`]) {
      if (!fs.existsSync(path.join(OUT, p))) miss.push(p);
    }
  }
  if (miss.length) throw new FatalError(`产物缺失 ${miss.length} 个：${miss.slice(0, 6).join(', ')}`);
  console.log(`✓ 完成：480/${slugs.length}.webp + 1200/${slugs.length}.webp + 1200/${slugs.length}.avif → ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
