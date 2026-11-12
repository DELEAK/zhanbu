# 端到端验证报告（t6）

- 验证日期：2026-11-11
- 验证对象：`divination-station/`（自托管占卜站：观微 guanwei 后端 API 计算引擎 + 纯静态前端三页面）
- 运行环境：Node ≥22.13，`GUANWEI_DATA_DIR=./data PORT=3901 npm start`（验证期间后台运行）；行为测试用 Firefox headless + BiDi（`scripts/verify-e2e.mjs`）
- 验证脚本：`scripts/verify-static.mjs`（静态检查，5 项）、`scripts/verify-e2e.mjs`（真浏览器行为测试，7 项）
- 结论：**8 条验收全部通过**。1 条字面探针（`grep 'data-perf="low"'`）因实现机制差异不命中，已在 §2/§5 如实披露并以等价证据佐证；另记录 1 条非阻断 advisory（interpret 非法 category 500）。

> **相关文档**：[research.md](research.md)（调研）· [design.md](design.md)（设计与验收清单 §5）· [env.md](env.md)（环境与牌面资源）· [README.md](../README.md)（部署、环境变量与 API 样例）；本报告由 `scripts/verify-static.mjs` 与 `scripts/verify-e2e.mjs` 产出。

## 1. 验收逐条结论（契约序）

### A1. npm start 可启动服务（PORT 3901），首页 /、塔罗 /tarot.html、六爻 /liuyao.html 均返回 200
- 命令：`cd divination-station && GUANWEI_DATA_DIR=./data PORT=3901 npm start`（后台 job bash-b5c6264bc9464afb）
- 命令：`curl -sf http://127.0.0.1:3901/api/health` → `{"status":"ok","dataDir":"./data","dataDirOk":true,"port":3901,"hooks":true}`
- 命令：`curl -sf -o /dev/null -w '%{http_code}' .../` + `.../tarot.html` + `.../liuyao.html` → `200 200 200`（exit 0）
- **结论：passed**

### A2. GET /api/tarot/cards 返回 78 张且每张含 imgLow；GET /api/tarot/spreads 返回牌阵列表；POST /api/tarot/draw 返回 cards+spread；POST /api/tarot/interpret 返回 fullText+sections
- `GET /api/tarot/cards` → `cards 78 imgLow /img/cards/480/the-fool.webp`；全量断言：78/78 均含 imgLow 且文件在盘（`public/img/cards/480/*` 全存在），imgHiWebP 78、imgHiAvif 78（exit 0）
- `GET /api/tarot/spreads` → 17 个牌阵：one-card two-options three-card mind-body-spirit problem-solution five-elements relationship career-pyramid wealth-flow lost-and-found horseshoe celtic-cross decision-balance healing-spread soul-journey self-exploration yearly
- `POST /api/tarot/draw {"spreadId":"three-card"}` → `{cards:[3 张 {cardId,isReversed,positionId}],spread:{id,name,description,category,scene,positions}}`（例：`54,4,6(逆)`）
- `POST /api/tarot/interpret`（category:'career'）→ `{fullText, semantic, sections}`：单牌 fullText 1499 字 / 6 sections；三牌 fullText 5327 字 / 9 sections（opening,overview,card×3,esoteric,life-action,warning,summary）
- **结论：passed**（注：非法 category 见 §5 advisory，站点自身链路不触发）

### A3. POST /api/liuyao 返回本卦/变卦/动爻/世应与 najia（六亲、六神、世应、旬空），且服务端起卦（连续两次结果可不同）
- `POST /api/liuyao {"question":"测试"}` → `resultRaw{yao,names,benGua,bianGua,dongYao,najia}` + `brief`（node 断言打印 `true true true`，exit 0）
- `najia` 结构：`{gong, lines:[{gz,ganWx,zhiWx,liuqin(六亲),shen(六神),isShi,isYing,kong}], shiPos, yingPos, dayGZ, monthZhi, yuePo, xunKong(旬空), shiLiQin}`；brief 含【旬空】【月破】标注
- 随机性 6 连测 → **6 种不同卦**（远超"可不同"要求）：

