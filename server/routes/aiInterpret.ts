// POST /api/ai-interpret —— 服务端调用 MiMo（小米，OpenAI 兼容协议）生成 AI 深度解读全文。
//
// 入参与 POST /api/prompt 完全一致（artId/question/category/spread、POST 可带 cards / resultRaw），
// 提示词由 prompt.ts 的 buildPromptResponse 同一构建函数生成，
// 保证 AI 深度解读与「复制提示词」使用同一份盘面事实与硬约束（逐字引用排盘事实）。
//
// 未配置 MIMO_API_KEY 时返回 503 MIMO_NOT_CONFIGURED，前端回退为「复制提示词到任意 AI」。
// API Key 只存在服务端环境变量 / 项目根 .env，永不下发到浏览器。
import { Router } from 'express';
import { buildPromptResponse } from './prompt.ts';
import { chatComplete, mimoInfo } from '../services/mimo.ts';
import { attachReport, getDivination } from '../../vendor/guanwei/server/src/services/divineStore.ts';

const router = Router();

export function systemPrompt(): string {
  const now = new Date();
  const date = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
  return [
    '你是 MiMo（小米公司研发的 AI 助手），同时也是资深的塔罗占卜师与六爻（周易纳甲筮法）解卦师。',
    `今天的日期：${date}。`,
    '用户会给你一份【排盘事实】和解读要求：请严格遵守其中的全部约束作答，',
    '尤其是「必须逐字引用排盘事实，不得推算或改写」这一条。',
    '输出简体中文纯文本（用空行分段），不要输出 Markdown 标记、代码块或多余前言。',
  ].join('\n');
}

router.post('/', async (req: any, res: any) => {
  try {
    const built = buildPromptResponse((req.body || {}) as any);
    if (built.status !== 200) return res.status(built.status).json(built.body);

    const info = mimoInfo();
    if (!info.configured) {
      return res.status(503).json({
        error: 'MIMO_NOT_CONFIGURED',
        message: '服务端未配置 MIMO_API_KEY，暂不能生成 AI 解读；可复制提示词粘贴到任意 AI 工具。',
      });
    }

    const result = await chatComplete({
      system: systemPrompt(),
      user: built.body.prompt,
    });

    // 页面带了记录 id（塔罗 state.readingId / 六爻 result.id）时，把 AI 全文存进该记录的 report_json，
    // 管理页就能看到「问了什么 + AI 解读了什么」，不必事后补跑。
    let saved = false;
    const rid = req.body?.id ? String(req.body.id) : '';
    if (rid) {
      try {
        if (getDivination(rid)) {
          attachReport(rid, {
            artId: built.body.artId,
            question: built.body.question ?? null,
            category: built.body.category ?? null,
            fullText: result.text,
            model: result.model,
            source: 'ai-interpret',
            createdAt: Date.now(),
          }, 'ok');
          saved = true;
        }
      } catch (e: any) {
        console.error('[ai-interpret] 保存解读失败:', e?.message || e);
      }
    }

    res.json({
      ok: true,
      saved,
      artId: built.body.artId,
      question: built.body.question,
      category: built.body.category,
      brief: built.body.brief,
      model: result.model,
      usage: result.usage || null,
      cached: result.cached,
      text: result.text,
    });
  } catch (e: any) {
    const status = Number(e?.status) || 502;
    if (status >= 500) console.error('[ai-interpret] 调用失败:', e?.message || e);
    res.status(status).json({
      error: e?.code || 'MIMO_ERROR',
      message: e?.message || 'AI 解读生成失败，请稍后再试',
    });
  }
});

export default router;
