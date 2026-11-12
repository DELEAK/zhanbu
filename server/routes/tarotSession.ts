// POST /api/tarot/session —— 服务端抽牌 + 入库（塔罗的记录落点）
// POST /api/tarot/interpret —— 服务端解读 + 把解读结果补挂到记录（report_json）
//
// 为什么要包一层：vendor 的 /api/tarot/draw 与 /api/tarot/interpret 只计算、不落库，
// 因此塔罗此前只有六爻会被记录。这一层沿用同一套 vendor 引擎（drawCards /
// generateInterpretation），额外写入 divinations（art_id='tarot'）与访问来源。
import { Router } from 'express';
import { defaultSpreads } from '../../vendor/guanwei/shared/core/data/spreads.ts';
import { drawCards, generateInterpretation } from '../../vendor/guanwei/shared/core/engine/tarotEngine.ts';
import { createDivination, attachReport, getDivination } from '../../vendor/guanwei/server/src/services/divineStore.ts';
import { recordAccess } from '../services/readingLog.ts';
import { clientIp } from '../services/guard.ts';

export const LOCAL_USERNAME = 'local';
const MAX_QUESTION = 300;
const MAX_CARDS = 20;
const MAX_POSITIONS = 20;

/** 未知分类回退 general：vendor 的 semanticAnalyzer 对未知 category 会直接抛错（500） */
const KNOWN_CATEGORIES = ['general', 'love', 'career', 'wealth', 'health', 'study', 'family', 'social'];

function normalizeCategory(c: unknown): string {
  const s = String(c || 'general');
  return KNOWN_CATEGORIES.includes(s) ? s : 'general';
}

function resolveSpread(body: any) {
  if (body?.customSpread) {
    const pos = Array.isArray(body.customSpread.positions) ? body.customSpread.positions : [];
    if (pos.length === 0 || pos.length > MAX_POSITIONS) return { error: `自定义牌阵位数为 1-${MAX_POSITIONS}` };
    return { spread: { ...body.customSpread, positions: pos.slice(0, MAX_POSITIONS) } };
  }
  const spread = defaultSpreads.find((s: any) => s.id === body?.spreadId);
  return spread ? { spread } : { error: '牌阵不存在' };
}

const router = Router();

/* ── 抽牌：服务端定稿 + 落库 ── */
router.post('/session', (req, res) => {
  try {
    const body = req.body || {};
    const question = body.question == null || body.question === '' ? undefined : String(body.question).trim();
    if (question && question.length > MAX_QUESTION) {
      return res.status(400).json({ error: 'BAD_QUESTION', message: `所问之事请控制在 ${MAX_QUESTION} 字以内` });
    }

    const picked = resolveSpread(body) as any;
    if (picked.error) return res.status(400).json({ error: 'BAD_SPREAD', message: picked.error });
    const spread = picked.spread;

    const cards = drawCards(spread);
    const category = normalizeCategory(body.category);

    const record = createDivination({
      username: LOCAL_USERNAME,
      artId: 'tarot',
      kind: 'zhanwen',
      question,
      params: {
        source: 'server-draw',
        spreadId: body.customSpread ? 'custom' : body.spreadId,
        category,
      },
      resultRaw: { cards, spread, category },
    });

    recordAccess(record.id, {
      ip: clientIp(req),
      ua: req.headers['user-agent'] as string,
      referer: req.headers['referer'] as string,
    });

    res.json({ id: record.id, cards, spread });
  } catch (e: any) {
    console.error('[tarot/session] 抽牌失败:', e?.message || e);
    res.status(500).json({ error: 'INTERNAL', message: '抽牌失败，请稍后再试' });
  }
});

/* ── 解读：同一套引擎，顺带把结果挂到记录上 ── */
router.post('/interpret', (req, res) => {
  try {
    const body = req.body || {};
    const { cards, spread, question, category, id } = body;

    if (!cards || !spread || !question) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    if (!Array.isArray(cards) || cards.length === 0 || cards.length > MAX_CARDS) {
      return res.status(400).json({ error: 'BAD_CARDS', message: `牌数需为 1-${MAX_CARDS}` });
    }
    if (String(question).length > MAX_QUESTION) {
      return res.status(400).json({ error: 'BAD_QUESTION', message: `所问之事请控制在 ${MAX_QUESTION} 字以内` });
    }

    const safeSpread = { ...spread, positions: (spread.positions || []).slice(0, MAX_POSITIONS) };
    const result: any = generateInterpretation(
      cards.slice(0, MAX_CARDS),
      safeSpread,
      String(question).slice(0, MAX_QUESTION),
      normalizeCategory(category),
    );

    // 记录存在时把解读全文补挂（管理页能直接看到「问了什么 + 解读了什么」）
    if (id && getDivination(String(id))) {
      try {
        attachReport(String(id), {
          question: String(question).slice(0, MAX_QUESTION),
          category: normalizeCategory(category),
          fullText: result?.fullText ?? null,
          semantic: result?.semantic ?? null,
          sections: result?.sections ?? null,
        }, 'ok');
      } catch (e: any) {
        console.error('[tarot/interpret] 补挂解读失败:', e?.message || e);
      }
    }

    res.json(result);
  } catch (e: any) {
    console.error('[tarot/interpret] 解读失败:', e?.message || e);
    res.status(500).json({ error: 'INTERNAL', message: '解读失败，请稍后再试' });
  }
});

export default router;
