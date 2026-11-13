// 定向起盘（内部能力，对外不暴露任何「择吉/吉愿」字样）——
// 在用户给定的输入附近，找一个「比平好一点（吉）」的真实盘面并返回。
//
// 设计要点：
//   · 不伪造 resultRaw：候选盘全部由 vendor 引擎按规则真实算出，命中即返回。
//   · 页面与普通入口完全一致：入参与出参形状与 POST /api/chart 相同，前端无需分支渲染。
//   · 可复现：实际命中入参写入记录 params，事后可重算同一盘。
//   · 判定：各术结构化规则 + 盘面文字交叉校验（盘面含凶词则不作吉）。
//   · 支持四术：奇门（分钟搜索）、六壬（分钟搜索）、梅花（时辰搜索 / 报数搜索）、
//     小六壬（时辰搜索 / 报数搜索）。
//   · 六爻需注入种子随机源、塔罗牌义主观、命盘类无吉凶档位——不在范围内。
import { Solar } from 'lunar-typescript';
import { chartCalc } from '../../vendor/guanwei/shared/core/engine/chart.ts';
import { chartBrief } from '../../vendor/guanwei/server/src/services/chartBrief.ts';
import { duanyuPromptBlock } from '../../vendor/guanwei/server/src/services/duanyu.ts';
import { ART_META, normalizeChartInputs } from './chartInputs.ts';

export const LUCKY_ARTS = ['qimen', 'liuren', 'meihua', 'xiaoliuren'] as const;
export type LuckyArt = typeof LUCKY_ARTS[number];

export type Verdict = {
  tier: 'ji' | 'ping' | 'xiong';
  score: number;
  reasons: string[];
};

export type LuckyHit = {
  artId: LuckyArt;
  kind: 'zhanwen';
  inputs: Record<string, unknown>;
  at: string;            // ISO，实际命中时刻（报数模式为当时时刻，仅作记录）
  attempts: number;
  resultRaw: unknown;
  brief: string;
  duanyu: string;
  verdict: Verdict;
};

/** 盘面里出现这些词组，就不把该盘算作「吉」——避免结果写吉、盘面写凶的自相矛盾。
 *  注意：不能用单字「凶」——断语常见「逢凶化吉」等正面表述，会误伤。 */
const NEG_WORDS = [
  '凶多吉少', '大凶', '主凶', '有凶', '必凶', '不吉', '不祥',
  '空亡', '墓绝', '入墓', '反吟', '伏吟', '三刑', '六冲', '死门', '伤门', '惊门',
];

/** 奇门「问事取用神门」的映射（单字，与 pan[].men 一致） */
const QIMEN_MEN_BY_CATEGORY: Record<string, string> = {
  综合: '开',
  事业: '开',
  财运: '生',
  感情: '休',
  学业: '开',
  健康: '生',
  人际: '开',
};

const QIMEN_JI_MEN = ['开', '休', '生'];
const QIMEN_JI_SHEN = ['值符', '太阴', '六合', '九天', '九地'];
const LIUREN_JI_JIANG = ['贵人', '青龙', '六合', '太常', '天后'];

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function hourIndexOfClock(hour24: number): number {
  return Math.floor(((hour24 + 1) % 24) / 2);
}

function lunarOf(t: Date): { month: number; day: number; hourIndex: number } {
  const hh = t.getHours();
  const lunar = Solar.fromYmdHms(t.getFullYear(), t.getMonth() + 1, t.getDate(), hh, 0, 0).getLunar();
  return { month: Math.abs(lunar.getMonth()), day: lunar.getDay(), hourIndex: hourIndexOfClock(hh) };
}