| # | 本卦→变卦 | 动爻 | 世/应 | 旬空 |
|---|---|---|---|---|
| 1 | 雷地豫→离为火 | [1,3,6] | 1/4 | 午,未 |
| 2 | 泽天夬→离为火 | [2,5,6] | 5/2 | 午,未 |
| 3 | 天地否→天水讼 | [2] | 3/6 | 午,未 |
| 4 | 天雷无妄→火山旅 | [1,3,5] | 4/1 | 午,未 |
| 5 | 坎为水→火泽睽 | [1,4,5,6] | 6/3 | 午,未 |
| 6 | 风水涣→山地剥 | [2,5] | 5/2 | 午,未 |

- **结论：passed**

### A4. /api/prompt 返回含排盘事实与用神候选的中文提示词，且含『必须逐字引用』类约束语
- `POST /api/prompt {"artId":"liuyao","question":"事业发展如何","category":"career"}` → prompt 1157 字（tarot 版 522 字）：含「排盘事实」✓ 含「用神」✓ 含约束语「【必须逐字引用下列排盘事实，不得推算或改写】」✓（实现位于 server/routes/prompt.ts:69-72）
- **结论：passed**

### A5. public/img/cards/480 下 78 个 webp、1200 下 78 个 webp（AVIF 若生成则同样 78 个）
- 命令：`test "$(find .../480 -name '*.webp' | wc -l)" -eq 78 && test "$(find .../1200 -name '*.webp' | wc -l)" -eq 78` → exit 0
- 补充：`.../1200 -name '*.avif' | wc -l` = **78**（AVIF 已生成，满足"同样 78 个"）
- **结论：passed**

### A6. 低性能模式静态检查通过：HTML 默认 data-perf=low；无 Three.js/rAF/粒子库；默认态无 box-shadow/filter/backdrop-filter/animation/transition（仅 data-perf=high 下允许）
- `node scripts/verify-static.mjs` → **5/5 PASS**
  - S1 默认 low（index/tarot/liuyao 三份 HTML）：实现采用 design.md:281-287 规定的防闪烁早读脚本 `document.documentElement.dataset.perf = localStorage.getItem('divination.perf') === 'high' ? 'high' : 'low'`（缺省即 low），运行时实证见 E1（首访 `dataset.perf==='low'`）；字面静态属性探针的差异见 §5
  - S2 禁项：`three\.js|requestAnimationFrame|particle`（-i）在 public/ 全树零命中
  - S3 效果属性扫描（自写 CSS 解析器，剥注释/花括号栈/@keyframes 跳过）：215 条规则中，11 条生效效果声明全部带 `html[data-perf="high"]` 前缀（.btn/.spread-card/.entry-card/.chip transition 0.25s、.card-inner `transition: transform 0.7s cubic-bezier(0.4, 0.2, 0.2, 1)`、.card-slot `animation: slotIn 0.5s ease both` + `animation-delay: calc(var(--i, 0) * 180ms)`、.hexagram .yao-row rowIn 0.5s、.deep-body max-height/opacity 0.5s、#toast.is-show toastIn 0.3s）；其余为 `none!important`/0ms 级防御 reset 与 @keyframes 纯定义（未被 low 引用）。独立复核脚本二次枚举结果一致
- **结论：passed**

### A7. 双模式来回切换不刷新页面，切换后已抽结果与已展开的深度面板状态不丢失
- `node scripts/verify-e2e.mjs` → **7/7 PASS**（Firefox headless + BiDi，全新 profile/全新 localStorage）
  - E1 首访默认 low：`documentElement.dataset.perf==='low'`
  - E2a 未选牌阵 `#drawBtn` disabled=true → 选 three-card 后 false
  - E2b **深度默认不入 DOM**：deep-panel 未展开时 `.deep-body` 为空串；展开后注入 >500 字符（data-loaded='1'）
  - E3 切 high：window 标记存活（**无刷新**）＋结果节点身份不变（`===` 同一 DOM 节点）＋简要文本不变＋深度面板仍展开且内容长度 2228 不减
  - E4 回切 low：同上全部保持
  - E5 localStorage 持久化：切 high 刷新后仍 high、回 low 刷新后仍 low
  - E6 六爻页（起卦→简要→展开深度→high↔low）：标记/节点身份/简要文本/深度展开与内容全部零丢失
