// GET /api/ai-models —— 页面上「手选模型」用的清单（厂商 + 该厂商可选的模型）
//
// 只返回模型名、端点是否可用等公开信息，**不含任何 API Key**。
// 前端把用户选中的 provider/model 随 /api/ai-interpret 一起发回，服务端据此换模型
// （Key 与 base URL 仍只从服务端配置取，浏览器碰不到）。
import { Router } from 'express';
import { listProviderChoices, llmInfo } from '../services/llm.ts';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const current = llmInfo();
    const providers = await listProviderChoices();
    res.json({
      current: {
        provider: current.provider,
        providerLabel: current.providerLabel,
        model: current.model,
        configured: current.configured,
      },
      providers,
    });
  } catch (e: any) {
    console.error('[ai-models] 列出模型失败:', e?.message || e);
    res.status(500).json({ error: e?.code || 'AI_MODELS_ERROR', message: e?.message || '获取模型清单失败' });
  }
});

export default router;
