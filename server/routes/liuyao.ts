// POST /api/liuyao —— 六爻起卦（服务端定稿计算 + 入库 + 盘面事实）
//
// 流程：chartCalc('liuyao', {}) 用服务端当前时间起卦（vendor 内部取 new Date() 与随机摇卦）
//      → createDivination 落 SQLite（GUANWEI_DATA_DIR 指向项目 data/）
//      → chartBrief('liuyao') 生成可逐字引用的中文盘面事实
import { Router } from 'express';
import { chartCalc } from '../../vendor/guanwei/shared/core/engine/chart.ts';
import { chartBrief } from '../../vendor/guanwei/server/src/services/chartBrief.ts';
import { createDivination } from '../../vendor/guanwei/server/src/services/divineStore.ts';
import { recordAccess } from '../services/readingLog.ts';
import { clientIp } from '../services/guard.ts';

/** 本地自托管：无登录体系，占卜记录统一挂在该用户名下 */
export const LOCAL_USERNAME = 'local';
const MAX_QUESTION = 300;

const router = Router();

router.post('/', (req, res) => {
  try {
    const body = req.body || {};
    const question = body.question == null || body.question === '' ? undefined : String(body.question).trim();
    if (question && question.length > MAX_QUESTION) {
      return res.status(400).json({ error: 'BAD_QUESTION', message: `所问之事请控制在 ${MAX_QUESTION} 字以内` });
    }

    // 服务端当前时间 + 随机起卦（不接受客户端传入时间，保证盘面由服务端定稿）
    const resultRaw: any = chartCalc('liuyao', {});
    if (!resultRaw || !resultRaw.najia) {
      return res.status(500).json({ error: 'INTERNAL', message: '起卦失败：盘面缺少纳甲信息' });
    }

    const record = createDivination({
      username: LOCAL_USERNAME,
      artId: 'liuyao',
      kind: 'zhanwen',
      question,
      params: { source: 'server-time-random' },
      resultRaw,
    });

    // 记录访问来源（IP / UA / Referer），供 /api/admin/* 查看
    recordAccess(record.id, {
      ip: clientIp(req),
      ua: req.headers['user-agent'] as string,
      referer: req.headers['referer'] as string,
    });

    const brief = chartBrief('liuyao', resultRaw);
    res.json({ id: record.id, question, resultRaw, brief });  } catch (e: any) {
    console.error('[liuyao] 起卦失败:', e?.message || e);
    res.status(500).json({ error: 'INTERNAL', message: '起卦失败，请稍后再试' });
  }
});

export default router;