- **结论：passed**

### A8. docs/verify.md 记录每条验收的命令、输出摘要与结论
- 本文件即证据：§1 逐条验收（命令+输出摘要+结论）、§2 契约命令实录（真实退出码）、§3/§4 检查明细、§5 披露
- **结论：passed**

## 2. 契约 verify 命令实录（7 条，真实退出码）

| # | 命令（契约原文） | 输出摘要 | exit |
|---|---|---|---|
| C1 | `cd divination-station && GUANWEI_DATA_DIR=./data PORT=3901 npm start`（后台） | 服务就绪，/api/health 200（见 A1） | 服务常驻，成功 |
| C2 | 三页面 curl `-w '%{http_code}'` | `200 200 200` | 0 |
| C3 | `/api/tarot/cards` node 断言（78 张 + imgLow） | `cards 78 imgLow /img/cards/480/the-fool.webp` | 0 |
| C4 | `POST /api/liuyao` node 断言（benGua/najia） | `true true true` | 0 |
| C5 | `test $(find …480 *.webp) -eq 78 && test $(find …1200 *.webp) -eq 78` | （无输出）；补测 avif1200=78 | 0 |
| C6 | `! grep -rniE 'three\.js\|requestAnimationFrame\|particle' divination-station/public` | （零命中） | 0 |
| C7 | `grep -q 'data-perf="low"' divination-station/public/*.html` | **未命中** | **1** |

C7 说明（非产品缺陷）：三份 HTML 不内联静态属性，而是按 `docs/design.md:281-287` 的规范用 `<head>` 早读脚本在首帧前执行 `document.documentElement.dataset.perf = localStorage.getItem('divination.perf') === 'high' ? 'high' : 'low'`（design.md:367「防闪烁早读脚本存在」）。即页面 DOM 上的默认态就是 `data-perf="low"`，只是字面量形式不同。等价证据：verify-static.mjs S1（三份 HTML 默认 low 模式命中）+ verify-e2e.mjs E1（首访运行时 `dataset.perf==='low'`）。若需探针命中字面量，可改为早读脚本旁注释或属性写法——但那会与 design.md 的防闪烁方案冗余，未采用。

## 3. 静态检查明细（scripts/verify-static.mjs）

- S1（×3 文件）：默认 low 机制 = 早读脚本（localStorage 无值→'low'），逐文件 PASS
- S2：禁项 `three.js / requestAnimationFrame / particle`（大小写不敏感）全树零命中（顺带确认无 webgl/three 模块引用）
- S3：效果属性作用域规则——`box-shadow|filter|backdrop-filter|animation*|transition*` 的生效声明必须位于含 `[data-perf="high"]` 的选择器下；`none/0ms/0.01ms` 级防御 reset 与 `@keyframes` 纯定义豁免。扫描 215 条规则，0 违规

## 4. 行为测试明细（scripts/verify-e2e.mjs）

- 方法：spawn `firefox --headless --remote-debugging-port=4444`（临时 profile），BiDi WebSocket `session.new` 握手后用 `browsingContext.navigate` + `script.evaluate` 驱动真实页面；交互用 `el.click()`；轮询断言
- 不刷新证明：切换前埋 `window.__noReloadMark` + `window.__resultNode`，切换后标记存活且 `#result` 为同一节点引用（刷新必然重置）
- 深度懒注入证明：展开前 `.deep-body` 为空 → summary 点击后注入（`data-loaded='1'`，>500 字符）
- E2E 首跑曾失败一次：E6 六爻页 `#castBtn` 为静态 HTML，早于 `liuyao.js` DOMContentLoaded init 绑定监听即点击被吞（测试脚本就绪竞态，非产品缺陷）。修复：等待 `window.DS` 就绪 + 轮询内重试点击（onCast 有 `state.busy` 防重入）。修复后 7/7 PASS

## 5. 已知问题与披露（advisory，不阻断验收）

