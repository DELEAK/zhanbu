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

/** 时间窗搜索：从 base 向两侧按步长取最近候选，命中即返回 */
function searchTimeWindow(
  artId: LuckyArt,
  base: Date,
  category: string | undefined,
  windowMinutes: unknown,
  maxAttempts: unknown,
): LuckyHit | null {
  // 归零秒，保证入参与盘面可复现
  base.setSeconds(0, 0);

  const win = clampInt(windowMinutes, 60, 4320, 720);
  const cap = clampInt(maxAttempts, 10, 3000, 800);
  const step = stepMinutes(artId);
  const maxOffsets = Math.min(Math.floor(win / step), Math.floor(cap / 2));

  for (let i = 0; i <= maxOffsets; i++) {
    const offsets = i === 0 ? [0] : [i * step, -i * step];
    for (const off of offsets) {
      const t = new Date(base.getTime() + off * 60000);
      let cast: { inputs: Record<string, unknown>; resultRaw: any };
      try {
        cast = castAt(artId, t);
      } catch {
        continue;
      }
      const brief = chartBrief(artId, cast.resultRaw);
      const duanyu = duanyuPromptBlock(artId, cast.resultRaw).trim();
      const verdict = verdictWithBrief(verdictOf(artId, cast.resultRaw, category), brief);
      if (verdict.tier === 'ji') {
        return {
          artId,
          kind: ART_META[artId].kind as 'zhanwen',
          inputs: cast.inputs,
          at: t.toISOString(),
          attempts: i === 0 ? 1 : i * 2,
          resultRaw: cast.resultRaw,
          brief,
          duanyu,
          verdict,
        };
      }
    }
  }
  return null;
}

/** 与 n 同余（(x-1) % modVal === residue）且最接近 n 的正整数 */
function nearestWithResidue(n: number, residue: number, modVal: number): number {
  const cur = mod(n - 1, modVal);
  let delta = mod(residue - cur, modVal);
  if (delta > modVal / 2) delta -= modVal;
  let cand = n + delta;
  if (cand < 1) cand += modVal;
  return cand;
}

/** 梅花报数搜索：枚举 8×8×6 种卦象，取体用属吉且改动量最小的一组报数 */
function searchMeihuaNumbers(n1: number, n2: number, n3: number, category?: string): LuckyHit | null {
  let best:
    | { delta: number; inputs: Record<string, unknown>; raw: any; brief: string; duanyu: string; verdict: Verdict }
    | null = null;

  for (let up = 1; up <= 8; up++) {
    for (let lo = 1; lo <= 8; lo++) {
      for (let mv = 1; mv <= 6; mv++) {
        const c1 = nearestWithResidue(n1, up - 1, 8);
        const c2 = nearestWithResidue(n2, lo - 1, 8);
        const c3 = nearestWithResidue(n3, mv - 1, 6);
        if (c1 < 1 || c1 > 999 || c2 < 1 || c2 > 999 || c3 < 1 || c3 > 999) continue;

        const inputs = { mode: 'number', n1: c1, n2: c2, n3: c3 };
        let raw: any;
        try {
          raw = chartCalc('meihua', inputs) as any;
        } catch {
          continue;
        }
        if (!String(raw?.shengke || '').includes('吉')) continue;

        const brief = chartBrief('meihua', raw);
        const duanyu = duanyuPromptBlock('meihua', raw).trim();
        const verdict = verdictWithBrief(verdictOf('meihua', raw, category), brief);
        if (verdict.tier !== 'ji') continue;

        const delta = Math.abs(c1 - n1) + Math.abs(c2 - n2) + Math.abs(c3 - n3);
        if (!best || delta < best.delta) best = { delta, inputs, raw, brief, duanyu, verdict };
      }
    }
  }

  if (!best) return null;
  return {
    artId: 'meihua',
    kind: 'zhanwen',
    inputs: best.inputs,
    at: new Date().toISOString(),
    attempts: 1,
    resultRaw: best.raw,
    brief: best.brief,
    duanyu: best.duanyu,
    verdict: best.verdict,
  };
}

/** 小六壬报数搜索：只微调第三个数（c），取最近且落吉的报数 */
function searchXiaoliurenNumbers(n1: number, n2: number, n3: number, category?: string): LuckyHit | null {
  for (let step = 0; step <= 5; step++) {
    const candidates = step === 0 ? [n3] : [n3 + step, n3 - step];
    for (const c of candidates) {
      if (c < 1 || c > 999) continue;
      const inputs = { mode: 'number', n1, n2, n3: c };
      let raw: any;
      try {
        raw = chartCalc('xiaoliuren', inputs) as any;
      } catch {
        continue;
      }
      const brief = chartBrief('xiaoliuren', raw);
      const duanyu = duanyuPromptBlock('xiaoliuren', raw).trim();
      const verdict = verdictWithBrief(verdictOf('xiaoliuren', raw, category), brief);
      if (verdict.tier !== 'ji') continue;
      return {
        artId: 'xiaoliuren',
        kind: 'zhanwen',
        inputs,
        at: new Date().toISOString(),
        attempts: 1,
        resultRaw: raw,
        brief,
        duanyu,
        verdict,
      };
    }
  }
  return null;
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
