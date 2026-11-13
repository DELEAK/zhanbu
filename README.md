# divination-station · 个人占卜小站（九术）

塔罗、周易六爻、子平八字、紫微斗数、奇门遁甲、大六壬、梅花易数、小六壬、西方星盘的自托管占卜站点：**观微 guanwei 后端（vendored，只读）当计算引擎，自写极简 Express 服务与原生前端**。
抽牌、正逆位、起卦、纳甲装卦、断语引证全部在服务端定稿，前端零计算、零历法库；AI 解读默认 = 生成一段提示词供复制，**不内嵌 LLM**；配置任一厂商的 API Key（MiMo / MiniMax / DeepSeek / 任意 OpenAI 兼容）后可一键由服务端生成解读全文（见 [4.7](#47-post-apiai-interpretai-深度解读--多厂商-llm)）。

```text
divination-station/
├── server/                     # ★ 自写的计算服务（Express + 新增接口）
│   ├── index.ts                # Express 入口：静态站 + 挂载 vendor tarot 路由 + 新增接口
│   ├── bootstrap.mjs           # 必须最先求值：注入 GUANWEI_DATA_DIR、注册 TS 解析钩子
│   ├── ts-hooks.mjs            # ESM resolve 钩子：vendor 的 .js / 无扩展名导入 → .ts
│   ├── paths.ts                # ROOT / PUBLIC_DIR / DATA_DIR
│   ├── routes/tarotCards.ts    # GET /api/tarot/cards（补 slug + 三档图片字段）
│   ├── routes/liuyao.ts        # POST /api/liuyao
│   ├── routes/chart.ts         # POST /api/chart（七术统一起盘）+ GET /api/chart/arts（能力清单）
│   ├── services/chartInputs.ts # 七术输入归一化（公历→农历/干支换算 + 字段校验）
│   ├── routes/prompt.ts        # GET|POST /api/prompt
│   ├── routes/aiInterpret.ts   # POST /api/ai-interpret（服务端调用 LLM 生成 AI 深度解读）
│   ├── routes/aiModels.ts      # GET /api/ai-models（页面上手选厂商/模型的清单）
│   ├── services/yongshen.ts    # 自写六爻用神候选推导
│   └── services/llm.ts         # 多厂商 LLM 客户端（MiMo/MiniMax/DeepSeek/任意 OpenAI 兼容）；Key 只留服务端
├── vendor/guanwei/             # 观微后端（上游，禁止修改：只读挂载）
├── shared/…（见 vendor 内）      # 排盘引擎 / 牌库 / 断语库
├── public/                     # 前端静态站：九术入口 + 9 个页面 + /img/cards
│   ├── index.html              # 首页：命盘 / 占问 / 牌类 九卡入口
│   ├── tarot.html  liuyao.html # 牌类与六爻（t6 已建）
│   ├── bazi.html  ziwei.html   # 子平八字 / 紫微斗数
│   ├── qimen.html liuren.html  # 奇门遁甲 / 大六壬
│   ├── meihua.html xiaoliuren.html  # 梅花易数 / 小六壬
│   ├── astrology.html admin.html    # 西方星盘 / 记录管理
│   └── assets/                 # app.js（公共助手 DS）+ 9 个页面脚本 + styles.css
├── data/                       # ★ 运行期数据（guanwei.db，SQLite；已 gitignore）
├── scripts/                    # 牌面图片抓取与编码 + 验证脚本（禁止修改业务逻辑）
├── .gitignore                  # 忽略 node_modules / data/ / .card-cache / .pylibs 等
└── docs/                       # 调研 / 设计 / 环境 / 验证 / 九术计划 五份文档（见下方文档导航）
```

**文档导航（五份文档互相链接）**

| 文档 | 内容 | 与其他文档的关系 |
|---|---|---|
| [docs/research.md](docs/research.md) | 参考网站调研：17 条参考（含可借鉴/不可借鉴）+ 21 条可落设计要点 | 下游输入 → design.md |
| [docs/design.md](docs/design.md) | 设计文档：九术 IA 与页面线框、盘面组件、设计 token、双性能模式矩阵、验收清单 | 依据 research.md；实现由 verify.md 核验 |
| [docs/env.md](docs/env.md) | 环境与牌面资源：网络故障诊断与解法、重跑命令、78 行 slug↔中英文映射 | 支撑 `fetch:cards` / `encode:cards` 图片链路 |
| [docs/verify.md](docs/verify.md) | 端到端验证报告：t6 的 8 条验收 + **九术 A1–A7 / E10 验收（§6）** | 核验 design.md 验收清单与本文 API 样例 |
| [docs/plan-nine-arts.md](docs/plan-nine-arts.md) | 九术接入计划：契约、页面规格、任务表与验收 | 本阶段实现的唯一依据 |

复核命令（详见 [docs/verify.md](docs/verify.md)）：

```bash
node scripts/verify-static.mjs   # 静态检查 5 项（禁项/低性能 CSS/10 份 HTML 默认 low）
node scripts/verify-arts.mjs     # 七术后端验收 A1–A7（需服务已启动 + 管理口令）
node scripts/verify-e2e.mjs      # Firefox BiDi 行为测试（E1–E9 + E10 七页，需本机 firefox）
```

---

## 1. 快速开始（部署步骤）

前置：**Node ≥ 22.13**（用到 `node:sqlite` 与 `--experimental-strip-types`），无需构建、无需打包器。

```bash
# ① 安装依赖（只有 express / cors / lunar-typescript / astronomy-engine 四个）
npm ci            # 或 npm install

# ②（可选，首次）生成 78 张牌面图：480/1200 WebP + 1200 AVIF
npm run fetch:cards          # 下载公版韦特原图（约 340MB，需联网，之后全走缓存）
npm run encode:cards         # 只跑编码步骤（等价于 fetch 的后半段）

# ③ 启动
npm start                    # 生产：node --experimental-strip-types server/index.ts
npm run dev                  # 开发：同上 + --watch（改 server/** 自动重启）

# ④ 健康检查
curl -s http://127.0.0.1:3901/api/health
```

启动后 banner 会打印所有入口 URL。数据默认落在 `<项目>/data/guanwei.db`（首次启动自动建表）。

---

## 2. 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `GUANWEI_DATA_DIR` | `<项目>/data` | **SQLite 数据目录**。由 `server/bootstrap.mjs` 用 `||=` 自动注入（在任何 guanwei 模块求值前），所以裸 `npm start` 也落在项目内；显式设置时以你的值为准。不设且没走本服务入口时，vendor 的 `pickDataDir()` 会回退到 `~/.guanwei/data`（数据跑到项目外）。 |
| `PORT` | `3901` | HTTP 端口（bootstrap 同样 `||=` 注入）。 |
| `HOST` | `0.0.0.0` | **默认绑所有网卡（局域网部署）**，局域网内其他设备用 `http://<本机IP>:3901/` 直接访问。只在本机使用时可设 `HOST=127.0.0.1` 收紧。 |
| `GUANWEI_ALLOWED_ORIGINS` | （空） | 逗号分隔的跨域来源白名单。为空时**只放行同源/本机源**（`http://localhost:*`、`http://127.0.0.1:*`）。 |
| `AI_PROVIDER` | 自动探测 | **选哪家 LLM**：`mimo` / `minimax` / `deepseek` / `compat`。不设时按 Key 前缀自动认（`sk-cp-` → MiniMax），否则取第一个配了 Key 的厂商。 |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | （未配置） | **通用覆盖**：对当前生效的厂商一律适用，优先级低于厂商专属变量。 |
| `AI_TIMEOUT_MS` / `AI_MAX_TOKENS` | `120000` / `2048` | 单次调用超时 / 输出 token 上限。 |
| `MIMO_API_KEY` | （未配置） | **MiMo（小米）API Key**（`sk-` 按量付费 / `tp-`·`ttp-` Token Plan）。配置后深度面板出现「AI 深度解读」按钮，由服务端调用 MiMo 生成解读全文；未配置时按钮返回 503 并提示走「复制提示词」。**只放服务端，永不下发浏览器**。 |
| `MIMO_BASE_URL` | 按 Key 前缀自动 | `sk-`→`https://api.xiaomimimo.com/v1`，`tp-`/`ttp-`→`https://token-plan-cn.xiaomimimo.com/v1`；也可显式覆盖。 |
| `MIMO_MODEL` | `mimo-v2.6-pro` | 模型名；省钱可用 `mimo-v2.6-flash`。 |
| `MIMO_TIMEOUT_MS` / `MIMO_MAX_TOKENS` | `120000` / `2048` | 单次调用超时 / `max_completion_tokens` 上限。 |
| `MINIMAX_API_KEY` | （未配置） | **MiniMax API Key**（`sk-cp-` Coding Plan / `sk-` 按量）。配合 `AI_PROVIDER=minimax`。 |
| `MINIMAX_BASE_URL` | `https://api.minimaxi.com/v1` | MiniMax 端点；海外站改 `https://api.minimax.io/v1`。 |
| `MINIMAX_MODEL` | `MiniMax-M3` | 模型名；也可 `MiniMax-M2.7` / `MiniMax-M3.1-Flash-Preview`。 |
| `MINIMAX_THINKING` | `disabled` | MiniMax 思考开关（`disabled`/`enabled`）。占卜解读不需要长推理，默认关掉更快更省。 |
| `DEEPSEEK_API_KEY` | （未配置） | **DeepSeek API Key**。配合 `AI_PROVIDER=deepseek`。 |
| `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` | `https://api.deepseek.com/v1` / `deepseek-chat` | DeepSeek 端点 / 模型。 |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | （未配置） | **任意 OpenAI 兼容厂商**（配合 `AI_PROVIDER=compat`）：不用改代码就能接新厂商。 |
| `AI_EXTRA_PARAMS` / `LLM_EXTRA_PARAMS` | （未配置） | 追加到请求体的厂商专属参数（JSON）。例：`{"thinking":{"type":"disabled"}}`。 |
| `DIVINATION_AUTH` | （空=不认证） | 对外分享用的 **HTTP Basic 认证口令**，格式 `用户名:密码`。设置后整站（页面 + API）都需要口令，浏览器会弹登录框。默认关，局域网自用不必设。 |
| `DIVINATION_RATE_LIMIT` | `120` | `/api/*` **每 IP 每分钟**请求上限（内存滑动窗口，`0`=关闭）。分享出去时防扫描器打满。 |
| `DIVINATION_AI_LIMIT` | `6` | `/api/ai-interpret` 每 IP 每分钟上限（默认更严格，防 AI 额度被烧）。 |
| `DIVINATION_ADMIN_TOKEN` | （空=关闭） | **记录管理口令**。设置后 `/admin.html` 与 `/api/admin/*` 可用；不设时这组接口返回 503 `ADMIN_NOT_CONFIGURED`，记录仍会正常写入、只是不开放查看。 |

```bash
# 示例：换端口 + 仅本机监听 + 跨域白名单
PORT=8080 HOST=127.0.0.1 GUANWEI_ALLOWED_ORIGINS=https://div.example.com npm start
```

机密（如 `MIMO_API_KEY` / `MINIMAX_API_KEY`）推荐写进**项目根 `.env`**（已在 `.gitignore`，`KEY=VALUE` 逐行，`#` 注释；行内注释需用空白隔开，如 `KEY=value   # 说明`）：`server/bootstrap.mjs` 启动时自动读取，只补缺、不覆盖 shell 里已有的环境变量：

```bash
# divination-station/.env
AI_PROVIDER=mimo
MIMO_API_KEY=tp-xxxxxxxx
# MIMO_MODEL=mimo-v2.6-flash

# 换成 MiniMax Coding Plan：改 AI_PROVIDER 即可（Key 前缀 sk-cp- 也会被自动认出）
# AI_PROVIDER=minimax
# MINIMAX_API_KEY=sk-cp-xxxxxxxx
# MINIMAX_MODEL=MiniMax-M3.1-Flash-Preview
```

> 环境变量的完整诊断口径见 [`docs/env.md`](docs/env.md)；本服务不依赖 shell 里预设 `GUANWEI_DATA_DIR`。

### 对外临时分享（无域名 / 无账号）

把站点临时给朋友玩，只需要「一个 https 链接 + 一个口令」，不需要域名、不需要注册。要点：**先加口令**，再开隧道——否则随机扫描器会打满接口，`/api/ai-interpret` 还会烧掉 AI 额度。

```bash
# 1) 起一个带口令、带限流的实例（端口自选，避免和自用实例冲突）
PORT=3903 DIVINATION_AUTH="friend:换成一个随机密码" DIVINATION_RATE_LIMIT=90 DIVINATION_AI_LIMIT=2 npm start

# 2) 另一终端开隧道（本项目不自带隧道器，按需选一种）
#    A. Cloudflare 快隧道（免费、免账号、无域名；注意部分地区/共享出口会被 429 限流）
cloudflared tunnel --url http://127.0.0.1:3903 --edge-ip-version 4
#    B. ssh 反代（免账号，跑在 443 上；免费版单连接约 60 分钟后需重连）
ssh -p 443 -R 0:127.0.0.1:3903 a.pinggy.io
```

隧道器打印出的 `https://…` 就是发给朋友的链接；浏览器打开会弹 Basic 认证框，填入 `DIVINATION_AUTH` 里的用户名/密码即可。停掉分享 = `Ctrl-C` 隧道进程 + 关掉该实例，公网入口即刻消失（本服务本身不监听公网）。

> 安全提醒：快隧道 = 公网可访问。口令与限流只挡随机扫描，挡不住知道你口令的人；`DIVINATION_AI_LIMIT` 建议在分享期调小。隧道 URL 随进程变化，重启即失效。

---

## 3. 入口 URL 与双性能模式

| 页面 | URL |
|---|---|
| 首页（九术导航） | `http://localhost:3901/` |
| **塔罗** | `http://localhost:3901/tarot.html` |
| **六爻** | `http://localhost:3901/liuyao.html` |
| **子平八字** | `http://localhost:3901/bazi.html` |
| **紫微斗数** | `http://localhost:3901/ziwei.html` |
| **奇门遁甲** | `http://localhost:3901/qimen.html` |
| **大六壬** | `http://localhost:3901/liuren.html` |
| **梅花易数** | `http://localhost:3901/meihua.html` |
| **小六壬** | `http://localhost:3901/xiaoliuren.html` |
| **西方星盘** | `http://localhost:3901/astrology.html` |
| 记录管理（可选） | `http://localhost:3901/admin.html`（需 `DIVINATION_ADMIN_TOKEN`） |

（`/bazi`、`/ziwei`、`/qimen`、`/liuren`、`/meihua`、`/xiaoliuren`、`/astrology` 这类无后缀路径也能访问：静态中间件开了 `extensions:['html']` 补全。）

> **局域网访问**：服务默认监听 `0.0.0.0:3901`，把上表 URL 里的 `localhost` 换成本机局域网 IP（如 `http://10.28.136.2:3901/`）即可在手机/其他电脑上打开；确保防火墙放行 `3901/tcp`（Fedora 默认区已放行 1025-65535/tcp）。前端与 API 同源同端口，局域网访问无需额外 CORS 配置。

**双性能模式**由前端 `html[data-perf="low"|"high"]` 切换并存 `localStorage`，**后端同一套接口、同一套响应**：

- `low`（首访默认）：牌图只请求 `/img/cards/480/<slug>.webp`，深度层（AI 全文/逐爻证据）不入 DOM，动画近似全关。
- `high`：`<picture>` 走 AVIF(1200) → WebP(srcset 480w/1200w) → `img` 回退，翻牌/错峰入场动画开启。
- 图片字段由 `GET /api/tarot/cards` 直接给出三档 URL，前端按模式挑字段即可，无需自己拼路径。

---

## 4. API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查：`dataDir` / `dataDirOk` / `hooks` / `ai`（当前 AI 厂商与模型，不含 Key） |
| GET | `/api` | 端点清单 |
| GET | `/api/tarot/cards` | 78 张牌（**含 slug + 三档图片字段**） |
| GET | `/api/tarot/spreads` | 17 个内置牌阵 |
| POST | `/api/tarot/draw` | 服务端抽牌（`{spreadId}` 或 `{customSpread}`，1–20 位）；**只计算不落库**（兼容旧前端） |
| POST | `/api/tarot/session` | 服务端抽牌 **+ 记录入库**（`{spreadId,question?,category?}`，返回 `{id,cards,spread}`；页面实际走这个） |
| POST | `/api/tarot/interpret` | 服务端生成解读（`{cards,spread,question,category?,id?}`，question ≤300 字；带 `id` 时把解读全文补挂到记录） |
| POST | `/api/liuyao` | 服务端按当前时间 + 随机起卦，**并写入 `data/guanwei.db`（含来源 IP/UA）** |
| GET | `/api/chart/arts` | 七术能力清单：`label` / `kind`（mingpan\|zhanwen）/ `group` / `needs` / `schema` |
| POST | `/api/chart` | **七术统一起盘**（`bazi`/`ziwei`/`astrology`/`qimen`/`liuren`/`meihua`/`xiaoliuren`）：校验并归一化输入 → 服务端排盘 → 落库 → 返回 `{id,brief,duanyu,resultRaw}` |
| GET/POST | `/api/prompt` | 生成可直接粘贴给 LLM 的中文提示词（盘面事实 + 古籍引证 + 用神候选） |
| POST | `/api/ai-interpret` | **AI 深度解读**：用与 `/api/prompt` 相同的提示词调用 LLM 生成解读全文（需配置任一厂商的 Key；未配置返回 503；可带 `provider`/`model` 临时换模型） |
| GET | `/api/ai-models` | 可选模型清单（各厂商 + 该厂商的模型；Ollama 为本地实时 `/models`），供页面上手选 |
| GET | `/api/admin/records` | 记录列表（`?limit&offset&artId=all\|tarot\|liuyao\|bazi\|ziwei\|qimen\|liuren\|meihua\|xiaoliuren\|astrology`），需 `x-admin-token` 或 `?token=` |
| GET | `/api/admin/records/:id` | 单条完整记录（盘面 / 盘面事实 / 古籍引证 / AI 解读 / 来源） |
| POST | `/api/admin/records/:id/interpret` | 用存档盘面补生成 AI 解读并写回该记录（需配置任一厂商的 Key） |
| GET | `/api/admin/export.csv` | 导出 CSV（UTF-8 BOM，Excel 直接打开） |

统一错误格式：`{"error":"<CODE>","message":"<中文说明>"}`（`BAD_SPREAD` / `BAD_CARDS` / `BAD_QUESTION` / `BAD_ART` / `BAD_JSON` / `NOT_FOUND`…）；参数上限：牌数 1–20、问题 ≤300 字。

### 4.1 `GET /api/tarot/cards`

```bash
curl -s http://127.0.0.1:3901/api/tarot/cards
```

响应（`cards` 共 78 张，字段 = vendor `TarotCard` 原样 + 4 个新增）：

```jsonc
{
  "cards": [
    {
      "id": 0,
      "name": "愚者",
      "nameEn": "The Fool",
      "arcana": "major",
      "keywords": ["新的开始", "冒险", "纯真", "信任", "无限可能"],
      "meanings": { "upright": "全新的开始，踏上未知的旅程。…", "reversed": "鲁莽行事，缺乏计划，或因为恐惧而停滞不前。…" },
      "deepMeaning": { "coreTheme": "灵魂之旅的起点，无限潜能的绽放", "lifeAreas": { "love": "…", "career": "…", "wealth": "…", "health": "…", "growth": "…" }, "…": "…" },
      "image": "悬崖边的旅人，背负小包，手持白玫瑰，脚边有小狗",
      // ↓ 本服务新增（每请求探测文件是否存在，不存在则给空串）
      "slug": "the-fool",
      "imgLow": "/img/cards/480/the-fool.webp",
      "imgHiWebP": "/img/cards/1200/the-fool.webp",
      "imgHiAvif": "/img/cards/1200/the-fool.avif"
    }
    // …共 78 张，slug 无重复
  ]
}
```

**slug 规则**（与 `scripts/fetch-cards.mjs`、`docs/env.md` 完全一致）：`nameEn` → 小写 → 非字母数字压成 `-`。
例：`The Fool` → `the-fool`，`Ace of Pentacles` → `ace-of-pentacles`，`10 of Cups` → `10-of-cups`。

实测（图片已生成时）：`nonempty imgLow: 78 / 78`；图片尚未生成时三个 `img*` 字段为 `""`，前端回退到 `imgLow`。

### 4.2 `GET /api/tarot/spreads`

```bash
curl -s http://127.0.0.1:3901/api/tarot/spreads
```

```jsonc
{
  "spreads": [
    {
      "id": "one-card",
      "name": "一张牌",
      "description": "抽取单张牌，快速获得当下指引。适合日常的\"我该怎么做\"",
      "category": "basic",
      "scene": ["general", "spiritual"],
      "positions": [ { "id": 0, "name": "指引", "description": "此刻你需要知道的信息", "x": 50, "y": 50 } ]
    }
    // …共 17 个（two-options / three-card / mind-body-soul / … / yearly）
  ]
}
```

### 4.3 `POST /api/tarot/draw`

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"spreadId":"three-card"}' http://127.0.0.1:3901/api/tarot/draw
```

> 注意入参是 **`spreadId`**（不是 `spread`）；自定义牌阵用 `{"customSpread":{…,"positions":[…1–20 项]}}`。

```json
{
  "cards": [
    { "cardId": 65, "isReversed": false, "positionId": 0 },
    { "cardId": 70, "isReversed": false, "positionId": 1 },
    { "cardId": 68, "isReversed": true,  "positionId": 2 }
  ],
  "spread": {
    "id": "three-card", "name": "过去-现在-未来", "category": "basic",
    "scene": ["general", "career", "love", "wealth"],
    "positions": [
      { "id": 0, "name": "过去", "description": "已经过去的根源与铺垫", "x": 20, "y": 50 },
      { "id": 1, "name": "现在", "description": "当下的核心状况",       "x": 50, "y": 50 },
      { "id": 2, "name": "未来", "description": "若不改变的自然趋势",   "x": 80, "y": 50 }
    ]
  }
}
```

**正逆位由服务端给出（约 30% 逆位率），前端零计算**；`cards` 只有 `cardId`，牌名/图片用 `GET /api/tarot/cards` 按 `cardId` 关联。

### 4.4 `POST /api/tarot/interpret`

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"spreadId":"three-card"}' http://127.0.0.1:3901/api/tarot/draw > /tmp/d.json
curl -s -X POST -H 'Content-Type: application/json' \
  -d "$(node -e 'const d=require("/tmp/d.json");console.log(JSON.stringify({cards:d.cards,spread:d.spread,question:"我下个月适合换工作吗"}))')" \
  http://127.0.0.1:3901/api/tarot/interpret
```

