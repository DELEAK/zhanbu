// 通用 LLM 客户端（OpenAI 兼容协议）—— 多厂商可切换，API Key 只留在服务端、永不下发浏览器。
//
// ── 怎么换厂商 ───────────────────────────────────────────────────────────────
// 1) 换 Key：在 .env 里改 <厂商>_API_KEY（例：MINIMAX_API_KEY=sk-cp-xxxx）
// 2) 换厂商：设 AI_PROVIDER=<id>（见下方 PROVIDERS），或直接把别的厂商的 Key 填进来自动识别
// 3) 新增厂商：在 PROVIDERS 里加一条（id / 环境变量前缀 / 默认 base URL / 默认模型 / 自称），其余代码不用动
//
// ── 环境变量 ────────────────────────────────────────────────────────────────
// 厂商专属（优先级最高）：
//   <前缀>_API_KEY  <前缀>_BASE_URL  <前缀>_MODEL  <前缀>_TIMEOUT_MS  <前缀>_MAX_TOKENS
// 通用覆盖（对当前生效的厂商一律生效，优先级低于厂商专属项）：
//   AI_API_KEY  AI_BASE_URL  AI_MODEL  AI_TIMEOUT_MS  AI_MAX_TOKENS
// 厂商选择：
//   AI_PROVIDER=mimo|minimax|deepseek|compat   显式指定；不设则按 Key 前缀嗅探 + 自动探测
//
// ── 厂商清单 ────────────────────────────────────────────────────────────────
//   mimo      MiMo（小米）      sk- 按量付费 / tp-·ttp- Token Plan；base URL 按 Key 前缀自动推断
//   minimax   MiniMax          sk-cp- Coding Plan / sk- 按量；OpenAI 兼容端点
//   deepseek  DeepSeek          sk- 按量；OpenAI 兼容端点
//   compat    任意 OpenAI 兼容  自填 base URL + model + key（新厂商先走它，不用改代码）
//
// 说明：各家的「额度口径」不同（Coding Plan 是订阅窗口、按量付费是余额），
//       换厂商等于换计费口径，但站点侧代码与提示词完全一致，无需改动。
import crypto from 'node:crypto';