/** 结构化吉凶判定（粗判） */
export function verdictOf(artId: LuckyArt, resultRaw: any, category?: string): Verdict {
  const reasons: string[] = [];
  let tier: 'ji' | 'ping' | 'xiong' = 'ping';
  let score = 0;

  if (artId === 'xiaoliuren') {
    const idx = Number(resultRaw?.idx);
    const name = String(resultRaw?.name || '');
    if (idx === 0 || idx === 2 || idx === 4) {
      tier = 'ji';
      score = 2;
      reasons.push(`掌诀「${name}」属吉`);
    } else if (idx === 1 || idx === 3 || idx === 5) {
      tier = 'xiong';
      reasons.push(`掌诀「${name}」属凶`);
    }
  } else if (artId === 'meihua') {
    const shengke = String(resultRaw?.shengke || '');
    const tiWang = String(resultRaw?.tiWangShuai || '');
    const yongWang = String(resultRaw?.yongWangShuai || '');
    if (shengke.includes('吉')) {
      tier = 'ji';
      score = 2;
      reasons.push(`体用「${shengke}」`);
      if (tiWang.includes('旺') || yongWang.includes('旺')) score += 1;
    } else if (shengke.includes('凶')) {
      tier = 'xiong';
      reasons.push(`体用「${shengke}」`);
    } else {
      reasons.push(`体用「${shengke || '比和'}」为平`);
    }
  } else if (artId === 'qimen') {
    const men = QIMEN_MEN_BY_CATEGORY[category || '综合'] || '开';
    const pan = resultRaw?.pan || {};
    const shen = resultRaw?.shen || {};
    let palace = '';
    for (const g of Object.keys(pan)) {
      if (String(pan[g]?.men || '') === men) {
        palace = g;
        break;
      }
    }
    if (!palace) {
      reasons.push(`九宫未见用神门（${men}）`);
    } else {
      const palaceShen = String(shen[palace] || '');
      if (QIMEN_JI_MEN.includes(String(pan[palace]?.men))) {
        if (!palaceShen || !['螣蛇', '白虎', '玄武', '勾陈'].includes(palaceShen)) {
          tier = 'ji';
          score = 2;
          if (QIMEN_JI_SHEN.includes(palaceShen)) score += 1;
          reasons.push(`用神门「${men}」吉，${palace}宫${palaceShen ? '神「' + palaceShen + '」' : '神吉'}`);
        } else {
          reasons.push(`用神门吉但${palace}宫神「${palaceShen}」不吉`);
        }
      } else {
        tier = 'xiong';
        reasons.push(`${palace}宫用神门「${men}」非三吉门`);
      }
    }
  } else if (artId === 'liuren') {
    const chuanJiang: any[] = Array.isArray(resultRaw?.chuanJiang) ? resultRaw.chuanJiang : [];
    const jiCount = chuanJiang.filter((x) => LIUREN_JI_JIANG.includes(String(x?.jiang || ''))).length;
    const keti = String(resultRaw?.keti || '');
    if (/反吟|伏吟|空亡|墓/.test(keti)) {
      tier = 'xiong';
      reasons.push(`课体「${keti}」不吉`);
    } else if (jiCount >= 2) {
      tier = 'ji';
      score = 2;
      reasons.push(`三传吉将 ${jiCount}/3${keti ? '，课体「' + keti + '」' : ''}`);
    } else {
      reasons.push(`三传吉将 ${jiCount}/3${keti ? '，课体「' + keti + '」' : ''}`);
    }
  }

  return { tier, score, reasons };
}

/** 盘面文字交叉校验：brief 是逐字引用的事实块，若其中出现凶词 → 不作吉（防结构化判定与盘面自相矛盾）。
 *  不用 duanyu：vendor 断语常整段列出六神/十神总诀（含「空亡」「凶」等字），会误伤。 */
function verdictWithBrief(v: Verdict, brief: string): Verdict {
  if (v.tier !== 'ji') return v;
  const hit = NEG_WORDS.find((w) => brief.includes(w));
  if (!hit) return v;
  return { tier: 'ping', score: Math.max(0, v.score - 1), reasons: [...v.reasons, `盘面含「${hit}」，降为平`] };
}

/** 时间驱动的单次起盘 */
function castAt(artId: LuckyArt, t: Date): { inputs: Record<string, unknown>; resultRaw: any } {
  if (artId === 'qimen' || artId === 'liuren') {
    const inputs = { datetime: t.toISOString() };
    return { inputs, resultRaw: chartCalc(artId, inputs) as any };
  }
  if (artId === 'meihua') {
    const inputs = { mode: 'time', now: t.toISOString() };
    return { inputs, resultRaw: chartCalc('meihua', inputs) as any };
  }
  // xiaoliuren：引擎吃农历月/日 + 0-based 时辰序
  const lunar = lunarOf(t);
  const inputs = { mode: 'time', m: lunar.month, d: lunar.day, h: lunar.hourIndex };
  return { inputs, resultRaw: chartCalc('xiaoliuren', inputs) as any };
}

function stepMinutes(artId: LuckyArt): number {
  return artId === 'qimen' || artId === 'liuren' ? 1 : 120;
}