实测响应（`fullText` 5320 字，9 段）：

```jsonc
{
  "fullText": "你带着一份好奇来探索，这本身就是最好的开始。\n\n你问的是「我下个月适合换工作吗」。…",
  "semantic": { "…": "语义分析结果" },
  "sections": [
    { "type": "opening",    "title": "开场引言",     "content": "…" },
    { "type": "overview",   "title": "综合指引",     "content": "…" },
    { "type": "card",       "title": "过去 · 星币二（正位）", "content": "…" },
    { "type": "card",       "title": "现在 · 星币七（正位）", "content": "…" },
    { "type": "card",       "title": "未来 · 星币五（逆位）", "content": "…" },
    { "type": "esoteric",   "title": "神秘学视角",   "content": "…" },
    { "type": "life-action","title": "生活行动指南", "content": "…" },
    { "type": "warning",    "title": "需要留意的地方","content": "…" },
    { "type": "summary",    "title": "总结",         "content": "…" }
  ]
}
```

### 4.5 `POST /api/liuyao`

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"question":"我今年下半年的财运如何"}' http://127.0.0.1:3901/api/liuyao
```

每次调用 = 服务端**当前时间**起卦 + 随机摇卦 + **写库**（`data/guanwei.db` 的 `divinations` 表），并返回 `chartBrief` 生成的中文盘面摘要。实测样例（卦象每次不同）：

```jsonc
{
  "id": "d_1794393511351_3d869a2d-246c-464a-b122-1b40c31f79ae",
  "question": "我今年下半年的财运如何",
  "brief": "【卦象】水泽节（节制之象，节以制度），2爻发动（五爻、上爻）变山泽损。\n【纳甲装卦】坎宫，己丑日（亥月建），世爻在第1爻（妻财），应爻第4爻。\n【六亲六神】初爻丁巳妻财（腾蛇）世、二爻丁卯子孙（白虎）、三爻丁丑官鬼（玄武）、四爻戊申父母（青龙）、五爻戊戌官鬼（朱雀）、上爻戊子兄弟（勾陈）。\n【月破】巳；【旬空】午、未。",
  "resultRaw": {
    "yao": [1, 1, 0, 0, 1, 0],
    "names": [
      { "v": 1, "nm": "少阳", "backs": 1 }, { "v": 1, "nm": "少阳", "backs": 1 },
      { "v": 0, "nm": "少阴", "backs": 2 }, { "v": 0, "nm": "少阴", "backs": 2 },
      { "v": 1, "nm": "老阳", "backs": 3 }, { "v": 0, "nm": "老阴", "backs": 0 }
    ],
    "benGua":  { "up": 6, "down": 2, "name": "水泽节", "ci": "亨。苦节不可贞。", "xiang": "节制之象，节以制度" },
    "bianGua": { "up": 7, "down": 2, "name": "山泽损", "ci": "有孚，元吉，无咎，可贞，利有攸往。", "xiang": "减损之象，损下益上" },
    "dongYao": [5, 6],
    "najia": {
      "gong": "坎",
      "lines": [
        { "gz": "丁巳", "ganWx": "火", "zhiWx": "火", "liuqin": "妻财", "shen": "腾蛇", "isShi": true,  "isYing": false, "kong": false },
        { "gz": "丁卯", "ganWx": "火", "zhiWx": "木", "liuqin": "子孙", "shen": "白虎", "isShi": false, "isYing": false, "kong": false },
        { "gz": "丁丑", "ganWx": "火", "zhiWx": "土", "liuqin": "官鬼", "shen": "玄武", "isShi": false, "isYing": false, "kong": false },
        { "gz": "戊申", "ganWx": "土", "zhiWx": "金", "liuqin": "父母", "shen": "青龙", "isShi": false, "isYing": true,  "kong": false },
        { "gz": "戊戌", "ganWx": "土", "zhiWx": "土", "liuqin": "官鬼", "shen": "朱雀", "isShi": false, "isYing": false, "kong": false },
        { "gz": "戊子", "ganWx": "土", "zhiWx": "水", "liuqin": "兄弟", "shen": "勾陈", "isShi": false, "isYing": false, "kong": false }
      ],
      "shiPos": 1, "yingPos": 4,
      "dayGZ": "己丑", "monthZhi": "亥",
      "yuePo": ["巳"], "xunKong": ["午", "未"],
      "shiLiQin": "妻财"
    }
  }
}
```

> `question` 可省略（≤300 字）；省略时仍会起卦入库，只是 `question` 为 `null`。

### 4.6 `GET|POST /api/prompt`（AI 解读提示词）

入参（GET 用 query、POST 用 JSON）：`artId`（九术之一，默认 `liuyao`）、`question`、`category`（可空：综合/感情/事业/财运/学业/健康/人际…）、`spread`（塔罗牌阵 id）、`resultRaw`（盘面：**七术必填**，缺省返回 400 `NEED_RESULT`；六爻缺省则服务端现起一卦）、`cards`+`spread`（塔罗已抽的盘，**缺省则服务端现抽**）。七术会按 `agentOf(artId)` 注入对应 persona（子平命理师/紫微斗数专家/奇门遁甲师/大六壬课师/梅花易数家/掌诀占时师/古典占星师），并保留「必须逐字引用下列排盘事实」硬约束；八字/紫微时辰未知时注入「时辰未知 · 最高约束」。

组成：`chartBrief` 的盘面事实（唯一可信数据源） + vendor `duanyuPromptBlock` 古籍引证 + 自写六爻用神候选推导。

**六爻示例（GET）：**

```bash
curl -s -G 'http://127.0.0.1:3901/api/prompt' \
  --data-urlencode 'artId=liuyao' \
  --data-urlencode 'question=我今年下半年的财运如何' \
  --data-urlencode 'category=财运'
