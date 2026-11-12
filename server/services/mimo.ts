// MiMo（小米）OpenAI 兼容 Chat Completions 客户端 —— 仅服务端持有 API Key，前端永不接触。
// 文档：https://mimo.mi.com/docs/zh-CN/quick-start/summary/first-api-call
//   按量付费  sk-xxxxx    → https://api.xiaomimimo.com/v1
//   Token Plan tp-/ttp-  → https://token-plan-cn.xiaomimimo.com/v1
// 环境变量：
//   MIMO_API_KEY     必配（sk- / tp- / ttp- 开头）；未配置时 mimoConfigured()=false
//   MIMO_BASE_URL    可选，覆盖自动推断的 BASE_URL
//   MIMO_MODEL       可选，默认 mimo-v2.6-pro（省钱可用 mimo-v2.6-flash）
//   MIMO_TIMEOUT_MS  可选，默认 120000
//   MIMO_MAX_TOKENS  可选，默认 2048
import crypto from 'node:crypto';

const DEFAULT_MODEL = 'mimo-v2.6-pro';
const DEFAULT_TIMEOUT_MS = 120000;

export interface MimoResult {
  text: string;
  model: string;
  usage?: any;
  cached: boolean;
}

function baseUrl(): string {
  const override = (process.env.MIMO_BASE_URL || '').trim();
  if (override) return override.replace(/\/+$/, '');
  const key = (process.env.MIMO_API_KEY || '').trim();
  return /^(tp|ttp)-/.test(key)
    ? 'https://token-plan-cn.xiaomimimo.com/v1'
    : 'https://api.xiaomimimo.com/v1';
}

export function mimoConfigured(): boolean {
  return Boolean((process.env.MIMO_API_KEY || '').trim());
}

export function mimoInfo() {
  return {
    configured: mimoConfigured(),
    model: (process.env.MIMO_MODEL || '').trim() || DEFAULT_MODEL,
    baseUrl: baseUrl(),
  };
}

// 同盘同问的重复请求直接回缓存（避免重复计费）。FIFO，上限 32 条。
const cache = new Map<string, MimoResult>();
const CACHE_MAX = 32;

function fail(status: number, code: string, message: string): never {
  const e: any = new Error(message);
  e.status = status;
  e.code = code;
  throw e;
}

export async function chatComplete(opts: {
  system: string;
  user: string;
  model?: string;
  maxCompletionTokens?: number;
  temperature?: number;
}): Promise<MimoResult> {
  const key = (process.env.MIMO_API_KEY || '').trim();
  if (!key) fail(503, 'MIMO_NOT_CONFIGURED', '未配置 MIMO_API_KEY（服务端环境变量或项目根 .env）');

  const model = (opts.model || process.env.MIMO_MODEL || DEFAULT_MODEL).trim();
  const ck = crypto.createHash('sha256').update(model + '\n' + opts.system + '\n' + opts.user).digest('hex');
  const hit = cache.get(ck);
  if (hit) return { ...hit, cached: true };

  const timeoutMs = Number(process.env.MIMO_TIMEOUT_MS) > 0 ? Number(process.env.MIMO_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(baseUrl() + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      signal: ac.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        max_completion_tokens: opts.maxCompletionTokens || Number(process.env.MIMO_MAX_TOKENS) || 2048,
        temperature: opts.temperature ?? 0.8,
        top_p: 0.95,
        stream: false,
      }),
    });
    const raw = await res.text();
    let json: any = null;
    try { json = JSON.parse(raw); } catch { /* 非 JSON 响应保持 null */ }
    if (!res.ok) {
      const msg = json?.error?.message || json?.message || raw.slice(0, 300) || `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) fail(502, 'MIMO_AUTH_ERROR', `MiMo API Key 无效或无权限（${res.status}）：${msg}`);
      if (res.status === 429) fail(503, 'MIMO_RATE_LIMITED', `MiMo 限流/额度不足（429）：${msg}`);
      fail(502, 'MIMO_UPSTREAM_ERROR', `MiMo 调用失败（${res.status}）：${msg}`);
    }
    const text = json?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) fail(502, 'MIMO_EMPTY', 'MiMo 返回了空内容，请稍后重试');

    const out: MimoResult = { text: text.trim(), model: json?.model || model, usage: json?.usage, cached: false };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(ck, out);
    return out;
  } catch (e: any) {
    if (e?.name === 'AbortError') fail(504, 'MIMO_TIMEOUT', `MiMo 调用超时（>${timeoutMs}ms）`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
