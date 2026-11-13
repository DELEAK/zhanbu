// GET/POST /api/prompt —— AI 解读提示词（一段可直接粘贴给 LLM 的中文提示词）
//
// 组成：chartBrief 的盘面事实（可引用域） + vendor duanyuPromptBlock（古籍断语引证）
//      + 自写的六爻用神候选推导（server/services/yongshen.ts）
//
// 入参（GET 用 query，POST 用 JSON；POST 可携带已排好的盘面，保证提示词与页面显示一致）：
//   artId    九术之一（默认 'liuyao'）：bazi/ziwei/astrology/qimen/liuren/meihua/xiaoliuren（七术需带 resultRaw）
//            + 既有 liuyao/tarot
//   question 所问之事（可空，≤300 字）
//   category 问题分类（可空，≤20 字：综合/感情/事业/财运/学业/健康/人际…；影响六爻用神候选）
//   spread   牌阵 id（仅 tarot；缺省时服务端现抽一副）
//   cards    POST：/api/tarot/draw 返回的 DrawnCard[]（{cardId,isReversed,positionId}）
//   spread   POST：/api/tarot/draw 返回的 spread 对象（与上面的 cards 配套）
//   resultRaw POST：/api/chart（七术）或 /api/liuyao 返回的 resultRaw
//            七术必须携带（否则 400 NEED_RESULT：提示词必须与页面同一盘面）；六爻缺省时服务端现起一卦
import { Router } from 'express';
import { chartCalc } from '../../vendor/guanwei/shared/core/engine/chart.ts';
import { chartBrief } from '../../vendor/guanwei/server/src/services/chartBrief.ts';
import { duanyuPromptBlock } from '../../vendor/guanwei/server/src/services/duanyu.ts';
import { tarotCards } from '../../vendor/guanwei/shared/core/data/tarotCards.ts';
import { withImages } from './tarotCards.ts';
import { deriveYongshen } from '../services/yongshen.ts';
import { hourUnknownBlock, outputBlock, personaBlock } from '../services/promptTemplates.ts';
import { isChart7Art } from '../services/chartInputs.ts';

type ArtId = 'liuyao' | 'tarot' | 'bazi' | 'ziwei' | 'astrology' | 'qimen' | 'liuren' | 'meihua' | 'xiaoliuren';
const MAX_QUESTION = 300;
const router = Router();

// ─── 塔罗：把 /api/tarot/draw 的原始牌（cardId/isReversed/positionId）展开成牌面事实 ───
function expandTarot(spreadIn: any, drawIn: any, spreadId?: string) {
  let spread = spreadIn;
  let draw = drawIn;
  if (!spread || !Array.isArray(draw) || draw.length === 0) {
    const fresh: any = chartCalc('tarot', { spread: spreadId });   // 服务端现抽
    spread = fresh.spread;
    draw = fresh.cards;
  }
  const byId = new Map<number, any>(tarotCards.map((c: any) => [c.id, c]));
  const posLabel = (d: any): string => {
    if (typeof d?.position === 'string' && d.position) return d.position;
    const p = (spread?.positions || []).find((x: any) => x.id === d?.positionId);
    return p ? p.name : '第' + (Number(d?.positionId) + 1) + '位';
  };
  const cards = (draw as any[]).map((d: any) => {
    const c = byId.get(d?.cardId);                 // 无 cardId → 视为已展开的牌对象
    const base = c || d;
    if (!base) return d;
    const img = withImages(base);                  // 补 slug / 三档图片 URL（与 /api/tarot/cards 同源）
    const reversed = d?.reversed !== undefined ? !!d.reversed : !!d?.isReversed;
    return {
      cardId: d?.cardId,
      name: img.name,
      nameEn: img.nameEn,
      slug: img.slug,
      reversed,
      isReversed: reversed,
      position: posLabel(d),
      positionId: d?.positionId,
      keywords: img.keywords || [],
      up: img.meanings?.upright || '',
      rev: img.meanings?.reversed || '',
      imgLow: img.imgLow,
      imgHiWebP: img.imgHiWebP,
      imgHiAvif: img.imgHiAvif,
    };
  });
  return { spread, draw, cards };
}