```

响应结构（节选，`prompt` 为可直接粘贴的全文）：

```jsonc
{
  "artId": "liuyao",
  "question": "我今年下半年的财运如何",
  "category": "财运",
  "brief": "【卦象】山火贲（文饰之象，饰外修内），4爻发动（初爻、三爻、四爻、五爻）变天地否。\n…",
  "yongshen": {
    "primary": { "liuqin": "妻财", "reason": "按问题分类「财运」取用神", "matched": [],
      "lines": [ { "pos": 3, "posName": "三爻", "gz": "己亥", "liuqin": "妻财", "shen": "玄武",
                   "isShi": false, "isYing": false, "kong": false, "dong": true }, "…" ] },
    "candidates": [ "…命中关键词/分类的其余六亲…" ],
    "shi":  { "pos": 1, "posName": "初爻", "gz": "己卯", "liuqin": "官鬼", "shen": "腾蛇",
              "isShi": true, "isYing": false, "kong": false, "dong": true },
    "matchedAny": true,
    "text": "【用神候选（按问题关键词与分类推导，仅用于聚焦解读方向，不替代上方排盘事实）】\n· 首选妻财——按问题分类「财运」取用神：三爻 己亥妻财（玄武）［动爻］；五爻 丙子妻财（朱雀）［动爻］。\n· 备选妻财——问财（财运/收入/生意/投资）（命中关键词：财运）：…"
  },
  "duanyu": "【古籍引证（断语库 · 已校核）】…\n· 用神者，卦之体也。凡占必先寻用神，用神不现，须寻伏神。（《zengshan-buyi》用神章）…\n· 凡占必以用神为主，有根有气则吉，无根无气则凶。（《bushe-zhengzong》启蒙节要）…",
  "resultRaw": { "yao": [ … ], "names": [ … ], "benGua": { … }, "bianGua": { … }, "dongYao": [ … ], "najia": { … } },
  "prompt": "（全文见下）"
}
```

`prompt` 全文（实测）：

```text
你是一位资深的六爻（周易纳甲筮法）解卦师，为人占断所问之事。请严格按以下材料作答。

