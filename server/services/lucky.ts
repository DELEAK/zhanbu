// 择吉起盘（v1）——在用户选定的时间附近，找最近的一个「吉盘」并返回真实盘面。
//
// 设计要点：
//   · 不伪造 resultRaw：候选盘全部由 vendor 引擎按规则真实算出，命中即返回。
//   · 可复现：入参（时刻 / 农历月日时）写入记录 params，事后可重算同一盘。
//   · 目标：比「平」好一点（吉），暂不分大吉/中吉档位（后续版本再加）。
//   · 判定：各术结构化规则 + 断语文本交叉校验（断语含凶词则不作吉）。
//   · v1 支持时间驱动的四术：奇门（分钟）、六壬（分钟）、梅花（时辰）、小六壬（时辰）。
//     六爻需要注入种子随机源、塔罗牌义主观——留待后续。
import { Solar } from 'lunar-typescript';
import { chartCalc } from '../../vendor/guanwei/shared/core/engine/chart.ts';
import { chartBrief } from '../../vendor/guanwei/server/src/services/chartBrief.ts';
import { duanyuPromptBlock } from '../../vendor/guanwei/server/src/services/duanyu.ts';
import { ART_META } from './chartInputs.ts';

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
  at: string;            // ISO，实际命中时刻
  attempts: number;
  resultRaw: unknown;
  brief: string;
  duanyu: string;
  verdict: Verdict;
};

const MAX_QUESTION = 300;

/** 断语里出现这些词组，就不把该盘算作「吉」——避免页面写吉、断语写凶的自相矛盾。
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
  学业: '景',
  健康: '生',
  人际: '开',
};

const QIMEN_JI_MEN = ['开', '休', '生'];
const QIMEN_JI_SHEN = ['值符', '太阴', '六合', '九天', '九地'];
const LIUREN_JI_JIANG = ['贵人', '青龙', '六合', '太常', '天后'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function hourIndexOfClock(hour24: number): number {
  return Math.floor(((hour24 + 1) % 24) / 2);
}

function lunarOf(t: Date): { month: number; day: number; hourIndex: number } {
  const hh = t.getHours();
  const lunar = Solar.fromYmdHms(t.getFullYear(), t.getMonth() + 1, t.getDate(), hh, 0, 0).getLunar();
  return { month: Math.abs(lunar.getMonth()), day: lunar.getDay(), hourIndex: hourIndexOfClock(hh) };
}

/** 结构化吉凶判定（v1 粗判 + 断语校验） */
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

/** 单次起盘（给定时刻） */
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

/**
 * 从 at 开始向两侧按步长搜索，返回最近一个「吉」盘。
 * 找不到返回 null（调用方给 404 / 提示扩大窗口）。
 */
export function findLucky(opts: {
  artId: LuckyArt;
  category?: string;
  at?: Date;
  windowMinutes?: number;
  maxAttempts?: number;
}): LuckyHit | null {
  const artId = opts.artId;
  const base = opts.at ? new Date(opts.at) : new Date();
  // 归零秒，保证入参与盘面可复现
  base.setSeconds(0, 0);

  const windowMinutes = clampInt(opts.windowMinutes, 60, 4320, 720);
  const maxAttempts = clampInt(opts.maxAttempts, 10, 3000, 800);
  const step = stepMinutes(artId);
  const maxOffsets = Math.min(Math.floor(windowMinutes / step), Math.floor(maxAttempts / 2));

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
      const ruleDuanyu = duanyuPromptBlock(artId, cast.resultRaw).trim();
      const duanyu = ruleDuanyu;
      const verdict = verdictWithBrief(verdictOf(artId, cast.resultRaw, opts.category), brief);
      if (verdict.tier === 'ji') {
        const attempts = i === 0 ? 1 : i * 2;
        return {
          artId,
          kind: ART_META[artId].kind as 'zhanwen',
          inputs: cast.inputs,
          at: t.toISOString(),
          attempts,
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

function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function luckyMeta() {
  return LUCKY_ARTS.map((id) => ({ artId: id, label: ART_META[id].label, kind: ART_META[id].kind, group: ART_META[id].group }));
}

export const LUCKY_MAX_QUESTION = MAX_QUESTION;
export { pad2 };