function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** 随机抽取一个元素 */
function pickRandom<T>(arr: T[]): T | null {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
}

/** 洗牌（Fisher–Yates），就地打乱 */
function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const HIT_TARGET = 12;

/** 时间窗搜索：在窗口内随机抽取候选时刻，收集多个吉盘后随机取其一。
 *  同一组输入多次请求会得到不同的吉盘（每次重新随机），避免「永远同一个结果」。
 *  qimen/liuren 逐分钟搜索（默认 720 分钟窗口）；meihua/xiaoliuren 以时辰为步长（120 分钟），
 *  窗口默认 4320 分钟，否则只有 6 个时辰可选，随机空间太小。 */
function searchTimeWindow(
  artId: LuckyArt,
  base: Date,
  category: string | undefined,
  windowMinutes: unknown,
  maxAttempts: unknown,
): LuckyHit | null {
  // 归零秒，保证入参与盘面可复现
  base.setSeconds(0, 0);

  const defWin = artId === 'qimen' || artId === 'liuren' ? 720 : 4320;
  const win = clampInt(windowMinutes, 60, 4320, defWin);
  const cap = clampInt(maxAttempts, 10, 3000, 800);
  const step = stepMinutes(artId);
  const maxOffsets = Math.min(Math.floor(win / step), Math.floor(cap / 2));

  const offsets: number[] = [];
  for (let i = 0; i <= maxOffsets; i++) {
    if (i === 0) offsets.push(0);
    else offsets.push(i * step, -i * step);
  }
  shuffleInPlace(offsets);

  const candidates: Array<{
    inputs: Record<string, unknown>;
    resultRaw: any;
    brief: string;
    verdict: Verdict;
    at: Date;
    order: number;
  }> = [];

  let evaluated = 0;
  for (let k = 0; k < offsets.length && evaluated < cap; k++) {
    const t = new Date(base.getTime() + offsets[k] * 60000);
    evaluated++;
    let cast: { inputs: Record<string, unknown>; resultRaw: any };
    try {
      cast = castAt(artId, t);
    } catch {
      continue;
    }
    const brief = chartBrief(artId, cast.resultRaw);
    const verdict = verdictWithBrief(verdictOf(artId, cast.resultRaw, category), brief);
    if (verdict.tier !== 'ji') continue;
    candidates.push({ inputs: cast.inputs, resultRaw: cast.resultRaw, brief, verdict, at: t, order: evaluated });
    if (candidates.length >= HIT_TARGET) break;
  }

  const chosen = pickRandom(candidates);
  if (!chosen) return null;
  return {
    artId,
    kind: ART_META[artId].kind as 'zhanwen',
    inputs: chosen.inputs,
    at: chosen.at.toISOString(),
    attempts: chosen.order,
    resultRaw: chosen.resultRaw,
    brief: chosen.brief,
    duanyu: duanyuPromptBlock(artId, chosen.resultRaw).trim(),
    verdict: chosen.verdict,
  };
}

/** 随机生成一个 1..999 内、且 (x-1) % modVal === residue 的整数 */
function randomWithResidue(residue: number, modVal: number): number {
  const first = residue + 1; // 1..modVal
  const count = Math.floor((999 - first) / modVal) + 1;
  const k = Math.floor(Math.random() * count);
  return first + k * modVal;
}

/** 梅花报数：先收集全部「体用属吉」的卦象（8×8×6），随机取一象，再随机生成同余的报数。
 *  同一组输入多次请求会得到不同吉卦，避免总是微调到相邻的那一个。 */
function searchMeihuaNumbers(n1: number, n2: number, n3: number, category?: string): LuckyHit | null {
  const combos: Array<{ up: number; lo: number; mv: number; brief: string; verdict: Verdict }> = [];

  for (let up = 1; up <= 8; up++) {
    for (let lo = 1; lo <= 8; lo++) {
      for (let mv = 1; mv <= 6; mv++) {
        // 以同余代表值探盘：n1=up、n2=lo、n3=mv 恰与目标卦象同余
        const probe = { mode: 'number', n1: up, n2: lo, n3: mv };
        let raw: any;
        try {
          raw = chartCalc('meihua', probe) as any;
        } catch {
          continue;
        }
        if (!String(raw?.shengke || '').includes('吉')) continue;
        const brief = chartBrief('meihua', raw);
        const verdict = verdictWithBrief(verdictOf('meihua', raw, category), brief);
        if (verdict.tier !== 'ji') continue;
        combos.push({ up, lo, mv, brief, verdict });
      }
    }
  }

  const chosen = pickRandom(combos);
  if (!chosen) return null;

  const inputs = {
    mode: 'number',
    n1: randomWithResidue(chosen.up - 1, 8),
    n2: randomWithResidue(chosen.lo - 1, 8),
    n3: randomWithResidue(chosen.mv - 1, 6),
  };
  let raw: any;
  try {
    raw = chartCalc('meihua', inputs) as any;
  } catch {
    return null;
  }
  return {
    artId: 'meihua',
    kind: 'zhanwen',
    inputs,
    at: new Date().toISOString(),
    attempts: 1,
    resultRaw: raw,
    brief: chosen.brief,
    duanyu: duanyuPromptBlock('meihua', raw).trim(),
    verdict: chosen.verdict,
  };
}

