// ESM 解析钩子：让 Node 的类型剥离（--experimental-strip-types）能直接跑 vendored 观微源码。
//
// 背景：vendor/guanwei 的 TS 源码按 tsc/ts-node 惯例书写——
//   · 相对导入写 `.js` 扩展名（'../../../shared/core/data/tarotCards.js'，实际文件是 .ts）
//   · 部分导入干脆不写扩展名（'./chartBrief'、'../types'）
// Node 的类型剥离**不会**做 .js → .ts 的扩展名替换，直接 import 会 ERR_MODULE_NOT_FOUND。
// 这里在 resolve 阶段做「原样 → 换 .ts → 目录 index.ts」的兜底，全程只读、不改 vendor 源码。
//
// 由 server/bootstrap.mjs 通过 module.register() 挂载；必须在任何 vendor 模块求值前注册。
const TS_EXTS = ['.ts', '.mts', '.cts'];

/** 一个失败的 specifier 可能对应的 TS 候选路径 */
function candidates(specifier) {
  const out = [];
  const jsLike = specifier.match(/^(.*)(\.js|\.mjs|\.cjs)$/);
  if (jsLike) {
    const base = jsLike[1];
    for (const e of TS_EXTS) out.push(base + e);          // foo.js → foo.ts
    return out;
  }
  if (/\.[^./\\]+$/.test(specifier)) return out;          // 已带其它扩展名（.json/.css…）→ 不猜
  for (const e of TS_EXTS) out.push(specifier + e);       // 无扩展名 → foo.ts
  for (const e of TS_EXTS) out.push(specifier + '/index' + e);  // 无扩展名目录 → foo/index.ts
  return out;
}

const RETRYABLE = new Set([
  'ERR_MODULE_NOT_FOUND',
  'ERR_UNSUPPORTED_DIR_IMPORT',
  'ERR_UNKNOWN_FILE_EXTENSION',
]);

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (!err || !RETRYABLE.has(err.code)) throw err;
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('file:');
    if (!isRelative) throw err;                            // 裸包名失败（未安装等）→ 原样抛出
    for (const cand of candidates(specifier)) {
      try {
        return await nextResolve(cand, context);
      } catch { /* 继续试下一个候选 */ }
    }
    throw err;
  }
}