【必须逐字引用下列排盘事实，不得推算或改写】
1. 下方【排盘事实】是本次解读唯一可信的数据源：卦名、世应、动爻、纳甲干支、六亲、六神、旬空月破、牌名、正逆位、牌阵位置等，一律逐字引用；禁止自行重排、补算、脑补或改动任何一个字。
2. 事实之外的信息（如未列出的爻、未抽到的牌、宫位推演）一律不得编造；事实不足以支撑结论时，明确写「盘面未显示」。
3. 需要引用古籍断语时，保持原文并标注出处《书·篇》，不得改写原文。
4. 语言：简体中文，语气克制、具体、可执行；不恐吓、不承诺绝对结果、不作医疗/法律/财务结论。

【所问之事】我今年下半年的财运如何
【问题分类】财运

【排盘事实】
【卦象】山火贲（文饰之象，饰外修内），4爻发动（初爻、三爻、四爻、五爻）变天地否。
【纳甲装卦】艮宫，己丑日（亥月建），世爻在第1爻（官鬼），应爻第4爻。
【六亲六神】初爻己卯官鬼（腾蛇）世、二爻己丑兄弟（白虎）、三爻己亥妻财（玄武）、四爻丙戌兄弟（青龙）应、五爻丙子妻财（朱雀）、上爻丙寅官鬼（勾陈）。
【月破】巳；【旬空】午、未。