export interface ProviderDef {
  id: string;
  label: string;              // 显示名 + 系统提示词里的自称
  envPrefix: string;          // MIMO / MINIMAX / DEEPSEEK / LLM / OLLAMA
  keyEnvs: string[];          // 依次尝试的 Key 环境变量
  baseUrlEnvs: string[];
  modelEnvs: string[];
  timeoutEnvs: string[];
  maxTokensEnvs: string[];
  temperatureEnvs: string[];
  defaultBaseUrl?: string;    // 未显式配置时的兜底 base URL
  defaultModel: string;       // 未显式配置时的兜底模型
  defaultMaxTokens?: number;  // 未显式配置时的输出 token 上限（推理模型的 token 会被思考吃掉，要给够）
  defaultTimeoutMs?: number;  // 未显式配置时的超时（本地小模型推理慢，默认给得宽）
  defaultTemperature?: number; // 未显式配置时的采样温度（小模型要低一点才不容易编事实）
  allowAnonymous?: boolean;   // 允许不带 Key（本地推理服务）
  knownModels?: string[];     // 候选模型清单（页面上可手选；Ollama 走实时 /models）
  blockedModelPatterns?: RegExp[];  // 不在页面出现的模型（本机跑不动的，如 14B 显存不够会 OOM）
  upstreamHint?: string;            // 上游报错时附带的排查提示
  inferBaseUrl?: (key: string) => string;  // 按 Key 前缀推断 base URL
  extraParams?: () => Record<string, any>;  // 追加到请求体的厂商专属参数（如 MiniMax 的 thinking 开关）
  tokenParam: 'max_completion_tokens' | 'max_tokens';  // 各家接受的参数名不同
  doc?: string;               // 备注（README 会引用）
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'mimo',
    label: 'MiMo（小米）',
    envPrefix: 'MIMO',
    keyEnvs: ['MIMO_API_KEY'],
    baseUrlEnvs: ['MIMO_BASE_URL'],
    modelEnvs: ['MIMO_MODEL'],
    timeoutEnvs: ['MIMO_TIMEOUT_MS'],
    maxTokensEnvs: ['MIMO_MAX_TOKENS'],
    temperatureEnvs: ['MIMO_TEMPERATURE'],
    defaultModel: 'mimo-v2.6-pro',
    inferBaseUrl: (key) => (/^(tp|ttp)-/.test(key)
      ? 'https://token-plan-cn.xiaomimimo.com/v1'
      : 'https://api.xiaomimimo.com/v1'),
    tokenParam: 'max_completion_tokens',
    knownModels: ['mimo-v2.6-pro', 'mimo-v2.6-flash'],
    doc: 'sk- 按量付费 / tp-·ttp- Token Plan；base URL 按 Key 前缀自动推断',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    envPrefix: 'MINIMAX',
    keyEnvs: ['MINIMAX_API_KEY'],
    baseUrlEnvs: ['MINIMAX_BASE_URL'],
    modelEnvs: ['MINIMAX_MODEL'],
    timeoutEnvs: ['MINIMAX_TIMEOUT_MS'],
    maxTokensEnvs: ['MINIMAX_MAX_TOKENS'],
    temperatureEnvs: ['MINIMAX_TEMPERATURE'],
    defaultBaseUrl: 'https://api.minimaxi.com/v1',   // 海外站改 https://api.minimax.io/v1
    defaultModel: 'MiniMax-M3',                      // 也可 MiniMax-M2.7 / MiniMax-M3.1-Flash-Preview
    defaultMaxTokens: 8192,                          // 推理 token 也从这里扣，给大点
    // 思考开关：占卜解读不需要长推理，关掉更快更省；MINIMAX_THINKING=enabled 可打开
    extraParams: () => {
      const mode = (env('MINIMAX_THINKING') || 'disabled').toLowerCase();
      if (mode === 'enabled') return { thinking: { type: 'enabled' } };
      if (mode === 'disabled') return { thinking: { type: 'disabled' } };
      return {};
    },
    tokenParam: 'max_tokens',
    knownModels: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M3.1-Flash-Preview'],
    doc: 'sk-cp- Coding Plan / sk- 按量付费；OpenAI 兼容端点',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    envPrefix: 'DEEPSEEK',
    keyEnvs: ['DEEPSEEK_API_KEY'],
    baseUrlEnvs: ['DEEPSEEK_BASE_URL'],
    modelEnvs: ['DEEPSEEK_MODEL'],
    timeoutEnvs: ['DEEPSEEK_TIMEOUT_MS'],
    maxTokensEnvs: ['DEEPSEEK_MAX_TOKENS'],
    temperatureEnvs: ['DEEPSEEK_TEMPERATURE'],
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    tokenParam: 'max_tokens',
    knownModels: ['deepseek-chat', 'deepseek-reasoner'],
    doc: 'sk- 按量付费；OpenAI 兼容端点',
  },
  {
    id: 'compat',
    label: '自定义（OpenAI 兼容）',
    envPrefix: 'LLM',
    keyEnvs: ['LLM_API_KEY', 'OPENAI_API_KEY'],
    baseUrlEnvs: ['LLM_BASE_URL', 'OPENAI_BASE_URL'],
    modelEnvs: ['LLM_MODEL', 'OPENAI_MODEL'],
    timeoutEnvs: ['LLM_TIMEOUT_MS', 'OPENAI_TIMEOUT_MS'],
    maxTokensEnvs: ['LLM_MAX_TOKENS', 'OPENAI_MAX_TOKENS'],
    temperatureEnvs: ['LLM_TEMPERATURE', 'OPENAI_TEMPERATURE'],
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    defaultMaxTokens: 4096,
    tokenParam: 'max_tokens',
    knownModels: [],
    doc: '任意 OpenAI 兼容厂商：填 LLM_BASE_URL + LLM_MODEL + LLM_API_KEY 即可，不用改代码',
  },
  {
    id: 'ollama',
    label: 'Ollama（本地）',
    envPrefix: 'OLLAMA',
    keyEnvs: ['OLLAMA_API_KEY'],      // 本地默认不需要 Key
    baseUrlEnvs: ['OLLAMA_BASE_URL'],
    modelEnvs: ['OLLAMA_MODEL'],
    timeoutEnvs: ['OLLAMA_TIMEOUT_MS'],
    maxTokensEnvs: ['OLLAMA_MAX_TOKENS'],
    temperatureEnvs: ['OLLAMA_TEMPERATURE'],
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',   // Ollama 自带的 OpenAI 兼容端点
    defaultModel: 'deepseek-r1:8b',                // 本地 8B（已装）；12GB 显存的机器不要用 14B，会 OOM 宕机
    defaultMaxTokens: 2048,          // Ollama 默认上下文 4096，提示词占 ~1K，输出别超 2K（否则撞上下文）
    defaultTimeoutMs: 300000,       // 本地 8B 出字慢，超时给宽
    defaultTemperature: 0.4,         // 小模型温度调低，少编事实
    allowAnonymous: true,            // 不带 Key 也能调
    tokenParam: 'max_tokens',
    knownModels: [],                 // 本地模型以实时 /models 为准
    blockedModelPatterns: [/14b/i],  // 本机 12GB 显存装不下 14B（加载即 OOM 宕机），不列出
    upstreamHint: '本地模型崩了常见原因：显存不足/模型太大/OOM；先 ollama stop 清显存，或改用 8B（页面已屏蔽 14B）',
    doc: '本地 Ollama（8B 小模型）：不花钱、不出网；14B 在本机显存不够会宕机，已屏蔽',
  },
];

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_TOKENS = 2048;