// ─── 提示词模板 ───
const HARD_RULES_COMMON = [
  '【必须逐字引用下列排盘事实，不得推算或改写】',
  '1. 下方【排盘事实】是本次解读唯一可信的数据源：卦名、世应、动爻、纳甲干支、六亲、六神、旬空月破、牌名、正逆位、牌阵位置等，一律逐字引用；禁止自行重排、补算、脑补或改动任何一个字。',
  '2. 事实之外的信息（如未列出的爻、未抽到的牌、宫位推演）一律不得编造；事实不足以支撑结论时，明确写「盘面未显示」。',
  '3. 需要引用古籍断语时，保持原文并标注出处《书·篇》，不得改写原文。',
  '4. 语言：简体中文，语气克制、具体、可执行；不恐吓、不承诺绝对结果、不作医疗/法律/财务结论。',
];

function liuyaoPrompt(question: string, brief: string, yongshenText: string, duanyu: string, category: string): string {
  const L: string[] = [];
  L.push('你是一位资深的六爻（周易纳甲筮法）解卦师，为人占断所问之事。请严格按以下材料作答。');
  L.push('');
  L.push(...HARD_RULES_COMMON);
  L.push('');
  L.push('【所问之事】' + (question ? question : '（未提供，按「问事不明」处理，先说明可补问的方向）'));
  if (category) L.push('【问题分类】' + category);
  L.push('');
  L.push('【排盘事实】');
  L.push(brief);
  L.push('');
  if (yongshenText) { L.push(yongshenText); L.push(''); }
  if (duanyu) { L.push(duanyu); L.push(''); }
  L.push('【输出要求】');
  L.push('1. 开头 3 句内给出总体结论（吉/平/不利 + 关键理由），理由必须落到具体爻位、卦名或六亲六神。');
  L.push('2. 分段解读「现状 → 发展走向 → 应对建议」，每段末尾用括号标注依据（如：四爻己酉妻财动、世爻旬空）。');
  L.push('3. 时机提示：结合月建、旬空、动爻说明何时有望、何时宜守。');
  L.push('4. 结尾给出 3 条可执行建议 + 1 句提醒。');
  L.push('5. 篇幅 600-900 字，结构化分段，不要复述整张盘。');
  L.push('');
  L.push('【免责声明】本内容仅供娱乐与自我参考，不构成医疗、法律、财务建议。');
  return L.join('\n');
}

function tarotPrompt(question: string, brief: string, duanyu: string, category: string): string {
  const L: string[] = [];
  L.push('你是一位资深的塔罗占卜师，请依据下方牌阵为提问者解读。');
  L.push('');
  L.push(...HARD_RULES_COMMON);
  L.push('');
  L.push('【所问之事】' + (question ? question : '（未提供，按「问事不明」处理，先说明可补问的方向）'));
  if (category) L.push('【问题分类】' + category);
  L.push('');
  L.push('【排盘事实】');
  L.push(brief);
  L.push('');
  if (duanyu) { L.push(duanyu); L.push(''); }
  L.push('【输出要求】');
  L.push('1. 开头 3 句内给出总体结论，必须点名抽到的牌与正逆位。');
  L.push('2. 按牌阵位置逐张解读（正位/逆位 + 该位含义 + 与所问之事的关联），再给出整体走向。');
  L.push('3. 结尾给出 3 条可执行建议 + 1 句提醒。');
  L.push('4. 篇幅 600-900 字，结构化分段，不要复述整副牌义。');
  L.push('');
  L.push('【免责声明】本内容仅供娱乐与自我参考，不构成医疗、法律、财务建议。');
  return L.join('\n');
}

// 九术通用提示词：persona（vendor agentOf）+ 硬约束 + 盘面事实 + 断语 + 输出要求（命盘/占问分叉）
function chartPrompt(artId: string, question: string, brief: string, duanyu: string, category: string, resultRaw: unknown): string {
  const L: string[] = [];
  L.push(...personaBlock(artId));
  L.push('');
  L.push(...HARD_RULES_COMMON);
  L.push('');
  L.push('【所问之事】' + (question ? question : '（未提供：若为命盘类按「论命」处理，先给总评再分维度；若为占问类按「问事不明」处理，先说明可补问的方向）'));
  if (category) L.push('【问题分类】' + category);
  L.push('');
  L.push('【排盘事实】');
  L.push(brief);
  L.push('');
  const hourNote = hourUnknownBlock(artId, resultRaw);
  if (hourNote) { L.push(hourNote); L.push(''); }
  if (duanyu) { L.push(duanyu); L.push(''); }
  L.push(...outputBlock(artId));
  L.push('');
  L.push('【免责声明】本内容仅供娱乐与自我参考，不构成医疗、法律、财务建议。');
  return L.join('\n');
}

