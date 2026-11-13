// POST /api/chart —— 九术统一起盘（七术：bazi/ziwei/astrology/qimen/liuren/meihua/xiaoliuren）
//
// 流程：归一化输入（chartInputs）→ chartCalc 由服务端定稿排盘 → chartBrief 生成可逐字引用的
//      盘面事实 → createDivination 落库 → recordAccess → 返回 id/resultRaw/brief/duanyu。
//      断语（duanyu）由 vendor 规则库按盘面特征匹配，可能为空（如梅花、占星）。
// GET /api/chart/arts —— 七术能力清单（首页/表单/健康检查共用，schema 直接转发 vendor）。
import { Router } from 'express';
import { CHART_INPUT_SCHEMA, chartCalc } from '../../vendor/guanwei/shared/core/engine/chart.ts';
import { chartBrief } from '../../vendor/guanwei/server/src/services/chartBrief.ts';
import { duanyuPromptBlock } from '../../vendor/guanwei/server/src/services/duanyu.ts';
import { createDivination } from '../../vendor/guanwei/server/src/services/divineStore.ts';
import { recordAccess } from '../services/readingLog.ts';
import { clientIp } from '../services/guard.ts';
import { ART_META, CHART7_ARTS, InputError, normalizeChartInputs } from '../services/chartInputs.ts';
import { LUCKY_ARTS, findLucky, type LuckyArt } from '../services/lucky.ts';

const LOCAL_USERNAME = 'local';
const MAX_QUESTION = 300;
const MAX_CATEGORY = 20;
const FALLBACK_OBS = [
  '无法识别所问之事的具体所指', '所问之事牵涉多方', '所问之事尚在变化', '所问之事缺少明确时限',
];

const router = Router();

function trimText(v: unknown, max: number): string {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return s.length > max ? s.slice(0, max) : s;
}

/** 无 vendor 断语时的兜底：提示模型按盘面特征自行取象，不编造具体断语 */
function fallbackDuanyu(artId: string): string {
  return [
    `【断语参考】${ART_META[artId as keyof typeof ART_META].label}暂无命中规则库的现成断语，请勿虚构古籍原文；`,
    `可围绕「${FALLBACK_OBS.join('、')}」等盘面特征取象，结论保持克制并给出行事建议。`,
  ].join('');
}

router.get('/arts', (_req, res) => {
  const arts = CHART7_ARTS.map((id) => ({
    artId: id,
    label: ART_META[id].label,
    kind: ART_META[id].kind,
    group: ART_META[id].group,
    needs: ART_META[id].needs,
    note: ART_META[id].note,
    schema: CHART_INPUT_SCHEMA[id] || {},
  }));
  res.json({ arts });
});