export interface LlmResult {
  text: string;
  model: string;
  provider: string;      // provider id
  providerLabel: string; // provider 显示名
  usage?: any;
  cached: boolean;
}

export interface ResolvedLlm {
  provider: ProviderDef;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  anonymous: boolean;       // 允许不带 Key（本地推理服务）
  configured: boolean;
  pickedBy: 'explicit' | 'prefix' | 'auto' | 'none';  // 厂商是怎么选出来的
  hint?: string;                                      // 配错时的提示（如 AI_PROVIDER 指向了没配 Key 的厂商）
  sourceEnvs: { key?: string; baseUrl?: string; model?: string };
}

const DEFAULT_TEMPERATURE = 0.8;

/** 本机端点（127.0.0.1 / localhost / ::1）—— 可以不配 Key */
function isLocalEndpoint(baseUrl: string): boolean {
  try {
    const h = new URL(baseUrl).hostname.toLowerCase();
    return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '0.0.0.0';
  } catch {
    return false;
  }
}

function env(name: string): string { return (process.env[name] || '').trim(); }

function firstEnv(names?: string[]): { name: string; value: string } | null {
  if (!names) return null;
  for (const n of names) {
    const v = env(n);
    if (v) return { name: n, value: v };
  }
  return null;
}

function fail(status: number, code: string, message: string): never {
  const e: any = new Error(message);
  e.status = status;
  e.code = code;
  throw e;
}