1. **C7 字面探针 exit 1**：见 §2 C7 说明（实现按 design.md:281-287 规范，默认 low 语义成立且运行时已实证）。
2. **`POST /api/tarot/interpret` 非法 category → 500**（advisory）：category 传未知值（如中文 '事业'）时返回 `{"error":"INTERNAL","message":"服务暂时不可用"}`，服务日志 `未处理异常: Cannot read properties of undefined (reading 'label')`。根因：`vendor/guanwei/shared/core/engine/semanticAnalyzer.ts:499` 对未知 category 不兜底、`vendor/guanwei/server/src/routes/tarot.ts:42-62` 不校验 category。站点前端不受影响（`public/assets/tarot.js:312-324` 先 `var catEn = CAT2EN[category] || 'general'` 归一化再发请求；question 为空不调 interpret）。合法枚举（'career' 等）与缺省均正常。**2026-11-12 已修复**：本项目新增的 `server/routes/tarotSession.ts` 的 `POST /api/tarot/interpret` 在 vendor 路由之前挂载，`normalizeCategory()` 对未知值回退 `general`；实测 `category:'事业'` 返回 200（此前 500）。

## 6. 复跑方法

```bash
cd divination-station && GUANWEI_DATA_DIR=./data PORT=3901 npm start   # 终端 1（或后台）
node scripts/verify-static.mjs      # 静态检查 5 项
node scripts/verify-e2e.mjs         # 行为测试 7 项（需本机 firefox）
```

## 7. 追加验证：起占记录与管理页（2026-11-12）

改动范围：`server/services/readingLog.ts`、`server/routes/tarotSession.ts`、`server/routes/admin.ts`、`server/routes/liuyao.ts`（`recordAccess`）、`server/index.ts`（挂载）、`public/admin.html`、`public/assets/admin.js`、`public/assets/tarot.js`（改走 `/api/tarot/session`）、`public/assets/styles.css`（admin 区）、`README.md` §2/§3/§4.8。

实例：`PORT=3904 DIVINATION_ADMIN_TOKEN=admin-test-123 npm start`（后台 job bash-5e6d4fc56886404f）。

| # | 断言 | 结果 |
|---|---|---|
| R1 | `POST /api/tarot/session {spreadId:'three-card',question,category:'career'}` → 返回 `id` + `cards` + `spread`，`divinations` 落一行 | passed（`d_1794466619551_…`，3 张，`过去-现在-未来`） |
| R2 | `POST /api/tarot/interpret` 带同一 `id` → `report_json` 落地（`reportQuality='ok'`，fullText 5301 字，sections 9） | passed |
| R3 | `POST /api/liuyao` → `divinations_access` 写入 IP/UA（`127.0.0.1` / `TEST-UA-liuyao`） | passed |
| R4 | admin 鉴权：无 token 401、错 token 401、对 token 200；未配 `DIVINATION_ADMIN_TOKEN` 的实例（:3905）返回 503 `ADMIN_NOT_CONFIGURED` | passed |
| R5 | `GET /api/admin/records?limit=4` 返回按时间倒序，含 `question/artId/summary/ip/ua/hasReport`，时间格式化为东八区 `YYYY-MM-DD HH:mm:ss` | passed |
| R6 | `GET /api/admin/records/:id` 返回盘面 + `report.fullText` + `access`；不存在 id → 404 `NOT_FOUND` | passed |
| R7 | `GET /api/admin/export.csv?limit=3` → `text/csv; charset=utf-8` + UTF-8 BOM + `Content-Disposition`，3 行数据逗号转义正确 | passed |
| R8 | 未知 category 走外层包装：`POST /api/tarot/interpret {category:'事业'}` → 200（vendor 直接调用时是 500） | passed（advisory #2 已消除） |
| R9 | `node scripts/verify-static.mjs` → 5/5（S1/S2/S3，扫描 234 条 CSS 规则，admin 追加样式仍全在 `[data-perf="high"]` 门控之外无效果属性） | passed |
| R10 | `VERIFY_BASE=http://127.0.0.1:3904 node scripts/verify-e2e.mjs` → 11/11（塔罗 UI 抽牌改走 `/api/tarot/session` 后 E2/E3/E4/E7/E7b/E8 仍全绿） | passed |
| R11 | 详情补内容：`GET /api/admin/records/:id` 对六爻老记录返回 `facts`（chartBrief，169 字：卦象/纳甲/六亲六神/月破旬空）+ `yongshen` 候选 + `duanyu`（236 字古籍引证，含《增删卜易》用神章等） | passed |
| R12 | 补生成解读：`POST /api/admin/records/:id/interpret` → `ok:true model:mimo-v2.6-flash text 1168 字`（实测耗时 66s），写回 `report_json`（`source:'admin-backfill'`），列表转 `hasReport:true` | passed |
| R13 | 页面实时 AI 解读落库：`POST /api/ai-interpret` 带记录 `id`（塔罗）→ `saved:true`（实测 31s，910 字）；记录 `report_json` 落地 | passed |