/** 小六壬报数：先随机选一个吉掌诀（大安/速喜/小吉），再随机生成落在该掌诀的第三个数。
 *  同一组输入多次请求会落到不同吉掌诀（而不是总取 n3 附近第一个吉）。 */
function searchXiaoliurenNumbers(n1: number, n2: number, n3: number, category?: string): LuckyHit | null {
  const targets = [0, 2, 4]; // 大安 / 速喜 / 小吉
  const target = targets[Math.floor(Math.random() * targets.length)];
  // p3 = ((n1-1) + (n2-1) + (n3-1)) mod 6，反解 (n3-1) 的同余
  const residue = mod(target - n1 - n2 + 2, 6);
  const inputs = { mode: 'number', n1, n2, n3: randomWithResidue(residue, 6) };
  let raw: any;
  try {
    raw = chartCalc('xiaoliuren', inputs) as any;
  } catch {
    return null;
  }
  const brief = chartBrief('xiaoliuren', raw);
  const verdict = verdictWithBrief(verdictOf('xiaoliuren', raw, category), brief);
  if (verdict.tier !== 'ji') return null;
  return {
    artId: 'xiaoliuren',
    kind: 'zhanwen',
    inputs,
    at: new Date().toISOString(),
    attempts: 1,
    resultRaw: raw,
    brief,
    duanyu: duanyuPromptBlock('xiaoliuren', raw).trim(),
    verdict,
  };
}

/** xiaoliuren 时间模式：由原始 {y,m,d,hourIndex} 还原本地时刻；缺省用当前时刻 */
function xiaoliurenBaseAt(raw: Record<string, any> | undefined): Date {
  const y = Number(raw?.y);
  const m = Number(raw?.m);
  const d = Number(raw?.d);
  const hi = Number(raw?.hourIndex);
  if (
    Number.isInteger(y) && y >= 1900 && y <= 2100 &&
    Number.isInteger(m) && m >= 1 && m <= 12 &&
    Number.isInteger(d) && d >= 1 && d <= 31 &&
    Number.isInteger(hi) && hi >= 0 && hi <= 11
  ) {
    const hour = (hi * 2) % 24;
    return new Date(y, m - 1, d, hour, 30, 0, 0);
  }
  return new Date();
}

/** 主入口：给定与 POST /api/chart 相同的输入，返回最近一个「吉」盘 */
export function findLucky(opts: {
  artId: LuckyArt;
  category?: string;
  inputs?: Record<string, unknown>;
  windowMinutes?: number;
  maxAttempts?: number;
}): LuckyHit | null {
  const artId = opts.artId;
  const raw = (opts.inputs && typeof opts.inputs === 'object' ? opts.inputs : {}) as Record<string, any>;
  const normalized = normalizeChartInputs(artId, raw);
  const input = normalized.inputs as Record<string, any>;

  if (artId === 'meihua' && input.mode === 'number') {
    return searchMeihuaNumbers(Number(input.n1), Number(input.n2), Number(input.n3), opts.category);
  }
  if (artId === 'xiaoliuren' && input.mode === 'num') {
    return searchXiaoliurenNumbers(Number(input.n1), Number(input.n2), Number(input.n3), opts.category);
  }

  let base: Date;
  if (artId === 'qimen' || artId === 'liuren') {
    base = new Date(String(input.datetime));
  } else if (artId === 'meihua') {
    base = input.now ? new Date(String(input.now)) : new Date();
  } else {
    base = xiaoliurenBaseAt(raw);
  }

  return searchTimeWindow(artId, base, opts.category, opts.windowMinutes, opts.maxAttempts);
}