function providerById(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * 选厂商：显式 AI_PROVIDER > Key 前缀嗅探（sk-cp- → MiniMax）> 按 PROVIDERS 顺序自动探测 > 默认第一家（未配置）。
 */
export function resolveLlm(): ResolvedLlm {
  const explicit = env('AI_PROVIDER').toLowerCase();
  let provider: ProviderDef | undefined;
  let pickedBy: ResolvedLlm['pickedBy'] = 'none';

  if (explicit) {
    provider = providerById(explicit);
    if (!provider) {
      fail(500, 'AI_UNKNOWN_PROVIDER',
        `未知的 AI_PROVIDER=${explicit}；可选：${PROVIDERS.map((p) => p.id).join(' / ')}`);
    }
    pickedBy = 'explicit';
  } else {
    // 前缀嗅探：MiniMax Coding Plan 的 Key 形态是 sk-cp-…，直接认出来（省得改配置）
    const sniff = PROVIDERS.find((p) => p.keyEnvs.some((e) => env(e).startsWith('sk-cp-')));
    if (sniff) {
      provider = sniff;
      pickedBy = 'prefix';
    } else {
      provider = PROVIDERS.find((p) => firstEnv(p.keyEnvs));
      if (provider) pickedBy = 'auto';
      else if (env('AI_API_KEY') || env('LLM_API_KEY')) { provider = providerById('compat')!; pickedBy = 'auto'; }
      else provider = PROVIDERS[0];
    }
  }

  return resolveForProvider(provider!, pickedBy);
}

/** 指定厂商（页面上手选模型时用；不受 AI_PROVIDER 影响） */
export function resolveProviderById(id: string): ResolvedLlm {
  const p = providerById(String(id || '').toLowerCase());
  if (!p) fail(400, 'AI_UNKNOWN_PROVIDER', `未知的 AI 厂商：${id}`);
  return resolveForProvider(p, 'explicit');
}

/** 算出某个厂商的 Key / base URL / 模型 / 超时等（不负责选厂商） */
function resolveForProvider(p: ProviderDef, pickedBy: ResolvedLlm['pickedBy']): ResolvedLlm {
  const keyHit = firstEnv(p.keyEnvs);
  const apiKey = keyHit?.value || env('AI_API_KEY') || '';

  // base URL：厂商专属 > AI_BASE_URL > 按 Key 推断 > 厂商默认
  const baseHit = firstEnv(p.baseUrlEnvs);
  const baseUrl = (
    baseHit?.value ||
    env('AI_BASE_URL') ||
    (apiKey && p.inferBaseUrl ? p.inferBaseUrl(apiKey) : '') ||
    p.defaultBaseUrl ||
    ''
  ).replace(/\/+$/, '');

  const modelHit = firstEnv(p.modelEnvs);
  const model = (modelHit?.value || env('AI_MODEL') || p.defaultModel).trim();

  const timeoutMs = Number(firstEnv(p.timeoutEnvs)?.value || env('AI_TIMEOUT_MS') || p.defaultTimeoutMs || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const maxTokens = Number(firstEnv(p.maxTokensEnvs)?.value || env('AI_MAX_TOKENS') || p.defaultMaxTokens || DEFAULT_MAX_TOKENS) || DEFAULT_MAX_TOKENS;
  const temperature = Number(firstEnv(p.temperatureEnvs)?.value || env('AI_TEMPERATURE') || p.defaultTemperature || DEFAULT_TEMPERATURE);

  // 配错了的提示：显式指定了厂商但它没 Key，而别的厂商配了 Key
  let hint = '';
  if (!apiKey && pickedBy === 'explicit') {
    const other = PROVIDERS.find((op) => op.id !== p.id && firstEnv(op.keyEnvs));
    if (other) hint = `；检测到 ${other.keyEnvs[0]} 已配置，如需切换请设 AI_PROVIDER=${other.id}`;
  }

  // 能不能不配 Key：厂商允许（如本地 Ollama）或端点在本机
  const anonymous = Boolean(p.allowAnonymous || isLocalEndpoint(baseUrl));

  return {
    provider: p,
    apiKey,
    baseUrl,
    model,
    timeoutMs,
    maxTokens,
    temperature,
    anonymous,
    configured: Boolean(baseUrl && (apiKey || anonymous)),
    pickedBy,
    hint,
    sourceEnvs: {
      key: keyHit?.name || (apiKey ? 'AI_API_KEY' : undefined),
      baseUrl: baseHit?.name || (env('AI_BASE_URL') ? 'AI_BASE_URL' : undefined),
      model: modelHit?.name || (env('AI_MODEL') ? 'AI_MODEL' : undefined),
    },
  };
}

export interface ModelChoice { id: string; label: string; }
export interface ProviderChoice {
  id: string;
  label: string;
  configured: boolean;
  model: string;      // 该厂商当前默认模型
  keyEnv: string;     // 提示用：配哪个环境变量
  models: ModelChoice[];
  note?: string;
}

/** 拉 Ollama 本地已装模型（实时 /models；失败则回落到 knownModels） */
async function fetchOllamaModels(baseUrl: string): Promise<ModelChoice[]> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 3000);
    const res = await fetch(baseUrl + '/models', { signal: ac.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const json: any = await res.json().catch(() => null);
    const arr: any[] = Array.isArray(json?.data) ? json.data : (Array.isArray(json?.models) ? json.models : []);
    const ids = arr
      .map((m: any) => (typeof m === 'string' ? m : (m?.id || m?.name || m?.model)))
      .filter((s: any) => typeof s === 'string' && s);
    return ids.map((id: string) => ({ id, label: id }));
  } catch {
    return [];
  }
}

/** 页面上供手选的厂商 + 模型清单（只含模型名与端点信息，不含 Key） */
export async function listProviderChoices(): Promise<ProviderChoice[]> {
  const out: ProviderChoice[] = [];
  for (const p of PROVIDERS) {
    let r: ResolvedLlm;
    try {
      r = resolveForProvider(p, 'none');
    } catch {
      continue;
    }
    let models: ModelChoice[] = [];
    if (p.id === 'ollama' && r.baseUrl) models = await fetchOllamaModels(r.baseUrl);
    // 本机跑不动的模型（如 14B 显存不够）不往页面上放
    const blocked = p.blockedModelPatterns || [];
    if (blocked.length) models = models.filter((m) => !blocked.some((re) => re.test(m.id)));
    if (!models.length) {
      const ids = Array.from(new Set([r.model, ...(p.knownModels || [])].filter(Boolean)));
      models = ids.map((id: string) => ({ id, label: id }));
    }
    out.push({
      id: p.id,
      label: p.label,
      configured: r.configured,
      model: r.model,
      keyEnv: p.keyEnvs[0],
      models,
      note: p.doc,
    });
  }
  return out;
}

/** 模型名白名单校验（只允许常见模型名字符，防止注入到 URL/日志） */
function validateModel(name: string): string {
  const s = String(name || '').trim();
  if (!s || s.length > 120) fail(400, 'AI_BAD_MODEL', '模型名无效');
  if (!/^[A-Za-z0-9._:\/-]+$/.test(s)) fail(400, 'AI_BAD_MODEL', `模型名含非法字符：${s.slice(0, 40)}`);
  return s;
}

/** 对外可见的概要（不含 Key） */
export function llmInfo() {
  let resolved: ResolvedLlm;
  try {
    resolved = resolveLlm();
  } catch (e: any) {
    // 典型场景：AI_PROVIDER 写错（AI_UNKNOWN_PROVIDER）——把错误带出去，调用方决定怎么报
    return {
      configured: false, provider: 'unknown', providerLabel: '未知厂商', model: '', baseUrl: '',
      keyEnv: '', pickedBy: 'none' as const, hint: '',
      error: { code: e?.code || 'AI_CONFIG_ERROR', message: e?.message || 'AI 厂商配置有误' },
    };
  }
  return {
    configured: resolved.configured,
    provider: resolved.provider.id,
    providerLabel: resolved.provider.label,
    model: resolved.model,
    baseUrl: resolved.baseUrl,
    keyEnv: resolved.provider.keyEnvs[0],
    pickedBy: resolved.pickedBy,
    hint: resolved.hint || '',
  };
}

// 同盘同问的重复请求直接回缓存（避免重复计费）。FIFO，上限 32 条。
const cache = new Map<string, LlmResult>();
const CACHE_MAX = 32;

/** 去掉推理模型塞进正文里的思考段（MiniMax 等会把 <think> 直接拼在 content 里） */
function stripThink(s: string): string {
  return s
    .replace(/<\s*think\s*>[\s\S]*?<\s*\/\s*think\s*>/gi, '')
    .replace(/<\s*thinking\s*>[\s\S]*?<\s*\/\s*thinking\s*>/gi, '')
    .trim();
}

/** content 可能是字符串，也可能是 [{type:'text',text}] 数组 */
function extractContent(msg: any): string {
  const c = msg?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c.map((part: any) => (typeof part === 'string' ? part : (part?.text || ''))).join('');
  }
  if (typeof msg?.reasoning_content === 'string' && !c) return msg.reasoning_content;
  return '';
}