【用神候选（按问题关键词与分类推导，仅用于聚焦解读方向，不替代上方排盘事实）】
· 首选妻财——按问题分类「财运」取用神：三爻 己亥妻财（玄武）［动爻］；五爻 丙子妻财（朱雀）［动爻］。
· 世爻参考：初爻 己卯官鬼（腾蛇）［世、动爻］。
· 若上述候选与【排盘事实】冲突，一律以【排盘事实】为准；不得自行增删爻位或改写纳甲六亲。

【古籍引证（断语库 · 已校核）】以下为与本盘/本问相关的古籍断语，可在行文自然处引用（须标注出处「《书·篇》」，且不得改写原文）：
· 用神者，卦之体也。凡占必先寻用神，用神不现，须寻伏神。（《zengshan-buyi》用神章）——断语：六爻断卦第一步取用神：按所问之事定六亲取用；用神不上卦则寻伏神。
· 凡占必以用神为主，有根有气则吉，无根无气则凶。（《bushe-zhengzong》启蒙节要）——断语：用神有根（得月日生扶）有气（不遭刑冲克害）为吉，反之则凶。

【输出要求】
1. 开头 3 句内给出总体结论（吉/平/不利 + 关键理由），理由必须落到具体爻位、卦名或六亲六神。
2. 分段解读「现状 → 发展走向 → 应对建议」，每段末尾用括号标注依据（如：四爻己酉妻财动、世爻旬空）。
3. 时机提示：结合月建、旬空、动爻说明何时有望、何时宜守。
4. 结尾给出 3 条可执行建议 + 1 句提醒。
5. 篇幅 600-900 字，结构化分段，不要复述整张盘。

【免责声明】本内容仅供娱乐与自我参考，不构成医疗、法律、财务建议。
```

**塔罗示例（POST，携带页面上已抽好的牌，保证提示词与展示一致）：**

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"artId":"tarot","question":"我和他最近的感情走向如何","cards":[…draw 的 cards…],"spread":{…draw 的 spread…}}' \
  http://127.0.0.1:3901/api/prompt
```

```jsonc
{
  "artId": "tarot", "question": "我和他最近的感情走向如何", "category": null,
  "brief": "【牌阵】共3张。\n第1张：星币二（正位），位过去，正位义：…；逆位义：…。\n第2张：星币七（正位），位现在，…\n第3张：星币五（逆位），位未来，…",
  "yongshen": null,
  "duanyu": "",
  "cards": [ { "cardId": 36, "name": "星币二", "nameEn": "Two of Pentacles", "slug": "two-of-pentacles",
               "reversed": false, "position": "过去", "positionId": 0,
               "keywords": [ … ], "up": "…", "rev": "…",
               "imgLow": "/img/cards/480/two-of-pentacles.webp",
               "imgHiWebP": "/img/cards/1200/two-of-pentacles.webp",
               "imgHiAvif": "/img/cards/1200/two-of-pentacles.avif" }, "…" ],
  "spread": { "id": "three-card", "name": "过去-现在-未来", "positions": [ … ] },
  "prompt": "（全文见下）"
}
```

`prompt` 全文（实测，塔罗版同样含逐字引用硬约束）：