// POST /api/chart/lucky —— 择吉起盘（v1）：在指定时间附近找最近的「吉盘」，返回真实盘面
router.post('/lucky', (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const artId = body.artId;

  if (typeof artId !== 'string' || !(LUCKY_ARTS as readonly string[]).includes(artId)) {
    return res.status(400).json({
      error: 'BAD_ART',
      message: `择吉暂支持四术：${LUCKY_ARTS.join(' / ')}（命盘类无吉凶档位，六爻/塔罗请用普通入口）`,
    });
  }

  const question = trimText(body.question, MAX_QUESTION);
  if (body.question != null && String(body.question).trim().length > MAX_QUESTION) {
    return res.status(400).json({ error: 'BAD_QUESTION', message: `所问之事请控制在 ${MAX_QUESTION} 字以内` });
  }
  const category = trimText(body.category, MAX_CATEGORY);

  let at: Date | undefined;
  if (body.at != null && String(body.at).trim() !== '') {
    const d = new Date(String(body.at));
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ error: 'BAD_INPUTS', message: '起盘时间无法识别，请用本地时间（YYYY-MM-DDTHH:mm）', field: 'at' });
    }
    at = d;
  }

  let windowMinutes: number | undefined;
  if (body.windowMinutes != null && String(body.windowMinutes).trim() !== '') {
    const n = Number(body.windowMinutes);
    if (!Number.isFinite(n) || n < 60 || n > 4320) {
      return res.status(400).json({ error: 'BAD_INPUTS', message: '搜索窗口需在 60–4320 分钟之间', field: 'windowMinutes' });
    }
    windowMinutes = Math.floor(n);
  }

  const hit = findLucky({ artId: artId as LuckyArt, category, at, windowMinutes });
  if (!hit) {
    return res.status(404).json({
      error: 'NO_LUCKY_CHART',
      message: '所选时间窗口内暂未找到吉盘：可以扩大搜索窗口，或换一个所问之事再试',
    });
  }

  const record = createDivination({
    username: LOCAL_USERNAME,
    artId: hit.artId,
    kind: 'zhanwen',
    question: question || undefined,
    params: {
      source: 'lucky-search',
      inputs: hit.inputs,
      at: hit.at,
      attempts: hit.attempts,
      verdict: hit.verdict.tier,
      reasons: hit.verdict.reasons,
      category: category || undefined,
    },
    resultRaw: hit.resultRaw,
  });

  recordAccess(record.id, {
    ip: clientIp(req),
    ua: req.headers['user-agent'] as string,
    referer: req.headers['referer'] as string,
  });

  return res.json({
    id: record.id,
    artId: hit.artId,
    kind: 'zhanwen',
    question: question || null,
    category: category || null,
    params: {
      source: 'lucky-search',
      inputs: hit.inputs,
      at: hit.at,
      attempts: hit.attempts,
      verdict: hit.verdict.tier,
    },
    resultRaw: hit.resultRaw,
    brief: hit.brief,
    yongshen: null,
    duanyu: hit.duanyu,
    lucky: {
      tier: hit.verdict.tier,
      reason: hit.verdict.reasons.join('；'),
      matchedAt: hit.at,
      attempts: hit.attempts,
      windowMinutes: windowMinutes ?? 720,
    },
  });
});

router.post('/', (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const artId = body.artId;

  if (typeof artId !== 'string' || !(CHART7_ARTS as readonly string[]).includes(artId)) {
    return res.status(400).json({
      error: 'BAD_ART',
      message: `artId 只支持七术：${CHART7_ARTS.join(' / ')}（六爻请用 /api/liuyao，塔罗请用 /api/tarot/session）`,
    });
  }

  const question = trimText(body.question, MAX_QUESTION);
  if (body.question != null && String(body.question).trim().length > MAX_QUESTION) {
    return res.status(400).json({ error: 'BAD_QUESTION', message: `所问之事请控制在 ${MAX_QUESTION} 字以内` });
  }
  const category = trimText(body.category, MAX_CATEGORY);

  let normalized: ReturnType<typeof normalizeChartInputs>;
  try {
    normalized = normalizeChartInputs(artId, body.inputs);
  } catch (e) {
    if (e instanceof InputError) {
      return res.status(400).json({ error: 'BAD_INPUTS', message: e.message, field: e.field });
    }
    console.error('[chart] 输入归一化异常:', e);
    return res.status(500).json({ error: 'INTERNAL', message: '排盘参数异常，请稍后再试' });
  }

  try {
    const resultRaw: any = chartCalc(normalized.artId, normalized.inputs);
    if (!resultRaw || typeof resultRaw !== 'object') {
      return res.status(500).json({ error: 'INTERNAL', message: '排盘失败：引擎未返回盘面' });
    }

    const brief = chartBrief(normalized.artId, resultRaw);
    const ruleDuanyu = duanyuPromptBlock(normalized.artId, resultRaw).trim();
    const duanyu = ruleDuanyu || fallbackDuanyu(normalized.artId);

    const record = createDivination({
      username: LOCAL_USERNAME,
      artId: normalized.artId,
      kind: normalized.kind,
      question: question || undefined,
      params: { source: 'server-calc', inputs: normalized.inputs },
      resultRaw,
    });

    recordAccess(record.id, {
      ip: clientIp(req),
      ua: req.headers['user-agent'] as string,
      referer: req.headers['referer'] as string,
    });

    return res.json({
      id: record.id,
      artId: normalized.artId,
      kind: normalized.kind,
      question: question || null,
      category: category || null,
      params: { source: 'server-calc', inputs: normalized.inputs },
      resultRaw,
      brief,
      yongshen: null,
      duanyu,
    });
  } catch (e: any) {
    console.error(`[chart] ${normalized.artId} 排盘失败:`, e?.message || e);
    return res.status(500).json({ error: 'INTERNAL', message: '排盘失败，请稍后再试' });
  }
});

export default router;