/** 厂商专属参数 + 通用 JSON 覆盖（LLM_EXTRA_PARAMS / AI_EXTRA_PARAMS），如 {"thinking":{"type":"disabled"}} */
function extraParamsFor(p: ProviderDef): Record<string, any> {
  const out: Record<string, any> = p.extraParams ? p.extraParams() : {};
  for (const name of [p.envPrefix + '_EXTRA_PARAMS', 'AI_EXTRA_PARAMS']) {
    const raw = env(name);
    if (!raw) continue;
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) Object.assign(out, obj);
    } catch {
      console.warn(`[llm] ${name} 不是合法 JSON，已忽略`);
    }
  }
  return out;
}

export async function chatComplete(opts: {
  system: string;
  user: string;
  model?: string;        // 页面上手选的模型（覆盖默认）
  provider?: string;     // 页面上手选的厂商（覆盖默认；Key/base URL 仍只取服务端配置）
  maxCompletionTokens?: number;
  temperature?: number;
}): Promise<LlmResult> {
  const r = opts.provider ? resolveProviderById(opts.provider) : resolveLlm();
  if (!r.apiKey && !r.anonymous) {
    fail(503, 'AI_NOT_CONFIGURED',
      `未配置 API Key（${r.provider.envPrefix}_API_KEY 或 AI_API_KEY）${r.hint || ''}；可在页面复制提示词粘贴到任意 AI 工具`);
  }
  if (!r.baseUrl) {
    fail(503, 'AI_NOT_CONFIGURED',
      `未配置 base URL（${r.provider.envPrefix}_BASE_URL 或 AI_BASE_URL）`);
  }

  const model = opts.model ? validateModel(opts.model) : r.model;
  const ck = crypto.createHash('sha256').update(`${r.provider.id}\n${model}\n${opts.system}\n${opts.user}`).digest('hex');
  const hit = cache.get(ck);
  if (hit) return { ...hit, cached: true };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), r.timeoutMs);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (r.apiKey) headers.Authorization = `Bearer ${r.apiKey}`;   // 本地推理服务可不带 Key
    const res = await fetch(r.baseUrl + '/chat/completions', {
      method: 'POST',
      headers,
      signal: ac.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        [r.provider.tokenParam]: opts.maxCompletionTokens || r.maxTokens,
        temperature: opts.temperature ?? r.temperature,
        top_p: 0.95,
        stream: false,
        ...extraParamsFor(r.provider),
      }),
    });
    const raw = await res.text();
    let json: any = null;
    try { json = JSON.parse(raw); } catch { /* 非 JSON 响应保持 null */ }
    if (!res.ok) {
      const msg = json?.error?.message || json?.message || raw.slice(0, 300) || `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) fail(502, 'AI_AUTH_ERROR', `${r.provider.label} API Key 无效或无权限（${res.status}）：${msg}`);
      if (res.status === 429) fail(503, 'AI_RATE_LIMITED', `${r.provider.label} 限流/额度不足（429）：${msg}`);
      fail(502, 'AI_UPSTREAM_ERROR', `${r.provider.label} 调用失败（${res.status}）：${msg}${r.provider.upstreamHint ? '；' + r.provider.upstreamHint : ''}`);
    }
    const text = stripThink(extractContent(json?.choices?.[0]?.message));
    if (!text) {
      const reason = json?.choices?.[0]?.finish_reason === 'length'
        ? `（输出被 max_tokens=${opts.maxCompletionTokens || r.maxTokens} 截断，思考部分吃光了额度）`
        : (json?.choices?.[0]?.message?.reasoning_content ? '（模型只返回了思考内容）' : '');
      fail(502, 'AI_EMPTY', `${r.provider.label} 返回了空内容${reason}；可调大 ${r.provider.envPrefix}_MAX_TOKENS 后重试`);
    }

    const out: LlmResult = {
      text,
      model: json?.model || model,
      provider: r.provider.id,
      providerLabel: r.provider.label,
      usage: json?.usage,
      cached: false,
    };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(ck, out);
    return out;
  } catch (e: any) {
    if (e?.name === 'AbortError') fail(504, 'AI_TIMEOUT', `${r.provider.label} 调用超时（>${r.timeoutMs}ms）`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