```text
你是一位资深的塔罗占卜师，请依据下方牌阵为提问者解读。

【必须逐字引用下列排盘事实，不得推算或改写】
1. 下方【排盘事实】是本次解读唯一可信的数据源：卦名、世应、动爻、纳甲干支、六亲、六神、旬空月破、牌名、正逆位、牌阵位置等，一律逐字引用；禁止自行重排、补算、脑补或改动任何一个字。
2. 事实之外的信息（如未列出的爻、未抽到的牌、宫位推演）一律不得编造；事实不足以支撑结论时，明确写「盘面未显示」。
3. 需要引用古籍断语时，保持原文并标注出处《书·篇》，不得改写原文。
4. 语言：简体中文，语气克制、具体、可执行；不恐吓、不承诺绝对结果、不作医疗/法律/财务结论。

【所问之事】我和他最近的感情走向如何

【排盘事实】
【牌阵】共3张。
第1张：星币二（正位），位过去，正位义：在物质世界中寻找平衡。…；逆位义：失衡，过度劳累，或财务混乱。…
第2张：星币七（正位），位现在，正位义：耐心等待收获的时刻。…；逆位义：缺乏耐心，收获不及预期，或需要重新规划。…
第3张：星币五（逆位），位未来，正位义：物质上的困难与匮乏。…；逆位义：走出困境，恢复，或找到帮助。…

【输出要求】
1. 开头 3 句内给出总体结论，必须点名抽到的牌与正逆位。
2. 按牌阵位置逐张解读（正位/逆位 + 该位含义 + 与所问之事的关联），再给出整体走向。
3. 结尾给出 3 条可执行建议 + 1 句提醒。
4. 篇幅 600-900 字，结构化分段，不要复述整副牌义。

【免责声明】本内容仅供娱乐与自我参考，不构成医疗、法律、财务建议。
```

> `duanyu` 在塔罗下恒为 `""`：vendor 断语库目前只有 2 条 `art:'liuyao'` 且 `status:'reviewed'` 的条目，没有塔罗条目（上游现状，本服务不改 vendor）。

**用神候选规则**（`server/services/yongshen.ts`，关键词规则与任务口径一致）：

| 触发条件 | 候选用神 |
|---|---|
| 问财（财运/收入/生意/投资…） | 妻财爻 |
| 问事业/官司/工作（职位/升职/诉讼…） | 官鬼爻 |
| 问父母/文书/房子（合同/学业/考试…） | 父母爻 |
| 问子女/宠物/平安（健康/怀孕…） | 子孙爻 |
| 问兄弟/朋友/合伙（合作/同事…） | 兄弟爻 |
| 问题分类 `category`（综合/感情→不指定） | 财运→妻财、事业/官职→官鬼、学业/文书/合同→父母、子女/创作→子孙、健康→官鬼（世爻另标）、人际/竞争→兄弟 |
| 无匹配 | **以世爻为候选** |

每个候选都给出**爻位（初/二/…/上）+ 纳甲干支 + 六亲 + 六神 + 世/应/动/旬空**；用神不上卦时提示「须寻伏神，勿自行补造」，不自行编造爻。

### 4.6.1 `POST /api/chart`（七术统一起盘）

```bash
# 八字（公历生日 + 时辰序号 0=子 … 11=亥，-1=时辰未知）
curl -s -X POST http://127.0.0.1:3901/api/chart -H 'Content-Type: application/json' \
  -d '{"artId":"bazi","question":"今年事业如何","category":"事业","inputs":{"y":1990,"m":6,"d":15,"hourIndex":6,"gender":"男"}}'

# 奇门 / 六壬（起局时刻，缺省现在）
curl -s -X POST http://127.0.0.1:3901/api/chart -H 'Content-Type: application/json' \
  -d '{"artId":"qimen","question":"明日面试是否顺利","category":"事业","inputs":{"datetime":"2026-11-13T10:30:00+08:00"}}'

# 梅花 / 小六壬（报数起卦）
curl -s -X POST http://127.0.0.1:3901/api/chart -H 'Content-Type: application/json' \
  -d '{"artId":"meihua","question":"合作能否谈成","category":"事业","inputs":{"mode":"number","n1":7,"n2":13,"n3":5}}'
```

`GET /api/chart/arts` 返回七术能力清单（`label`/`kind`/`group`/`needs`/`schema`，`schema` 即入参说明）。响应：`{id,artId,kind,question,category,params,resultRaw,brief,yongshen,duanyu}`；`kind` 为 `mingpan`（八字/紫微/占星）或 `zhanwen`（奇门/六壬/梅花/小六壬）。输入归一化与校验见 `server/services/chartInputs.ts`：年份 1900–2100、日期真实存在（2/31 会 400）、`hourIndex` 0–11（八字/紫微允许 -1）、报数 1–999、经度 ±180、纬度 ±90、问题 ≤300 字。错误码：`BAD_ART` / `BAD_INPUTS`（含 `field`）/ `BAD_QUESTION` / `INTERNAL`（不泄漏堆栈）。

### 4.7 `POST /api/ai-interpret`（AI 深度解读 · 多厂商 LLM）

配置任一厂商的 API Key 后，把 `/api/prompt` 的提示词交给 LLM（OpenAI 兼容协议）生成解读全文。
**入参与 `POST /api/prompt` 完全一致**，提示词由同一构建函数生成——AI 深度解读与「复制提示词」使用同一份盘面事实与硬约束（【必须逐字引用下列排盘事实，不得推算或改写】）。

**厂商可切换**（只改配置，不改代码）：

| `AI_PROVIDER` | 厂商 | Key 变量 | 默认端点 | 默认模型 |
|---|---|---|---|---|
| `mimo` | MiMo（小米） | `MIMO_API_KEY` | 按 Key 前缀自动（`sk-`→按量付费 / `tp-`·`ttp-`→Token Plan） | `mimo-v2.6-pro` |
| `minimax` | MiniMax | `MINIMAX_API_KEY` | `https://api.minimaxi.com/v1`（海外 `api.minimax.io`） | `MiniMax-M3` |
| `deepseek` | DeepSeek | `DEEPSEEK_API_KEY` | `https://api.deepseek.com/v1` | `deepseek-chat` |
| `compat` | 任意 OpenAI 兼容 | `LLM_API_KEY` | 必填 `LLM_BASE_URL` | 必填 `LLM_MODEL` |
| `ollama` | **本地 Ollama**（8B 小模型） | 不用 Key | `http://127.0.0.1:11434/v1` | `deepseek-r1:8b` |

选择规则：`AI_PROVIDER` 显式指定 → Key 前缀嗅探（`sk-cp-` → MiniMax Coding Plan）→ 按上表顺序取第一个配了 Key 的厂商。
每家还可用 `<前缀>_BASE_URL` / `<前缀>_MODEL` / `<前缀>_TIMEOUT_MS` / `<前缀>_MAX_TOKENS` / `<前缀>_THINKING` / `<前缀>_TEMPERATURE` / `<前缀>_EXTRA_PARAMS` 覆盖；`AI_BASE_URL` / `AI_MODEL` / `AI_TEMPERATURE` / `AI_EXTRA_PARAMS` 等通用变量对当前生效的厂商一律适用（优先级低于厂商专属项）。
新增厂商：往 `server/services/llm.ts` 的 `PROVIDERS` 加一条，或直接用 `compat` 接任意 OpenAI 兼容服务。

### 页面上手选模型

