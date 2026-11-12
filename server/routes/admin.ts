// /api/admin/* —— 起占记录的只读查看与导出（口令保护）
//
// 开关：环境变量 DIVINATION_ADMIN_TOKEN=你的口令；未设置时本组接口返回 503（不暴露数据）。
// 访问：请求头 x-admin-token: <口令>，或 ?token=<口令>（便于浏览器直接打开导出链接）。
// 只读：不提供删除/修改，避免误删占卜记录。
import { Router } from 'express';
import crypto from 'node:crypto';
import { listRecords, getRecord, recordsCsv } from '../services/readingLog.ts';
import { chartBrief } from '../../vendor/guanwei/server/src/services/chartBrief.ts';
import { duanyuPromptBlock } from '../../vendor/guanwei/server/src/services/duanyu.ts';
import { attachReport, getDivination } from '../../vendor/guanwei/server/src/services/divineStore.ts';
import { buildPromptResponse } from './prompt.ts';
import { systemPrompt } from './aiInterpret.ts';
import { chatComplete, mimoInfo } from '../services/mimo.ts';
import { deriveYongshen } from '../services/yongshen.ts';

const router = Router();

function tokenOk(req: any): boolean {
  const expected = (process.env.DIVINATION_ADMIN_TOKEN || '').trim();
  if (!expected) return false;
  const given = String(req.headers['x-admin-token'] || req.query.token || '');
  if (!given || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function guard(req: any, res: any, next: any) {
  if (!(process.env.DIVINATION_ADMIN_TOKEN || '').trim()) {
    return res.status(503).json({
      error: 'ADMIN_NOT_CONFIGURED',
      message: '未设置 DIVINATION_ADMIN_TOKEN，管理查看接口未启用（在 .env 里配置一个口令后重启即可）',
    });
  }
  if (!tokenOk(req)) {
    return res.status(401).json({ error: 'ADMIN_UNAUTHORIZED', message: '管理口令不正确' });
  }
  next();
}

router.use(guard);

// 列表：?limit=100&offset=0&artId=all|tarot|liuyao
router.get('/records', (req, res) => {
  try {
    res.json(listRecords({
      limit: Number(req.query.limit) || 100,
      offset: Number(req.query.offset) || 0,
      artId: req.query.artId as string,
    }));
  } catch (e: any) {
    res.status(500).json({ error: 'INTERNAL', message: e?.message || '读取失败' });
  }
});

// CSV 导出（UTF-8 BOM，Excel 可直接打开）
router.get('/export.csv', (req, res) => {
  try {
    const data = listRecords({
      limit: Math.min(Number(req.query.limit) || 500, 500),
      offset: Number(req.query.offset) || 0,
      artId: req.query.artId as string,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="divination-records-${stamp}.csv"`);
    res.send(recordsCsv(data.list));
  } catch (e: any) {
    res.status(500).json({ error: 'INTERNAL', message: e?.message || '导出失败' });
  }
});

// 单条完整记录：盘面 / 盘面事实 / 古籍引证 / 解读报告 / 来源
router.get('/records/:id', (req, res) => {
  const rec = getRecord(req.params.id);
  if (!rec) return res.status(404).json({ error: 'NOT_FOUND', message: '记录不存在' });
  // 盘面事实与断语由存档的 result_raw_json 实时算出——老记录（没有 report_json）也能读到中文盘面，
  // 而不是只有一坨 JSON。
  try {
    if (rec.resultRaw) {
      (rec as any).facts = chartBrief(rec.artId, rec.resultRaw);
      if (rec.artId === 'liuyao') {
        // 六爻断语库按「用神」关键词命中：先用问题+分类推导用神，再取古籍引证（与提示词口径一致）
        const ys = deriveYongshen(rec.question || undefined, rec.resultRaw, (rec.params as any)?.category);
        (rec as any).yongshen = ys?.text || '';
        const wrapped = ys?.primary?.liuqin ? { ...(rec.resultRaw as any), yongshen: ys.primary.liuqin } : rec.resultRaw;
        (rec as any).duanyu = duanyuPromptBlock('liuyao', wrapped) || '';
      } else {
        (rec as any).duanyu = duanyuPromptBlock(rec.artId, rec.resultRaw) || '';
      }
    }
  } catch (e: any) {
    console.error('[admin] 盘面事实生成失败:', e?.message || e);
  }
  res.json(rec);
});

// 给存档记录补生成 AI 解读并落库（老记录当时没有存解读全文时用；会真实消耗 MiMo 额度）
router.post('/records/:id/interpret', async (req, res) => {
  try {
    const rec = getRecord(req.params.id);
    if (!rec) return res.status(404).json({ error: 'NOT_FOUND', message: '记录不存在' });
    if (!rec.resultRaw) return res.status(400).json({ error: 'NO_RESULT', message: '该记录没有存档盘面，无法生成解读' });

    const info = mimoInfo();
    if (!info.configured) {
      return res.status(503).json({
        error: 'MIMO_NOT_CONFIGURED',
        message: '服务端未配置 MIMO_API_KEY，无法生成 AI 解读；可在站点深度面板复制提示词到任意 AI 工具。',
      });
    }

    const src: any = {
      artId: rec.artId,
      question: rec.question || undefined,
      category: (rec.resultRaw as any)?.category || (rec.params as any)?.category || undefined,
      resultRaw: rec.resultRaw,
    };
    const built = buildPromptResponse(src);
    if (built.status !== 200) return res.status(built.status).json(built.body);

    const result = await chatComplete({ system: systemPrompt(), user: built.body.prompt });
    attachReport(String(rec.id), {
      artId: rec.artId,
      question: rec.question || null,
      category: built.body.category ?? null,
      fullText: result.text,
      model: result.model,
      source: 'admin-backfill',
      createdAt: Date.now(),
    }, 'ok');

    res.json({ ok: true, id: rec.id, model: result.model, usage: result.usage || null, cached: result.cached, text: result.text });
  } catch (e: any) {
    const status = Number(e?.status) || 502;
    if (status >= 500) console.error('[admin/interpret] 调用失败:', e?.message || e);
    res.status(status).json({ error: e?.code || 'MIMO_ERROR', message: e?.message || 'AI 解读生成失败，请稍后再试' });
  }
});

export default router;
