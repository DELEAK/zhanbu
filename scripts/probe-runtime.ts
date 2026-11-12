// 最小运行时探针：验证 `node --experimental-strip-types` 能加载 vendor/guanwei 的 TS 模块，
// 且 GUANWEI_DATA_DIR 生效（指向项目 data/），牌名数据 78 张且 slug 唯一。
//
// 用法（从项目根目录）：
//   GUANWEI_DATA_DIR="$PWD/data" node --experimental-strip-types scripts/probe-runtime.ts
// 退出码 0 = 全部通过；1 = 任一断言失败。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tarotCards } from '../vendor/guanwei/shared/core/data/tarotCards.ts';
import { DATA_DIR, dataFile } from '../vendor/guanwei/server/src/services/dataDir.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const failures: string[] = [];
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

// 1. 牌名数据：78 张、slug 唯一、中英文齐全
const slugOf = (en: string) => en.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const slugs = tarotCards.map((c) => slugOf(c.nameEn));
check(tarotCards.length === 78, 'tarotCards 数量 = 78', String(tarotCards.length));
check(new Set(slugs).size === 78, 'slug 唯一', `${new Set(slugs).size} 个`);
check(tarotCards.every((c) => c.name && c.nameEn), '中英文牌名齐全');

// 2. 数据目录：GUANWEI_DATA_DIR 必须指向项目 data/
const expected = path.join(ROOT, 'data');
check(path.resolve(DATA_DIR) === expected, 'DATA_DIR = <项目>/data', DATA_DIR);
check(path.resolve(dataFile('probe.txt')).startsWith(expected + path.sep), 'dataFile() 落在 DATA_DIR', dataFile('probe.txt'));

// 3. 写权限冒烟（只碰 data/ 下的探针文件，测完即删）
try {
  const probe = dataFile('.probe-write');
  fs.writeFileSync(probe, 'ok');
  fs.rmSync(probe);
  check(true, 'DATA_DIR 可写');
} catch (e) {
  check(false, 'DATA_DIR 可写', String((e as Error).message));
}

// 4. Node 版本 ≥ 22.13（package.json engines）
const major = Number(process.versions.node.split('.')[0]);
const minor = Number(process.versions.node.split('.')[1]);
check(major > 22 || (major === 22 && minor >= 13), 'Node ≥ 22.13', process.versions.node);

console.log(failures.length ? `\n✗ 探针失败 ${failures.length} 项: ${failures.join('; ')}` : '\n✓ 运行时探针全部通过');
process.exit(failures.length ? 1 : 0);