深度面板（塔罗 / 六爻）与管理页补解读处都有一个「模型」下拉框，选项来自 `GET /api/ai-models`：

- 只列**已配置 Key 的厂商**（没配的不出现，避免选了必然报错）；Ollama 那一组是本机**实时** `/models` 拉出来的已装模型。
- 默认项是「自动（当前：<厂商> <模型>）」= 沿用服务端 `.env` 的配置；选了具体模型则该次请求临时用所选模型（只影响这一条，不改全局配置）。
- **浏览器只能选「厂商 + 模型名」**，base URL 与 API Key 始终只在服务端 —— 换模型不会把 Key 泄露到前端。
- 请求体里带 `provider` / `model` 即可复现：`POST /api/ai-interpret {"artId":"liuyao","provider":"minimax","model":"MiniMax-M2.7"}`。
- 模型名会做白名单校验（只允许 `A-Za-z0-9._:-/`），非法名返回 400 `AI_BAD_MODEL`；选到没配 Key 的厂商返回 503 `AI_NOT_CONFIGURED`（附「检测到 XX_API_KEY 已配置」的提示）。

### 本地小模型（Ollama 8B）

`AI_PROVIDER=ollama` 即可用本机 Ollama 的 OpenAI 兼容端点跑解读：不花钱、不出网、无需 Key（本机端点自动免鉴权）。

```bash
# .env
AI_PROVIDER=ollama
OLLAMA_MODEL=deepseek-r1:8b
OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
OLLAMA_MAX_TOKENS=2048        # Ollama 默认上下文 4096，提示词已占 ~1K
OLLAMA_TIMEOUT_MS=300000      # 本地出字慢，超时给宽
OLLAMA_TEMPERATURE=0.4        # 小模型温度调低，少编事实
```

注意事项：

1. **别用 14B**：`qwen-coder-14b` / `ds-r1-14b` 各占 12GB，本机显存装不下，加载即 OOM（表现为接口 500 / 机器卡死）。8B（`deepseek-r1:8b`，6GB）可正常驻留显存。
2. **上下文 4096**：提示词约 1K token，输出上限建议 ≤2048，否则生成到尾部会撞上下文；要更长就 `OLLAMA_CONTEXT_LENGTH=8192 ollama serve` 重启服务。
3. **速度**：8B 在本机约 10 token/s，一次解读 1–2 分钟（前端提示的「约 10-30 秒」要按本地模型放宽预期）；`OLLAMA_TIMEOUT_MS` 默认 300s。
4. **质量**：8B 的解读比 MiniMax-M3 短（实测 1179 字 vs 1563 字），「逐字引用排盘事实」偶尔会漂；温度已默认降到 0.4 以减少编造，严肃场景仍建议用云端大模型。

```bash
curl -s http://127.0.0.1:3901/api/ai-interpret \
  -H 'Content-Type: application/json' \
  -d '{"artId":"liuyao","question":"我今年下半年的财运如何","category":"财运"}'
```

成功响应：`{"ok":true,"artId":"liuyao","model":"mimo-v2.6-pro","provider":"mimo","text":"<解读全文>","usage":{...},"cached":false}`。
同盘同问的重复请求命中服务端缓存（`cached:true`，FIFO 上限 32 条，避免重复计费）。
错误沿用统一格式：`AI_NOT_CONFIGURED`（503，未配置 Key）、`AI_AUTH_ERROR`（Key 无效）、`AI_RATE_LIMITED`（429）、`AI_TIMEOUT`（504）、`AI_UPSTREAM_ERROR`/`AI_EMPTY`（502）。
前端（塔罗/六爻深度面板的「AI 深度解读」按钮）在未配置或失败时自动回退为「复制提示词」，功能不缺失。
模型输出为纯文本（服务端会剥掉推理模型塞进正文的 `<think>` 段）。页面点「AI 深度解读」时会带上当前记录 `id`，服务端把全文存进该记录的 `report_json`（塔罗、六爻都存），响应里 `saved:true` 表示已落库——日后在 `/admin.html` 能回看「问了什么 + AI 说了什么」。

### 4.8 起占记录与查看（`/admin.html`，可选）

**记录什么**：每次起占都会写进 `data/guanwei.db` 的 `divinations` 表——问题原文、术数、盘面（`result_raw_json`）、时间；塔罗的解读全文另存 `report_json`。访问来源（IP / UA / Referer）存在一对一的 `divinations_access` 表（不改上游表结构）。

- 六爻：`POST /api/liuyao` 直接落库。
- 塔罗：页面改为调 `POST /api/tarot/session`（抽牌即建记录），展开深度时 `POST /api/tarot/interpret` 带 `id` 把解读补挂到同一条记录。

**AI 解读**：页面生成的解读会自动存（见 §4.7）。老记录如果当时没存（六爻早期的 AI 输出、塔罗没展开深度就关掉的），详情页会显示**盘面事实**（由存档盘面实时算出，含卦象/纳甲/六亲六神/月破旬空）与**古籍引证**，并给一个「生成 AI 解读并保存」按钮：用存档盘面重算提示词、调当前配置的 LLM 厂商、结果写回该记录（会消耗额度，约 10–60 秒）。

**怎么看**：设 `DIVINATION_ADMIN_TOKEN=<随机口令>` 后重启，打开 `/admin.html`：

```bash
# divination-station/.env
DIVINATION_ADMIN_TOKEN=换成一串随机字符
```

页面里输入同一口令 → 左侧列表**每页 30 条**（时间 / 术数 / 问题 / 盘面摘要 / 是否已解读，带首页/上下页/末页分页与术数筛选）→ **点行，盘面事实与 AI 解读直接显示在右侧栏**（选中行高亮，换页不清空右侧，「清空详情」回到占位）→ 「导出 CSV」下载全部（UTF-8 BOM，Excel 直接双击）。

接口侧等价（脚本/定时备份用）：

```bash
TOKEN='<你的口令>'
curl -s "http://127.0.0.1:3901/api/admin/records?limit=50" -H "x-admin-token: $TOKEN"
curl -s "http://127.0.0.1:3901/api/admin/records/<id>" -H "x-admin-token: $TOKEN"
curl -sL "http://127.0.0.1:3901/api/admin/export.csv?token=$TOKEN" -o records.csv
```

未设口令时接口返回 `503 ADMIN_NOT_CONFIGURED`（记录照常写入，只是不开放查看）；口令错返回 `401 ADMIN_UNAUTHORIZED`。只读：没有删除/修改接口，避免误删；要清理直接用 `sqlite3 data/guanwei.db` 操作。

> **隐私提示**：问题原文与 IP/UA 都是可识别信息。局域网自用问题不大；一旦把站点分享到公网，等于把朋友问的事和你自己的服务器日志都交到了这台机器上——事先说明、玩完清理，或干脆不设 `DIVINATION_ADMIN_TOKEN`（记录会写但你不看，仍留在库里，需要时就删库文件）。

---

## 5. 数据落点验证（SQLite）

