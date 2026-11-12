// 个人占卜小站 · 计算服务入口
//
// 结构：
//   bootstrap.mjs   —— 必须最先求值：注入 GUANWEI_DATA_DIR=divination-station/data + 注册 TS 解析钩子
//   server/routes/* —— 本项目新增接口（/api/liuyao、/api/prompt、/api/tarot/cards 图片字段包装、
//                    /api/tarot/session（塔罗抽牌入库）、/api/admin/*（记录查看，需 DIVINATION_ADMIN_TOKEN））
//   vendor/guanwei  —— 观微后端（只读挂载：tarot 路由 + 排盘引擎 + 断语库 + SQLite 存储）
//
// ESM 提升说明：本文件的静态 import 在任何语句执行前完成解析，因此 vendor 与本项目路由
// 一律用动态 import 拉入——保证 bootstrap 先于任何 guanwei 模块求值（钩子与数据目录就位）。
import { BOOT } from './bootstrap.mjs';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import { PUBLIC_DIR, DATA_DIR } from './paths.ts';

const PORT = Number(process.env.PORT || 3901);
// 默认绑所有网卡（局域网部署）；只在本机使用时可用 HOST=127.0.0.1 收紧
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by');
// 反代（nginx/Docker）后取真实客户端 IP
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

app.use(express.json({ limit: '512kb' }));

// CORS：默认仅同源/本机；可用 GUANWEI_ALLOWED_ORIGINS=https://a.com,https://b.com 放开
const ALLOWED = (process.env.GUANWEI_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin: string | undefined, cb: (e: Error | null, ok?: boolean) => void) {
    if (!origin) return cb(null, true);                    // 同源 / curl / 服务端调用
    if (ALLOWED.length === 0) {
      const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
      return cb(null, local);
    }
    return cb(null, ALLOWED.includes(origin));
  },
}));

// 请求日志（联调排查用）
app.use((req, res, next) => {
  res.on('finish', () => {
    console.log('[' + new Date().toLocaleTimeString() + '] ' + req.method + ' ' + req.originalUrl + ' → ' + res.statusCode);
  });
  next();
});

// 访问防护（默认全关，靠环境变量开启；对外分享/隧道暴露时用）
//   DIVINATION_AUTH=user:pass 整站口令；DIVINATION_RATE_LIMIT / DIVINATION_AI_LIMIT 见 services/guard.ts
const { basicAuth, rateLimit, aiRateLimit } = await import('./services/guard.ts');
app.use(basicAuth);
app.use('/api', rateLimit());

// ─── 静态站点：public/（首页 + 塔罗页 + 六爻页 + /img/cards 牌面图） ───
app.use(express.static(PUBLIC_DIR, {
  extensions: ['html'],
  index: 'index.html',
  maxAge: '1h',
  // express4 的 mime 表把 .avif 判成 application/octet-stream，这里显式纠正
  setHeaders(res, filePath) {
    if (filePath.endsWith('.avif')) res.setHeader('Content-Type', 'image/avif');
    else if (filePath.endsWith('.webp')) res.setHeader('Content-Type', 'image/webp');
  },
}));

// ─── API（钩子已就位，动态引入 vendor 与本项目路由） ───
const { default: tarotRouter } = await import('../vendor/guanwei/server/src/routes/tarot.ts');
const { default: cardsRouter } = await import('./routes/tarotCards.ts');   // GET /api/tarot/cards（补图片字段）
const { default: liuyaoRouter } = await import('./routes/liuyao.ts');      // POST /api/liuyao
const { default: promptRouter } = await import('./routes/prompt.ts');      // GET/POST /api/prompt
const { default: aiInterpretRouter } = await import('./routes/aiInterpret.ts'); // POST /api/ai-interpret（MiMo）
const { default: tarotSessionRouter } = await import('./routes/tarotSession.ts'); // POST /api/tarot/session|interpret（落库）
const { default: adminRouter } = await import('./routes/admin.ts');        // GET /api/admin/records（口令）

// 顺序敏感：图片包装路由先应答 GET /cards，其余 tarot 端点交给 vendor
app.use('/api/tarot', cardsRouter);
// 塔罗记录层：/session 抽牌入库、/interpret 解读并入 report（覆盖 vendor 的同名 interpret，多加落库）
app.use('/api/tarot', tarotSessionRouter);
app.use('/api/tarot', tarotRouter);
app.use('/api/liuyao', liuyaoRouter);
app.use('/api/prompt', promptRouter);
app.use('/api/ai-interpret', aiRateLimit(), aiInterpretRouter);
app.use('/api/admin', adminRouter);

app.get('/api', (_req, res) => {
  res.json({
    name: 'divination-station 后端（观微计算引擎）',
    status: 'ok',
    endpoints: [
      'GET /api/health',
      'GET /api/tarot/cards', 'GET /api/tarot/spreads',
      'POST /api/tarot/session', 'POST /api/tarot/draw', 'POST /api/tarot/interpret',
      'POST /api/liuyao',
      'GET|POST /api/prompt',
      'POST /api/ai-interpret',
      'GET /api/admin/records', 'GET /api/admin/records/:id', 'GET /api/admin/export.csv',
    ],
    pages: ['/', '/tarot.html', '/liuyao.html', '/admin.html'],
    time: Date.now(),
  });
});

app.get('/api/health', (_req, res) => {
  let dataDirOk = true;
  try { fs.accessSync(DATA_DIR, fs.constants.W_OK); } catch { dataDirOk = false; }
  res.json({
    status: dataDirOk ? 'ok' : 'degraded',
    dataDir: DATA_DIR,
    dataDirOk,
    port: PORT,
    hooks: BOOT.hooksInstalled,
    timestamp: Date.now(),
  });
});

// API 404（非 API 路径交给静态站/Express 默认处理）
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: '接口不存在' });
});

// 统一错误处理：一律 JSON，不外泄堆栈
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err?.status || err?.statusCode || 500;
  const isJsonErr = err?.type === 'entity.parse.failed';
  if (status >= 500) console.error('[server] 未处理异常:', err?.message || err);
  res.status(status).json({
    error: isJsonErr ? 'BAD_JSON' : (err?.code || 'INTERNAL'),
    message: isJsonErr ? '请求体不是合法 JSON' : (status >= 500 ? '服务暂时不可用' : (err?.message || '请求有误')),
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`
  🔮 divination-station 计算服务已启动
  站点:   http://localhost:${PORT}/          （首页）
  塔罗:   http://localhost:${PORT}/tarot.html
  六爻:   http://localhost:${PORT}/liuyao.html
  健康:   http://localhost:${PORT}/api/health
  监听:   ${HOST}:${PORT}（0.0.0.0 = 局域网内其他设备可通过 http://<本机IP>:${PORT}/ 访问）
  数据:   ${DATA_DIR}
  `);
});
server.on('error', (e: any) => {
  if (e?.code === 'EADDRINUSE') {
    console.error(`[server] 端口 ${PORT} 已被占用：请先停掉旧进程，或用 PORT=xxxx npm start 换端口`);
  } else {
    console.error('[server] 启动失败:', e?.message || e);
  }
  process.exit(1);
});

export default app;
