// 九术提示词模板片段（/api/prompt 与 /api/ai-interpret 共用）
//
// 组成策略（docs/plan-nine-arts.md §3.3）：
//   · persona 一律取自 vendor skills.ts 的 agentOf(artId)（九术各有一套 role + skills + classics）
//   · 输出要求按两类分叉：命盘类（bazi/ziwei/astrology）与占问类（qimen/liuren/meihua/xiaoliuren）
//   · 时辰未知约束照抄 vendor promptBuilder.ts 的 hourUnknownNote 文案（禁止编造时柱/子女宫/晚年）
// 硬约束 HARD_RULES_COMMON 仍由 routes/prompt.ts 前置注入（本站招牌，逐字保留）。
import { agentOf } from '../../vendor/guanwei/server/src/services/skills.ts';
export const MINGPAN_ARTS = ['bazi', 'ziwei', 'astrology'];
export const ZHANWEN_ARTS = ['qimen', 'liuren', 'meihua', 'xiaoliuren'];

export function isMingpanArt(artId: string): boolean {
  return MINGPAN_ARTS.includes(artId);
}

/** 时辰未知 · 最高约束（与 vendor hourUnknownNote() 文案保持一致，改动请同步） */
export const HOUR_UNKNOWN_NOTE =
  '【时辰未知 · 最高约束】命主出生时辰未知，命盘未排时柱。严禁编造、推断或默认时柱（出生时刻、时柱干支、时支藏干），' +
  '严禁据此断言子女宫、子女缘分、晚年运、暮年际遇等依赖时辰的信息；所有论断只能基于年/月/日三柱与命局整体展开。' +
  '凡涉及子女、暮年等维度，必须明确写「因时辰未知，此维度从略」，不得自行假设一个时辰来圆说。';

/** 角色句 + 本门技法清单（vendor skills.ts 每术 3–5 条 instruction） */
export function personaBlock(artId: string): string[] {
  const a = agentOf(artId);
  const L: string[] = [`你是一位${a.name}。${a.role}`];
  const skills = Array.isArray(a.skills) ? a.skills : [];
  if (skills.length) {
    L.push('', '【本门技法 · 必须遵循】');
    skills.forEach((s, i) => L.push(`${i + 1}. ${s.name}：${s.instruction}`));
  }
  if (a.classics) L.push('', `【古籍范围】${a.classics}（引用时保持原文并标注《书·篇》）`);
  return L;
}

/** 命盘类每术的「必须落到哪一层盘面」要求 */
const MINGPAN_FOCUS: Record<string, string> = {
  bazi: '每段结论必须落到具体四柱干支、日主旺衰、用神喜忌与大运流年（如：日主辛金身弱，喜土生金；行丙午大运）。',
  ziwei: '每段结论必须落到具体星曜落宫、庙旺与生年四化（如：太阳化禄落巳宫；命宫是否借星）。',
  astrology: '每段结论必须落到具体行星落座落宫与相位（如：月亮双鱼落七宫，与土星相刑）。',
};

/** 占问类每术的「必须写清哪一层盘面」要求 */
const ZHANWEN_FOCUS: Record<string, string> = {
  qimen: '必须写清「哪一宫、哪一门、哪一星、哪一神」（如：值符天心落三宫，开门在九宫）。',
  liuren: '必须写清初传/中传/末传所乘天将（如：初传酉乘天后）。',
  meihua: '必须写清体卦/用卦、体用生克与互卦/变卦走向（如：体木克用土；互卦雷泽归妹）。',
  xiaoliuren: '必须写清所落掌诀的吉凶、五行与方位（如：大安 · 吉 · 木 · 东方）。',
};

export function outputBlock(artId: string): string[] {
  const L: string[] = ['【输出要求】'];
  if (isMingpanArt(artId)) {
    L.push('1. 开头 3 句内给出命盘总评（格局高低 + 最关键的一个特征），必须点名具体干支/星曜/相位。');
    L.push('2. 分段解读：人物画像 → 性情 → 家庭 → 学业事业 → 情感 → 财富 → 健康 → 人生阶段（按大运/大限逐段）→ 综合建议。');
    L.push('3. ' + (MINGPAN_FOCUS[artId] || '每段结论必须落到具体盘面，不得泛泛而谈。'));
    L.push('4. 篇幅 600–1200 字，结构化分段，不要复述整张盘。');
  } else {
    L.push('1. 开头 3 句内给出总断（吉/平/不利 + 关键理由），理由必须落到具体盘面，不得只讲道理。');
    L.push('2. 分段解读：现状 → 走势（近期/中期/远期）→ 时机宜忌 → 应对建议；每段末尾用括号标注依据。');
    L.push('3. ' + (ZHANWEN_FOCUS[artId] || '每段结论必须落到具体盘面，不得泛泛而谈。'));
    L.push('4. 结尾给出 3 条可执行建议 + 1 句提醒；篇幅 600–900 字，结构化分段，不要复述整张盘。');
  }
  return L;
}

/** 时辰未知约束：仅 bazi / ziwei，且盘面确实是未知时辰时注入 */
export function hourUnknownBlock(artId: string, resultRaw: unknown): string {
  if (artId !== 'bazi' && artId !== 'ziwei') return '';
  const r = (resultRaw || {}) as any;
  let unknown: boolean;
  if (artId === 'bazi') {
    unknown = r.hourGZ === undefined || r.hourGZ === null || r.hourGZ === '' || r.hourGZ === '未知';
  } else {
    // 紫微未知时辰：correctedHour 为 -1（vendor 按缺时辰盘处理）
    unknown = r.correctedHour === undefined || r.correctedHour === null || Number(r.correctedHour) < 0;
  }
  return unknown ? HOUR_UNKNOWN_NOTE : '';
}