```bash
curl -s http://127.0.0.1:3901/api/health
# {"status":"ok","dataDir":"<项目>/data","dataDirOk":true,"port":3901,"hooks":true,…}

# 起一卦后再查库
curl -s -X POST -H 'Content-Type: application/json' -d '{"question":"测试"}' \
  http://127.0.0.1:3901/api/liuyao > /dev/null
node -e 'const {DatabaseSync}=require("node:sqlite");
  const db=new DatabaseSync("data/guanwei.db",{readOnly:true});
  console.log(db.prepare("select count(*) c from divinations").get());'
# { c: 4 }   ← 数据确实落在项目 data/（不是 ~/.guanwei/data）
```

`data/guanwei.db` 为 WAL 模式（同目录 `guanwei.db-wal` / `-shm`），首次启动自动建表 `users / divinations / ai_fail_logs / meta`。

---

## 6. 牌面图片重建命令

```bash
npm run fetch:cards                 # 全量：下载原图 + 编码 480/1200 WebP + 1200 AVIF
npm run fetch:cards -- --refresh-meta   # 重新查询 Commons 元数据
npm run fetch:cards -- --skip-download  # 离线：只用 scripts/.card-cache 里已有源图重新编码
npm run encode:cards                # 只跑编码步骤（等价 fetch 的后半段）

# 手动跑 Python 编码时必须带（encode-cards.mjs 会自动加，手动不会）
PYTHONPATH=scripts/.pylibs python3 scripts/encode_cards.py …
```

产物：`public/img/cards/480/<slug>.webp` ×78、`public/img/cards/1200/<slug>.webp` ×78、`public/img/cards/1200/<slug>.avif` ×78。
图片就位后 `GET /api/tarot/cards` 的三个 `img*` 字段自动非空（无需重启服务，每请求探测）。
故障诊断与命令清单见 [`docs/env.md`](docs/env.md)。

---

## 7. 上游（vendor/guanwei）问题与外层包装记录

**上游边界**：`vendor/guanwei/**` 只读，任何上游问题一律在 `server/` 外层包装；`public/**` 与 `scripts/**` 是本项目自写资产（前端页面与验证脚本），随本站演进。

上游问题与包装记录：

1. **TS 类型剥离 + `.js` 导入**：vendor 是 TS 源码但 import 写 `…/tarotCards.js`、`./chartBrief`（无扩展名），Node 的 `--experimental-strip-types` 不做 `.js→.ts` 替换。
   → `server/ts-hooks.mjs`（ESM `resolve` 钩子，`module.register` 注册）在 `ERR_MODULE_NOT_FOUND / ERR_UNSUPPORTED_DIR_IMPORT / ERR_UNKNOWN_FILE_EXTENSION` 时按 `.ts/.mts/.cts` 与 `/index.ts` 重试。
2. **ESM import 提升**：钩子与 `GUANWEI_DATA_DIR` 必须在任何 guanwei 模块求值前就位。
   → `server/bootstrap.mjs` 是 `server/index.ts` 的**第一个**静态 import（先于 express/路由），vendor 路由与本项目路由全部用**动态 `await import()`** 拉入。
3. **不使用 vendor 的 `server/src/index.ts`**（它自带 `.env` 加载、上游 CORS 口径）。
   → 自写 `server/index.ts`：静态托管 + 挂载 tarot 路由 + 新增接口，CORS 默认仅本机源，错误统一 JSON。
4. **断语库缺塔罗条目**：`vendor/…/data/duanyu.ts` 只有 2 条 liuyao 条目。
   → 塔罗 `prompt` 的 `duanyu` 为空串（README 如实记录）；六爻侧把推导出的用神六亲喂给 `duanyuPromptBlock`（浅拷贝，不改原盘），否则命中不到「用神」关键词。
5. **`POST /api/tarot/draw` 只回 `cardId`**（不带牌名/图片）。
   → 前端用 `GET /api/tarot/cards` 按 `cardId` 关联；`/api/prompt` 已在服务端展开成带牌名/slug/图片的完整牌对象。
6. **express 4 的 mime 表不认 `.avif`**（回 `application/octet-stream`）。
   → `express.static` 的 `setHeaders` 显式改写 `image/avif` / `image/webp`。
7. **`/api/tarot/cards` 的图片字段**：vendor 原接口只回牌库数据，图片字段是本服务的包装层（`server/routes/tarotCards.ts` 先应答 `GET /cards`，其余 tarot 端点透传给 vendor 路由）。

---

## 8. 实测清单（本任务跑过的命令）

```bash
npm start                                            # banner + 端口监听
curl -s http://127.0.0.1:3901/api/health             # status=ok, dataDir=<项目>/data
curl -s http://127.0.0.1:3901/api                    # 端点清单
curl -s http://127.0.0.1:3901/api/tarot/cards        # 78 张，slug 唯一，imgLow 78/78 非空
curl -s http://127.0.0.1:3901/api/tarot/spreads      # 17 个牌阵
curl -s -X POST -H 'Content-Type: application/json' -d '{"spreadId":"three-card"}' \
  http://127.0.0.1:3901/api/tarot/draw              # 200 {cards,spread}
curl -s -X POST -H 'Content-Type: application/json' -d '{"spreadId":"three-card"}' \
  http://127.0.0.1:3901/api/tarot/draw -o /tmp/d.json
curl -s -X POST -H 'Content-Type: application/json' \
  -d "$(node -e 'const d=require("/tmp/d.json");console.log(JSON.stringify({cards:d.cards,spread:d.spread,question:"我下个月适合换工作吗"}))')" \
  http://127.0.0.1:3901/api/tarot/interpret          # 200 fullText 5320 字 / 9 sections
curl -s -X POST -H 'Content-Type: application/json' -d '{"question":"我今年下半年的财运如何"}' \
  http://127.0.0.1:3901/api/liuyao                   # 200 {id,question,brief,resultRaw} + 入库
curl -s -G http://127.0.0.1:3901/api/prompt --data-urlencode 'question=我今年下半年的财运如何' \
  --data-urlencode 'category=财运'                    # 200 含逐字引用硬约束 + 用神候选
curl -s -X POST http://127.0.0.1:3901/api/chart -H 'Content-Type: application/json' \
  -d '{"artId":"bazi","question":"今年事业如何","inputs":{"y":1990,"m":6,"d":15,"hourIndex":6,"gender":"男"}}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.id, j.brief.length, j.duanyu.length)})'  # d_ 开头 / brief 609 / 断语 253
VERIFY_BASE=http://127.0.0.1:3905 node scripts/verify-arts.mjs   # 七术 A1–A7 全绿
VERIFY_BASE=http://127.0.0.1:3905 node scripts/verify-e2e.mjs    # E1–E9 + E10×7 全绿
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3901/img/cards/480/the-fool.webp   # 200 image/webp
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3901/img/cards/1200/the-fool.avif  # 200 image/avif
curl -s -X POST -H 'Content-Type: application/json' -d '{bad json' \
  http://127.0.0.1:3901/api/liuyao                   # 400 {"error":"BAD_JSON",…}
curl -s http://127.0.0.1:3901/api/does-not-exist     # 404 {"error":"NOT_FOUND",…}
```

---

## 9. 免责声明

本内容（含九术盘面与断语）仅供娱乐与自我参考，不构成医疗、法律、财务建议；站内不提供账号与付费限额，也不内嵌任何 LLM。
