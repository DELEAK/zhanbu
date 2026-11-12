#!/usr/bin/env node
// 生成 78 张牌的 slug ↔ 中英文牌名 Markdown 表（供 docs/env.md 引用，前端/后端对齐用）。
// 数据源 = vendor/guanwei/shared/core/data/tarotCards.ts（运行时唯一权威牌名），
// slug 规则 = nameEn 小写、非字母数字压成 '-' —— 与 scripts/fetch-cards.mjs 的 slugOf() 完全一致。
//
// 用法：node scripts/gen-card-table.mjs > docs/card-table.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'vendor/guanwei/shared/core/data/tarotCards.ts'), 'utf8');

// 逐条切出 { id, name, nameEn, arcana } —— 保持文件顺序（大阿卡纳在前）
const blocks = [...src.matchAll(/\{\s*id:\s*(\d+),\s*name:\s*'([^']+)',\s*nameEn:\s*'([^']+)',\s*arcana:\s*'([^']+)'/g)]
  .map((m) => ({ id: Number(m[1]), zh: m[2], en: m[3], arcana: m[4] }));

if (blocks.length !== 78) {
  console.error(`✗ 解析到 ${blocks.length} 张牌（期望 78）`);
  process.exit(1);
}
const slugOf = (en) => en.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const slugs = blocks.map((b) => slugOf(b.en));
if (new Set(slugs).size !== 78) {
  console.error('✗ slug 去重后不足 78');
  process.exit(1);
}

const arcanaLabel = { major: '大阿卡纳' };
const suitLabel = { Wands: '权杖', Cups: '圣杯', Swords: '宝剑', Pentacles: '星币' };
const labelOf = (b) => {
  if (b.arcana === 'major') return arcanaLabel.major;
  const suit = Object.keys(suitLabel).find((s) => b.en.endsWith(`of ${s}`));
  return suit ? `小阿卡纳·${suitLabel[suit]}` : b.arcana;
};
console.log('| # | slug | nameEn | nameZh | 组别 |');
console.log('| ---: | --- | --- | --- | --- |');
blocks.forEach((b, i) => {
  console.log(`| ${i + 1} | \`${slugOf(b.en)}\` | ${b.en} | ${b.zh} | ${labelOf(b)} |`);
});