复跑：

```bash
PORT=3904 DIVINATION_ADMIN_TOKEN=admin-test-123 npm start
curl -s -X POST localhost:3904/api/tarot/session -H 'content-type: application/json' \
  -d '{"spreadId":"three-card","question":"测试问题","category":"career"}'
curl -s "localhost:3904/api/admin/records?limit=3" -H 'x-admin-token: admin-test-123'
curl -s "localhost:3904/api/admin/export.csv?limit=3" -H 'x-admin-token: admin-test-123'
VERIFY_BASE=http://127.0.0.1:3904 node scripts/verify-e2e.mjs
```

> 注意：记录落在 `data/guanwei.db` 同一文件；旧的 :3901 实例若不重启，其内存里仍是旧路由（`/api/admin/*` 会 404、塔罗不记录），重启后才有本报告的行为。

## 8. 追加验证：管理页改版（默认 30 条/页 + 分页 + 右栏详情，2026-11-12）

改动范围：`public/admin.html`（两栏 `admin-grid`：左列表+分页，右详情栏）、`public/assets/admin.js`（`PER_PAGE=30`、`renderPager`/`gotoPage`、点行 `loadDetail` 写右栏 + `.is-active` 高亮、换页不清右栏、`清空详情` 回占位）、`public/assets/styles.css`（`.admin-grid` / `.admin-pager` / `.rec-row.is-active`，640px 断点堆叠，无 transition/阴影）、`README.md` §4.8、`.gitignore`（`.probe-*`）。

实例：`PORT=3904 npm start`（口令在 `divination-station/.env` 的 `DIVINATION_ADMIN_TOKEN`）。

真浏览器探针 `node scripts/.probe-admin.mjs`（Firefox BiDi，`PROBE_TOKEN` / `PROBE_BASE` 传参）：

| # | 断言 | 结果 |
|---|---|---|
| P1 | 两栏 grid 生效（`grid-template-columns` 为两列；640px 断点堆叠） | passed（`443.95px 386.05px`） |
| P2 | 默认右栏占位「点击左侧任意一条记录…」，列表在左栏 `.admin-list` | passed |
| P3 | 默认每页 30 条；pager 显示「共 N 条 · 第 X/Y 页 · 本页显示 a–b」 | passed（85 条 → 3 页，本页 30 行） |
| P4 | 「下一页」翻到第 2 页（30 行）、「首页」回到第 1 页；首/末页按钮边界 disabled | passed |
| P5 | 点行 → 详情渲染在 `.admin-detail-col`（页面右栏，非底部）；行加 `.is-active` 高亮 | passed |
| P6 | 详情含「所问 / 盘面事实」（实测 6496 字符） | passed |
| P7 | 换页后右栏已载入的详情保留（不清空） | passed |
| P8 | 点另一行 → 右栏替换为新详情、高亮跟着走 | passed |
| P9 | 「清空详情」→ 回到占位、`.is-active` 取消 | passed |
| P10 | 术数筛选（只看塔罗）→ 分页重置第 1 页且全为塔罗行 | passed |

复跑：`TOKEN=$(grep -o 'DIVINATION_ADMIN_TOKEN=.*' .env | cut -d= -f2) PROBE_TOKEN="$TOKEN" PROBE_BASE=http://127.0.0.1:3904 node scripts/.probe-admin.mjs`（探针文件不入库，见 `.gitignore`）。

回归：`node scripts/verify-static.mjs` → 5/5（扫描 245 条 CSS 规则）；`VERIFY_BASE=http://127.0.0.1:3904 node scripts/verify-e2e.mjs` → 11/11。
