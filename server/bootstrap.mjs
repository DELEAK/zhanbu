// 启动引导（必须先于任何 vendor 模块求值）：
//   1) 注入 GUANWEI_DATA_DIR → divination-station/data（绝对路径，与 cwd 无关）
//   2) 注册 TS 解析钩子（server/ts-hooks.mjs），让 vendor 的 .js/无扩展名导入能落到 .ts
//
// ESM 提升陷阱：index.ts 顶部的静态 import 在本文件（及 index.ts）任何语句执行前就完成解析/求值，
// 因此本文件只能由 index.ts **静态首个** import（此时钩子已就位），vendor 模块一律用动态 import 拉入。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));   // .../divination-station/server
const ROOT = path.resolve(HERE, '..');                       // .../divination-station

// 可选 .env（项目根）：KEY=VALUE 逐行解析，只补缺、不覆盖已存在的环境变量（shell/进程环境优先）
// 用途：放 MIMO_API_KEY / MINIMAX_API_KEY 等机密，避免写进 shell 历史或代码仓库（.env 已在 .gitignore）
// 语法：KEY=VALUE；# 开头整行是注释；行内注释需用空白隔开（KEY=value   # 注释）；含特殊字符的值用引号包裹
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!m) continue;
    let v = m[2];
    const quoted = v.match(/^(['"])([\s\S]*?)\1\s*(?:#.*)?$/);   // 引号值：取引号内原文（可带行尾注释）
    if (quoted) {
      v = quoted[2];
    } else {
      v = v.replace(/\s+#.*$/, '').trim();                        // 裸值：按“空白 + #”截断行内注释
    }
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

// 数据目录：显式指向项目内 data/（未设置时才写，尊重外部覆盖，便于测试隔离）
if (!process.env.GUANWEI_DATA_DIR) {
  process.env.GUANWEI_DATA_DIR = path.join(ROOT, 'data');
}
fs.mkdirSync(process.env.GUANWEI_DATA_DIR, { recursive: true });

// 端口默认值（index.ts 读取；也可由外部覆盖）
if (!process.env.PORT) process.env.PORT = '3901';

// 注册解析钩子（幂等：重复注册会抛 ERR_MODULE_ALREADY_EXISTS）
let hooksInstalled = false;
try {
  register('./ts-hooks.mjs', import.meta.url);
  hooksInstalled = true;
} catch (e) {
  if (e && e.code !== 'ERR_MODULE_ALREADY_EXISTS') throw e;
  hooksInstalled = true;
}

export const BOOT = {
  root: ROOT,
  dataDir: process.env.GUANWEI_DATA_DIR,
  hooksInstalled,
};