function parseArtId(v: any): ArtId | null {
  const s = String(v ?? 'liuyao').toLowerCase();
  if (s === 'liuyao' || s === 'tarot') return s as ArtId;
  return isChart7Art(s) ? s : null;
}

// 构建提示词响应（/api/prompt 与 /api/ai-interpret 共用，保证 AI 解读与「复制提示词」口径一致）
export function buildPromptResponse(src: any): { status: number; body: any } {
  try {
    const artId = parseArtId(src.artId);
    if (!artId) {
      return {
        status: 400,
        body: {
          error: 'BAD_ART',
          message: 'artId 只支持九术：bazi/ziwei/astrology/qimen/liuren/meihua/xiaoliuren/liuyao/tarot',
        },
      };
    }

    const question = src.question == null || src.question === '' ? undefined : String(src.question).trim();
    if (question && question.length > MAX_QUESTION) {
      return { status: 400, body: { error: 'BAD_QUESTION', message: `所问之事请控制在 ${MAX_QUESTION} 字以内` } };
    }
    const spreadId = src.spread ? String(src.spread) : undefined;
    // 问题分类（前端 select：综合/感情/事业/财运/学业/健康/人际…，自由文本也接受，≤20 字）
    let category = src.category == null || src.category === '' ? '' : String(src.category).trim().slice(0, 20);

    let brief = '';
    let yongshen: any = null;
    let duanyu = '';
    let payload: any = {};
    let prompt = '';

    if (artId === 'liuyao') {
      // 已起过的盘优先（提示词与页面展示一致）；没有就服务端现起一卦
      const resultRaw = src.resultRaw && typeof src.resultRaw === 'object' ? src.resultRaw : chartCalc('liuyao', {});
      brief = chartBrief('liuyao', resultRaw);
      yongshen = deriveYongshen(question, resultRaw, category);
      // vendor 断语库对六爻按「用神」关键词命中：把推导出的用神六亲喂进去（shallow copy，不改原盘）
      duanyu = duanyuPromptBlock('liuyao', yongshen?.primary?.liuqin ? { ...(resultRaw as any), yongshen: yongshen.primary.liuqin } : resultRaw) || '';
      prompt = liuyaoPrompt(question || '', brief, yongshen?.text || '', duanyu, category);
      payload = { resultRaw };
    } else if (artId === 'tarot') {
      const incoming = src.resultRaw && typeof src.resultRaw === 'object'
        ? src.resultRaw
        : (src.cards ? { cards: src.cards, spread: src.spread } : null);
      const t = expandTarot(incoming?.spread, incoming?.cards, spreadId);
      brief = chartBrief('tarot', { cards: t.cards });
      duanyu = duanyuPromptBlock('tarot', { cards: t.cards, spread: t.spread }) || '';
      payload = { cards: t.cards, spread: t.spread };
      prompt = tarotPrompt(question || '', brief, duanyu, category);
    } else {
      // 七术：必须带页面已排好的 resultRaw —— 不接受服务端现排，保证提示词与页面盘面完全一致
      const resultRaw = src.resultRaw && typeof src.resultRaw === 'object' ? src.resultRaw : null;
      if (!resultRaw) {
        return {
          status: 400,
          body: {
            error: 'NEED_RESULT',
            message: '七术提示词必须携带 resultRaw：请先调用 POST /api/chart 取得盘面事实，再把 resultRaw 一并提交',
          },
        };
      }
      brief = chartBrief(artId, resultRaw);
      duanyu = duanyuPromptBlock(artId, resultRaw) || '';
      payload = { resultRaw };
      prompt = chartPrompt(artId, question || '', brief, duanyu, category, resultRaw);
    }

    return {
      status: 200,
      body: {
        artId,
        question: question || null,
        category: category || null,
        brief,
        yongshen,                 // 仅六爻：{primary, candidates, shi, matchedAny, text}；其余术为 null
        duanyu,                   // vendor 断语引证块（无命中时为空串）
        ...payload,               // 六爻：resultRaw；塔罗：cards + spread
        prompt,
      },
    };
  } catch (e: any) {
    console.error('[prompt] 生成失败:', e?.message || e);
    return { status: 500, body: { error: 'INTERNAL', message: '提示词生成失败，请稍后再试' } };
  }
}

function handler(req: any, res: any): void {
  const src = req.method === 'GET' ? (req.query as any) : ((req.body || {}) as any);
  const out = buildPromptResponse(src);
  res.status(out.status).json(out.body);
}

router.get('/', handler);
router.post('/', handler);

export default router;
