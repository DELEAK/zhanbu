#!/usr/bin/env node
// 编码入口：供 fetch-cards.mjs 调用。把 slug 清单交给 Python(Pillow) 批处理。
// AVIF 依赖构建期安装的 pillow-avif-plugin（scripts/.pylibs），缺失时自动降级纯 WebP。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYLIBS = path.join(__dirname, '.pylibs');

/**
 * @param {string} cache 源图缓存目录
 * @param {string} out   产物根目录 (public/img/cards)
 * @param {string[]} slugs 牌 slug 列表
 */
export async function encode(cache, out, slugs) {
  const listFile = path.join(cache, 'slugs.json');
  fs.writeFileSync(listFile, JSON.stringify(slugs));

  const env = { ...process.env };
  if (fs.existsSync(PYLIBS)) {
    env.PYTHONPATH = env.PYTHONPATH ? `${PYLIBS}:${env.PYTHONPATH}` : PYLIBS;
  }

  const r = spawnSync('python3', [path.join(__dirname, 'encode_cards.py'), cache, out, listFile], {
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (r.status !== 0) {
    throw new Error(`编码失败（exit=${r.status}）。WebP 编码需要 Pillow，AVIF 另需 pillow-avif-plugin。`);
  }
}

// 直接运行：node scripts/encode-cards.mjs
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cache = process.argv[2] || path.join(__dirname, '.card-cache');
  const out = process.argv[3] || path.join(__dirname, '..', 'public', 'img', 'cards');
  const slugs = fs.readdirSync(cache).filter((f) => f.endsWith('.src')).map((f) => f.replace(/\.src$/, ''));
  if (!slugs.length) {
    console.error('缓存为空，请先运行 node scripts/fetch-cards.mjs');
    process.exit(1);
  }
  encode(cache, out, slugs).then(() => console.log(`✓ 编码完成 ${slugs.length} 张 → ${out}`));
}
