// 对外分享时的最小防护（全部由环境变量开关，默认关 = 行为与之前完全一致）
//
//   DIVINATION_AUTH=user:pass      开启整站 HTTP Basic 认证（静态页 + API 都要口令）
//   DIVINATION_RATE_LIMIT=120      /api/* 每 IP 每分钟请求上限（默认 120，0=关闭）
//   DIVINATION_AI_LIMIT=6          /api/ai-interpret 每 IP 每分钟上限（默认 6，0=关闭）
//
// 目的：把站点临时分享给朋友时，避免被随机扫描器打满，也避免 /api/ai-interpret 烧掉 MiMo 额度。
import crypto from 'node:crypto';

/* ---------------- 客户端 IP（兼容 cloudflared / 反代） ---------------- */

export function clientIp(req: any): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf.trim();
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/* ---------------- HTTP Basic 认证 ---------------- */

export function basicAuth(req: any, res: any, next: any) {
  const spec = (process.env.DIVINATION_AUTH || '').trim();
  if (!spec) return next();

  const colon = spec.indexOf(':');
  const user = colon > 0 ? spec.slice(0, colon) : '';
  const pass = colon > 0 ? spec.slice(colon + 1) : '';
  if (!user || !pass) return next();          // 格式不对视为未开启，避免把自己锁在外面

  const header = String(req.headers.authorization || '');
  const m = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(header);
  if (m) {
    const decoded = Buffer.from(m[1], 'base64').toString('utf8');
    const c = decoded.indexOf(':');
    if (c > 0) {
      const gotUser = decoded.slice(0, c);
      const gotPass = decoded.slice(c + 1);
      // 定长比较，避免时序侧信道；长度不同直接判否
      if (gotUser.length === user.length && gotPass.length === pass.length
        && crypto.timingSafeEqual(Buffer.from(gotUser), Buffer.from(user))
        && crypto.timingSafeEqual(Buffer.from(gotPass), Buffer.from(pass))) {
        return next();
      }
    }
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="divination-station", charset="UTF-8"');
  res.status(401).type('text/plain; charset=utf-8').send('需要访问口令：请在弹窗中输入分享者给你的用户名与密码。');
}

/* ---------------- 每 IP 滑动窗口限流 ---------------- */

type Bucket = { hits: number[] };

export function rateLimit(windowMs = 60_000, maxRaw?: number) {
  const max = Number(maxRaw ?? process.env.DIVINATION_RATE_LIMIT ?? 120);
  const buckets = new Map<string, Bucket>();
  let lastSweep = Date.now();

  return function (req: any, res: any, next: any) {
    if (!max || max <= 0) return next();
    const now = Date.now();
    const ip = clientIp(req);

    // 每 10 分钟清理一次过期桶，防止 Map 无限增长
    if (now - lastSweep > 600_000) {
      for (const [k, b] of buckets) {
        b.hits = b.hits.filter(t => now - t < windowMs);
        if (b.hits.length === 0) buckets.delete(k);
      }
      lastSweep = now;
    }

    const b = buckets.get(ip) || { hits: [] };
    b.hits = b.hits.filter(t => now - t < windowMs);
    if (b.hits.length >= max) {
      buckets.set(ip, b);
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({
        error: 'RATE_LIMITED',
        message: `请求过于频繁（每 IP 每分钟上限 ${max} 次），请稍后再试`,
      });
    }
    b.hits.push(now);
    buckets.set(ip, b);
    next();
  };
}

export const aiRateLimit = () => rateLimit(60_000, Number(process.env.DIVINATION_AI_LIMIT ?? 6));
