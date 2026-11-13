# 九术上线计划（新增七术：八字 / 紫微 / 奇门 / 六壬 / 梅花 / 小六壬 / 占星）

> 目的：把观微（guanwei）后端已有的九术排盘中**尚未上线**的七术接入本站，保持既有架构（vendor 后端算 + 自写静态前端）不变。
> 读者：在新窗口里实现本项目的人 / Agent。本文件自包含，不需要读历史对话；需要更细的既有实现细节时按文内路径直接看代码。
> 生成时间：2026-11-13。基线：站点已上线塔罗、六爻两页，`npm start` 可跑，`scripts/verify-static.mjs` 5/5、`scripts/verify-e2e.mjs` 11/11。

---

## 0. 结论先行

| 项 | 值 |
|---|---|
| 是否可行 | **完全可行**，引擎、盘面事实（predigested brief）、古籍断语、AI persona 全部现成，不需要写排盘算法 |
| 新增页面 | 7 个（八字、紫微、奇门、六壬、梅花、小六壬、占星），加上首页共 8 个入口位 |
| 新增后端 | 1 个通用路由 `POST /api/chart` + 1 个输入归一化模块 + 提示词/Agent 泛化 |
| 预计代码量 | 后端 ~500 行、前端 7 页 ~2600 行、样式 ~400 行、验证 ~300 行、文档 ~200 行 |
| 主要风险 | ① 紫微/小六壬的农历换算（已在 §4 给出实测规则）② styles.css 单写者约束（多人并行时唯一冲突点）③ 低性能模式禁项（每个新页面都要过 `verify-static` S1/S2/S3） |
| 建议顺序 | 后端（T1–T2）→ 前端公共壳与样式（T3）→ 七页并行（T4–T9）→ 管理页（T10）→ 验证（T11）→ 收口（T12）→ 评审（T13） |

---

## 1. 现状与已实证的引擎能力

基座是 vendored 观微（`vendor/guanwei/`，MIT）。排盘统一入口：

```
vendor/guanwei/shared/core/engine/chart.ts:21   chartCalc(artId, inputs)   → resultRaw
vendor/guanwei/shared/core/engine/chart.ts:15   CHART_ARTS = ['bazi','ziwei','astrology','qimen','meihua','liuyao','liuren','xiaoliuren','tarot']
vendor/guanwei/shared/core/engine/chart.ts:57   CHART_INPUT_SCHEMA（每术入参说明）
vendor/guanwei/server/src/services/chartBrief.ts:7    chartBrief(artId, resultRaw) → 中文盘面事实（AI 逐字引用源）
vendor/guanwei/server/src/services/duanyu.ts:58       duanyuPromptBlock(artId, resultRaw) → 古籍断语（有命中才非空）
vendor/guanwei/server/src/services/skills.ts:116      agentOf(artId) → {name, role, skills[], classics}（九术 persona，直接用于提示词）
vendor/guanwei/server/src/services/sixRelatives.ts:52 sixRelativesFacts(artId, resultRaw, gender)（八字/紫微六亲一致性约束，可选）
```

**已实测（2026-11-13，`node --experimental-strip-types` 直调）**：

| 术 | 计算 | chartBrief | duanyu | 备注 |
|---|---|---|---|---|
| bazi | 17ms | 609 字 | 253 字 | 四柱/十神/藏干/五行加权/旺衰拆解/用神喜忌/大运 8 步/流年/神煞/格局/胎元命宫身宫 |
| ziwei | <5ms | ~700 字 | 232 字 | 十二宫 + 14 主星 + 29 辅星 + 四化 + 庙旺亮度（含昼夜修正）+ 空宫借星 + 格局 + 大限/流年 |
| qimen | 3ms | 148 字 | 271 字 | 阴阳遁局数/旬首/值符值使/4 个关键宫位 |
| liuren | 3ms | 166 字 | 235 字 | 天地盘/四课/三传/十二天将/课体 |
| meihua | <1ms | 76 字 | 0 | 本卦/互卦/变卦/体用/旺衰/动爻 |
| xiaoliuren | <1ms | 76 字 | 175 字 | 六神掌诀 + 断语诗 |
| astrology | 3ms | 328 字 | 0 | 七行星落座落宫/十二宫/相位/庙旺 |
| liuyao（已上线） | 1ms | 163 字 | 视用神 | 纳甲六亲六神月破旬空 |
| tarot（已上线） | <1ms | 47 字/局 | 0 | 牌阵 + 逐张牌义 |

依赖只有 `lunar-typescript`、`astronomy-engine`（均已安装），**不需要新增 npm 包**。紫微是观微自研安星（非 iztro），无需 iztro。

---

## 2. 总体架构（新增部分）

```
浏览器                                                  服务端
┌──────────────────────────────┐          ┌───────────────────────────────────────┐
│ 9 个静态页（index + 8 术）    │          │ express（server/index.ts）             │
│  · 早读 data-perf=low|high   │  fetch   │  /api/chart      ← 新增：七术排盘       │
│  · 简要盘面（默认渲染）      │ ───────► │  /api/prompt     ← 泛化到九术          │
│  · 深度面板 <details>        │          │  /api/ai-interpret ← persona 泛化      │
│    展开时才注入 DOM          │          │  /api/tarot/*、/api/liuyao（既有）      │
│  · 复制提示词 / AI 解读      │          │  /api/admin/*    ← 记录查看（既有，扩术数筛选）│
└──────────────────────────────┘          │  vendor/guanwei（只读）：chartCalc / chartBrief /│
                                          │  duanyu / agentOf / createDivination │
                                          └───────────────────────────────────────┘
```

原则（来自用户原始规范，必须保持）：
- 计算与随机全部在服务端定稿（浏览器不参与排盘）；
- 两种性能模式在同一套页面上，`html[data-perf="low"|"high"]` 控制，切换不刷新；
- 深度内容默认不进 DOM，展开时才注入；
- 低性能模式禁止 transition / animation / box-shadow / filter / backdrop-filter / 3D / rAF；
- 高级感靠排版、留白、深色配色（`#0a0a0f` 底、`#c9a84c` 暗金、`#8fbcbb` 淡青）、1px 细线、字号层级，不靠动效。

---

## 3. 后端 API 契约

### 3.1 `POST /api/chart`（新增，`server/routes/chart.ts`）

```jsonc
// 请求
{
  "artId": "bazi" | "ziwei" | "astrology" | "qimen" | "liuren" | "meihua" | "xiaoliuren",
  "question": "（可选，≤300 字）",
  "category": "（可选，≤20 字：综合/感情/事业/财运/学业/健康/人际）",
  "inputs": { /* 见 §4；全部由页面收集，服务端只做校验与归一化 */ }
}

// 响应 200
{
  "id": "d_xxx",              // divinations 主键（记录 id，前端用于 AI 落库 / 管理页回看）
  "artId": "bazi",
  "kind": "mingpan" | "zhanwen",
  "question": "…" | null,
  "category": "…" | null,
  "params": { "source": "server-calc", "inputs": {...}, "四柱/局式等关键字段?": "不需要，前端直接用 resultRaw" },
  "resultRaw": { … },          // chartCalc 原样
  "brief": "…",                // chartBrief 中文盘面事实
  "yongshen": null,            // 仅六爻有；七术恒为 null（奇门/梅花用神在 brief/duanyu 内）
  "duanyu": "…"                // duanyuPromptBlock；无命中为 ""
}

// 错误
400 BAD_ART      artId 不在七术内（提示：liuyao 走 /api/liuyao、tarot 走 /api/tarot/session）
400 BAD_INPUTS   缺字段/非法值，message 指出具体字段（如「出生日期不合法」「gender 只能是 男/女」）
400 BAD_QUESTION 问题超 300 字
500 INTERNAL     排盘异常（打印日志，不泄漏内部细节）
```

实现要点：
- `kind`：`['bazi','ziwei','astrology']` → `'mingpan'`，其余 → `'zhanwen'`（与 vendor `server/src/routes/divine.ts:9 MINGPAN_ARTS` 一致）。
- 入库统一 `createDivination({ username: 'local', artId, kind, question, params: { source: 'server-calc', inputs }, resultRaw })`，随后 `recordAccess(record.id, {ip: clientIp(req), ua, referer})`（复用 `server/services/readingLog.ts`、`server/services/guard.ts`）。
- 校验 question ≤300 与既有路由一致（`MAX_QUESTION`）。
- 服务端不接受客户端传入的「已排好的盘」，只接受输入参数（防止伪造盘面）。唯一例外：`/api/prompt` 允许回传 resultRaw（见 3.3），因为它要生成与页面一致的提示词。

### 3.2 `GET /api/chart/arts`（新增，可选但建议）

返回能力清单，供首页/页面渲染表单时决定显示哪些字段：

```json
[{ "artId":"bazi", "label":"子平八字", "kind":"mingpan", "group":"命盘",
   "needs":["birthDate","hour","gender"], "schema": {"y":"公历年","m":"公历月",…} },
 …]
```

`schema` 可直接转发 `CHART_INPUT_SCHEMA`（chart.ts:57）。

### 3.3 提示词与 AI 泛化（改造 `server/routes/prompt.ts`、`server/routes/aiInterpret.ts`）

现状：`buildPromptResponse(src)` 只支持 `liuyao` / `tarot`，提示词模板为手写两套（`liuyaoPrompt` / `tarotPrompt`），`aiInterpret.ts` 的 `systemPrompt()` 写死「塔罗占卜师与六爻解卦师」。

改法：
1. `parseArtId` 放开到九术；`buildPromptResponse` 增加 `resultRaw` 分支：七术若带 `resultRaw`（页面已排好）→ 直接 `chartBrief(artId, resultRaw)`；不带 → **不接受现排**，返回 `400 NEED_RESULT`（七术必须先调 `/api/chart` 拿到盘面，提示词才能与页面一致）。
2. 角色句改用 vendor `agentOf(artId)`：`你是一位${agent.name}。${agent.role}`，skills 逐条编号列出（`skills.ts` 每术 3–5 条，含指令文本），古籍范围用 `agent.classics`。
3. 保留并前置既有硬约束 `HARD_RULES_COMMON`（「【必须逐字引用下列排盘事实，不得推算或改写】」等 4 条，`server/routes/prompt.ts:66-72`）——这是本站的招牌，不能删。
4. 输出要求按两类分叉：
   - **命盘类**（bazi/ziwei/astrology）：画像 → 性情 → 家庭 → 学业事业 → 情感 → 财富 → 健康 → 人生阶段（按大运/大限）→ 综合建议；600–1200 字，每段须落到具体盘面（四柱干支、星曜落宫、相位）。
   - **占问类**（qimen/liuren/meihua/xiaoliuren，以及既有 liuyao/tarot）：总断 3 句内 → 现状 → 走势（近/中/远期）→ 时机宜忌 → 建议；600–900 字。奇门要写清「哪一宫、哪一门、哪一星、哪一神」，六壬要写清「初/中/末传与天将」，梅花要写清「体用生克、互变卦」，小六壬要写清「掌诀吉凶五行方位」。
5. 断语：`duanyuPromptBlock(artId, resultRaw)` 已有则拼入；占星/梅花/塔罗无命中 → 空串，不报错。
6. 时辰未知约束（仅 bazi/ziwei）：页面允许「时辰未知」，此时提示词必须注入与 vendor `server/src/services/promptBuilder.ts:74 hourUnknownNote()` 等价的约束（禁止编造时柱、子女宫、晚年等）。可直接照抄该文案。
7. `aiInterpret.ts`：`systemPrompt(providerLabel)` → `systemPrompt(providerLabel, artId)`，身份句用 `agentOf(artId).role`，其余（今日日期、纯文本要求、逐字引用提醒）保留。`built.body.artId` 已随 `buildPromptResponse` 返回，落库字段不用改。
8. 前端 AI 调用零改动（`DS.wireAi(root, payload)` 已把 artId/resultRaw 传给 `/api/ai-interpret`）。

---

## 4. 输入归一化（`server/services/chartInputs.ts`）

页面只收集「人话级」输入，服务端归一化。全部换算用已装的 `lunar-typescript`（`Solar`/`Lunar`），节气与真太阳时交给 vendor 引擎内部处理。

### 4.1 时辰口径

- 12 时辰选择器：`子 丑 寅 卯 辰 巳 午 未 申 酉 戌 亥`，另加「时辰未知」。
- `hourIndex = floor(((hour24 + 1) % 24) / 2)`（0=子，23:00–00:59 → 0）。实测：12:30 → 6（午）。
- `hourIndex = -1` 表示未知（仅 bazi 支持；ziwei 必须有时辰，未知时直接 400 或按午时占位并显著提示——**建议 400**，避免假盘）。

### 4.2 每术输入映射

| artId | 页面收集 | 服务端归一化 → `chartCalc` 入参 |
|---|---|---|
| bazi | 公历 y/m/d、时辰（或未知）、性别、可选出生地经度 | `{y, m, d, hourIndex, gender, time?: 'HH:MM', location?: {lng, lat}}`（`BaziInput`，types.ts:27） |
| ziwei | 公历 y/m/d、时辰、性别、可选经度 | `{ganzhi: lunar.getYearGan()+lunar.getYearZhi(), month: Math.abs(lunar.getMonth()), day: lunar.getDay(), hour: hourIndex, gender, birthYear: y, solarDate: [y,m,d], time?, location?}`（`ZiweiInput`，types.ts:60） |
| astrology | 公历 y/m/d、时分、出生地经度/纬度 | `{y, m: m, d, hour, min, lng, lat}`（`astrologyCalc`，astrology.ts:58；lng 缺省 116.4、lat 缺省 39.9） |
| qimen | 起局时刻（默认现在 / 可选自定义） | `{datetime: ISO 字符串}`（`QimenInput`） |
| liuren | 起课时刻（默认现在 / 可选自定义） | `{datetime: ISO 字符串}` |
| meihua | 模式：时间起卦 / 报数起卦（n1,n2,n3） | `{mode:'time'|'number', n1,n2,n3}`（时间模式不传 n，引擎用 now） |
| xiaoliuren | 公历 y/m/d + 时辰（或报数） | `{mode:'time', m: 农历月, d: 农历日, h: hourIndex}` 或 `{mode:'number', n1,n2,n3}` |

**关键换算规则（已实测，勿改）**：

```ts
import { Solar } from 'lunar-typescript';
const solar = Solar.fromYmdHms(y, m, d, hh, 30, 0);   // 时辰取中点 :30 与 bazi 缺省一致
const lunar = solar.getLunar();

// 紫微：年干支用「农历年（春节换年）」，不是立春
ganzhi = lunar.getYearGan() + lunar.getYearZhi();      // 实测 1984-02-02 → 甲子（getYearGanByLiChun 会给 癸亥，勿用）
month  = Math.abs(lunar.getMonth());                   // getMonth() 闰月为负（如 2020-06-20 → -4）；观微 ziwei 未处理负月，取绝对值＝闰月按本月
day    = lunar.getDay();

// 小六壬：农历月/日 + 时辰序
```

> 闰月可选增强：iztro 约定「闰月生人，按闰月所在之月的后半月进下月」；本期先按「闰月=本月」并在盘面脚注「闰月按本月排盘」，写进 docs 与页面 hint 即可。

**校验**：y 1900–2100、m 1–12、d 合法（用 `Solar.fromYmd` 抛错兜底）、hour 0–23、hourIndex 0–11 或 -1、gender ∈ {男,女}、n1–n3 为 1–999 整数、lng -180–180、lat -90–90。非法 → 400 `BAD_INPUTS` 并指明字段。

---

## 5. 前端：页面骨架与盘面组件

### 5.1 页面骨架（7 个新页逐字复用现有模式）

以 `public/tarot.html:1-33` 为模板，**必须包含**：

```html
<script>
  try { document.documentElement.dataset.perf = localStorage.getItem('divination.perf') === 'high' ? 'high' : 'low'; }
  catch (e) { document.documentElement.dataset.perf = 'low'; }
</script>
```

（早读脚本决定首屏模式，`design.md:281-287` 规定的方案，`verify-static` S1 就查这个）

topbar 结构（品牌 + 当前页名 + 性能开关）与 tarot.html 一致；`main.container` 内分区：`STEP 01 出生信息/起局信息` → `STEP 02 所问之事（占问类）` → 结果区。

结果区两层（与性能模式正交）：

```html
<div id="result" hidden>
  <div class="chart-brief"> …盘面（默认渲染，必须好看）… </div>
  <details class="deep-panel">
    <summary class="deep-sum"><span class="sum-txt">⌄ 深度解读（逐宫/逐柱证据 · 提示词 · AI）</span></summary>
    <div class="deep-body"></div>   <!-- 展开前为空：深度内容不入 DOM -->
  </details>
</div>
```

JS 里 `DS.wireDeepPanel(detailsEl, loader)`（`public/assets/app.js:231`）负责展开时注入 / 收起时可保留；`DS.wireAi(detailsEl, payload)`（app.js:376）负责 `.btn-ai` → `/api/ai-interpret` → `.ai-out`。深度内容里必须有：

```html
<div class="deep-sec"><h4>AI 解读提示词</h4>
  <textarea class="prompt-box" readonly>…</textarea>
  <div class="deep-actions">
    <button class="btn btn-copy" type="button">复制提示词</button>
    <button class="btn btn-ai" type="button">AI 深度解读</button>
  </div>
  <div class="ai-out" hidden></div>
</div>
```

（`.btn-copy` 由 `app.js:305` 事件委托处理，无需自写复制逻辑。）

### 5.2 盘面组件与 CSS 类词汇表（styles.css 由单写者一次性补齐）

只允许新增以下类名，避免七页各写各的导致样式碎片化；全部**无 transition / 无阴影**，仅细线与底色差：

| 类 | 用途 |
|---|---|
| `.pan` | 盘面容器（细线框 + `--bg-2` 底 + `--r-sm` 圆角） |
| `.pan-head` | 盘面标题行（小字 + 术名 + 时间戳） |
| `.pan-grid` | 通用网格容器（子元素用 `--pan-cols` 变量控制列数） |
| `.pan-cell` | 单格（细线分隔，可含 `.pan-cell-title` / `.pan-cell-main` / `.pan-cell-sub`） |
| `.gz` | 干支大字（衬线 20px，暗金） |
| `.wx` | 五行小徽章（字 12.5px，低饱和底） |
| `.star` | 星曜名（紫微：主星 15px / 辅星 12.5px 灰） |
| `.badge` | 静态徽章（四化/旬空/月破/吉凶） |
| `.mono` | 等宽（已有） |
| `.hint` / `.step` / `.section` / `.field` / `.btn` / `.chip` / `.deep-panel` / `.deep-sec` / `.ai-out` | 复用现有 |

各术布局：

**八字**（`public/bazi.html` + `assets/bazi.js`）
```
简要：四柱表（4 列 × 3 行：柱名 / 天干大字 / 地支大字），下挂：日主（辛金）· 身弱 · 用神土
      五行分布 5 格（木2 火6 土3 金2 水3）· 当前大运（乙酉 28岁 2017-2026）· 流年（2026 丙午）
深度：十神/藏干逐柱 · 旺衰拆解（reasons[]）· 用神喜忌全文 · 神煞 · 格局 · 胎元命宫身宫
      大运 8 步（列表，当前高亮）· 提示词 + AI
```
数据：`resultRaw.yearGZ/monthGZ/dayGZ/hourGZ`、`dayGan`、`dayGanWx`、`strength`、`wxWeighted`、`shishen[]`、`canggan[]`、`strengthDetail.reasons[]`、`yongshen{...}`、`dayun[]`、`liunian`、`shensha[]`、`geju{name,basis}`、`taiyuan/minggong/shengong`。

**紫微**（`ziwei.html` + `ziwei.js`）
```
简要：4×4 棋盘 —— 12 宫格按固定方位排布（寅起顺行），每格：宫名 / 宫干支 / 主星（带亮度）/ 四化徽章
      中心 2×2 合并块：五行局 · 命宫(戊子) · 身宫 · 紫微落宫 · 当前大限
深度：辅星全列 · 生年四化落宫 · 十二宫事实（chartBrief 的逐宫行）· 空宫借星 · 格局 · 大限/流年 · 提示词 + AI
```
数据：`ming`（0=寅）、`palaces`（宫位映射）、`zwStars`、`fuStars`、`brightness`/`effBrightness`、`sihua`/`sihuaPos`、`geju[]`、`borrowedStars`、`dayun[]`、`curDayunIdx`、`liunianPalaceName`、`dayNight`。
宫位顺序注意：`ming`/`zwStars`/`fuStars` 的数值是「0=寅起」的地支位，宫名要按 `PALACE_NAMES` 与命宫推导（`vendor/guanwei/shared/core/data/ziwei` 有 `PALACE_NAMES`；`chartBrief` 的 ziweiBrief 已把「宫名｜主星｜辅星｜四化」拼好，可作为**校验基准**：页面渲染出的十二宫必须与 brief 里的逐宫行逐字一致——这是本项目的盘面一致性招牌）。

**奇门**（`qimen.html` + `qimen.js`）
```
简要：值符/值使行 + 3×3 九宫格（宫号 / 天盘奇仪 / 八门 / 九星 / 八神），值符宫、值使宫用底色微差标记
深度：每宫「暗干」细表 · 局式（阴阳遁局数/节气/日时干支/旬首）· 断语 · 提示词 + AI
```
数据：`yin`、`ju`、`jqName`、`dayGZ`/`hourGZ`、`xunShou`/`xunshouName`、`zfStar`、`zsMen`、`zfPalace`、`zsPalace`、`pan`（每宫各字段，字段名以上机实测为准）、`tianYi`、`shen`。

**六壬**（`liuren.html` + `liuren.js`）
```
简要：四课（干上/干阴/支上/支阴 四格）+ 三传（初/中/末 三格，含天将）
深度：天地盘（十二位小表）· 十二天将布宫 · 课体与说明 · 断语 · 提示词 + AI
```
数据：`dayGZ`/`hourGZ`、`jiang`、`jqName`、`tianpan`、`ganJi`、`ke1..ke4`、`chuan1..chuan3`、`guiRen`、`isDay`、`tianJiang`、`chuanJiang`、`keti`/`ketiNote`。

**梅花**（`meihua.html` + `meihua.js`）
```
简要：本卦 / 互卦 / 变卦 三卦并排（每卦 6 爻线条，动爻点位标记）+ 体用行（体木 用土 用克体 凶）
深度：旺衰（月建/体用旺衰/结论）· 动爻位义 · 断语（无）· 提示词 + AI
```
数据：`benGua`/`huGua`/`bianGua`（含 `GUA_LOOKUP` 名称与象义）、`move`、`tiGua`/`yongGua`、`tiWx`/`yongWx`、`shengke`、`monthWx`、`tiWangShuai`/`yongWangShuai`、`wangShuaiNote`。
卦爻线条渲染复用六爻页的 `.gua-row`（`public/assets/liuyao.js` 内有阳/阴爻与小圆点动爻标记的实现，可抽到 `app.js` 共用）。

**小六壬**（`xiaoliuren.html` + `xiaoliuren.js`）
```
简要：六掌诀横排（大安/留连/速喜/赤口/小吉/空亡），命中项用静态底色 + 细线框强调；下挂吉凶/五行/方位/主数 + 断语诗
深度：推演轨迹（a→b→c→idx）· 详细断语 · 提示词 + AI
```
数据：`a`/`b`/`c`/`idx`、`name`、`detail`（断语诗）、`XLR`/`XLR_ORDER`（`shared/core/data/xiaoliuren`）。

**占星**（`astrology.html` + `astrology.js`）
```
简要：太阳/月亮/上升 三格（星座 + 度数）+ 七行星落座落宫表
深度：十二宫（宫头星座 + 宫主星）· 相位列表（合/六合/刑/拱/冲，含容许度若有）· 庙旺标记 · 提示词 + AI（无断语）
```
数据：`planets`、`asc`、`sun`/`moon`、`mc`、`planetDetails`、`houses`、`houseSystem`、`aspects`、`sunSign`/`moonSign`/`ascSign`、`lstHours`、`epsilon`。

### 5.3 首页入口（`public/index.html`）

现有 `.entry-grid` + `.entry-card`（`index.html:40-52`）扩为 9 张卡，分组标题用现有 `.section`/`.step`：

- **命盘**：子平八字 / 紫微斗数 / 西方星盘
- **占问**：六爻起卦 / 奇门遁甲 / 大六壬 / 梅花易数 / 小六壬
- **牌类**：塔罗占卜

卡片文案一句点题（示例：「子平八字 · 四柱十神，日主旺衰与大运流年」）。保留 `.entry-cta` 箭头样式。

### 5.4 双模式矩阵（新增部分）

| 项 | low（默认） | high（用户开启） |
|---|---|---|
| 盘面入场 | 无动画，直接呈现 | 盘面格错峰淡入（`animation-delay` 递增，仅 `opacity`/`translateY` 轻量属性） |
| 深度面板 | 展开瞬时 | `max-height` 过渡（复用既有 `.deep-panel` 规则） |
| 当前项强调（当前大运、值符宫、命中掌诀、当前大限） | 静态底色 + 细线 | 同款底色 + 1px 金线 + 极轻 `border-color` 过渡 |
| 禁止 | transition/animation/shadow/filter/backdrop/3D/rAF | 同样禁止 shadow/filter/backdrop/3D/rAF；只允许 transform/opacity/max-height 的短过渡 |

所有 `[data-perf="high"]` 之外不得出现任何效果属性——`scripts/verify-static.mjs` S3 会逐条扫描 `styles.css`。

---

## 6. 记录与管理页扩展

1. `server/services/readingLog.ts` 的 `summary` 分支（现只有 tarot/liuyao，`readingLog.ts:114-126`）补七术：
   - bazi：`日主辛金 · 庚午年 · 身弱`
   - ziwei：`火六局 · 命宫子 · 武曲天府`
   - qimen：`阴遁9局 · 值符天心 · 辛卯日`
   - liuren：`辛卯日 · 三传子/未/寅`
   - meihua：`山风蛊 → 巽为风 · 体木用土`
   - xiaoliuren：`留连（凶·水）`
   - astrology：`上升处女 · 太阳双子 · 月亮双鱼`
2. `public/admin.html:41-43` 术数下拉补 7 个 `<option>`（值与 artId 一致）。
3. `GET /api/admin/records/:id` 的 `facts` 已经通用调 `chartBrief`，七术自动可用；`duanyu` 同样通用。
4. `POST /api/admin/records/:id/interpret`（补生成）内部走 `buildPromptResponse`，泛化后自动支持七术——需确认它传入的是 `{artId, resultRaw, question, category}`。

---

## 7. 验证方案

### 7.1 静态（扩展 `scripts/verify-static.mjs`）

- `const htmls = [...]` 由 3 个扩到全部页面：`index/tarot/liuyao/bazi/ziwei/qimen/liuren/meihua/xiaoliuren/astrology/admin`（`verify-static.mjs:29`）。
- S2 禁项（three.js / requestAnimationFrame / particle）自动覆盖全树，无需改。
- S3 扫 `styles.css` 全表，新增样式必须仍全部门控在 `[data-perf="high"]` 或有 `none/0ms` 防御 reset。

### 7.2 API（新增 `scripts/verify-arts.mjs`）

对七术逐个：

| # | 断言 |
|---|---|
| A1 | `POST /api/chart` 合法输入 → 200，`id` 以 `d_` 开头，`brief` ≥ 60 字 |
| A2 | 落库：`GET /api/admin/records?artId=<art>&limit=1` 能查到该 id，`summary` 非空且符合 §6 格式 |
| A3 | `GET /api/admin/records/:id` → `facts` 与 `/api/chart` 的 brief **逐字相同**（盘面一致性） |
| A4 | `POST /api/prompt {artId, question, category, resultRaw}` → 200，`prompt` 含「必须逐字引用下列排盘事实」+ `agentOf(artId).name` 人设句 + brief 全文 |
| A5 | 断语存在性：qimen/liuren/xiaoliuren/bazi/ziwei 的 `duanyu` 非空；meihua/astrology 允许空 |
| A6 | 非法输入（缺 y、gender 乱写、problem 超 300）→ 400 且 `error` 正确 |
| A7 | 时辰未知（bazi）→ 200，`hourGZ` 为「—」或空且 prompt 含「时辰未知 · 最高约束」 |

### 7.3 浏览器行为（扩展 `scripts/verify-e2e.mjs`，每页一组）

每个新页面至少断言：`E10.x` 首访 `dataset.perf === 'low'`；填写表单 → 点「起盘」→ 简要盘面渲染（关键 DOM 节点数）；`.deep-body` 初始为空；展开 → 注入且字符数 > 800；切 high 再切 low → window 标记存活（未刷新）+ 简要文本不变 + 深度仍展开；AI 按钮与复制按钮存在（AI 未配 Key 时点击回退提示）。

（参考现有 E1–E9 的写法：`evalIn` / `waitFor` 辅助函数在 `verify-e2e.mjs:60-80`，直接复用。）

### 7.4 回归

`node scripts/verify-static.mjs`、`node scripts/verify-arts.mjs`、`VERIFY_BASE=http://127.0.0.1:<port> node scripts/verify-e2e.mjs` 全绿；塔罗/六爻既有 11 项不得回归。

---

## 8. 任务拆分（并行写作用域，供新窗口执行）

写作用域互斥是硬约束：**`public/assets/styles.css` 只有 T3 能写**（其他人要改样式→提给 T3 或等到 T12 收口）。

| id | 任务 | 写作用域 | 依赖 |
|---|---|---|---|
| T1 | 通用排盘 API + 输入归一化 + 入库 + 能力清单 | `server/routes/chart.ts`、`server/services/chartInputs.ts`、`server/index.ts`、`README.md`（API/页面表） | — |
| T2 | 提示词/AI persona 泛化（九术） | `server/routes/prompt.ts`、`server/routes/aiInterpret.ts`、`server/services/promptTemplates.ts`（新，放每术输出要求） | T1 |
| T3 | 前端公共壳：页面模板、`DS.birthForm/momentForm/guaRow`、**styles.css 全部盘面组件**、index 九术入口 | `public/index.html`、`public/assets/app.js`、`public/assets/styles.css` | T2 |
| T4 | 八字页 | `public/bazi.html`、`public/assets/bazi.js` | T3 |
| T5 | 紫微页 | `public/ziwei.html`、`public/assets/ziwei.js` | T3 |
| T6 | 奇门页 | `public/qimen.html`、`public/assets/qimen.js` | T3 |
| T7 | 六壬页 | `public/liuren.html`、`public/assets/liuren.js` | T3 |
| T8 | 梅花 + 小六壬（两页，同一人，复用卦爻渲染） | `public/meihua.html`、`public/assets/meihua.js`、`public/xiaoliuren.html`、`public/assets/xiaoliuren.js` | T3 |
| T9 | 占星页 | `public/astrology.html`、`public/assets/astrology.js` | T3 |
| T10 | 记录/管理页扩展（summary 七术 + 下拉 + 补生成核对） | `server/services/readingLog.ts`、`public/admin.html` | T1 |
| T11 | 验证：静态扩展 + `verify-arts.mjs` + e2e 七页断言 + `docs/verify.md` §9 | `scripts/verify-static.mjs`、`scripts/verify-arts.mjs`（新）、`scripts/verify-e2e.mjs`、`docs/verify.md` | T4–T10 |
| T12 | 收口：修 T11 发现的问题、`docs/design.md` 补组件/矩阵、README 全量更新 | 除 `scripts/verify-*.mjs` 外均可 | T11 |
| T13 | 终审（只读，不写任何文件） | —（证据写任务 output） | T12 |

建议人员：后端 1（T1/T2/T10）、前端核心 1（T3）、前端页面 2（T4/T5 一人；T6–T9 一人）、验证 1（T11）、评审 1（T13）。若单人实现，顺序 T1→T2→T3→T4…T9→T10→T11→T12。

**若用 AgentTeams**：`styles.css` 单写者已在 T3 收口；终审放在**所有写入之后**（T13 依赖 T12），且评审任务的依赖链必须包含全部 implementation 任务（这样 verdict 的 artifact 绑定才覆盖所有新文件）；评审期间禁止任何写入，否则字节漂移会让评审失格。

---

## 9. 已知坑与运行前提（血泪清单）

1. **启动方式**：`cd divination-station && PORT=<port> npm start`（`node --experimental-strip-types server/index.ts`）。必须先在 `server/bootstrap.mjs` 求值（它注入 `GUANWEI_DATA_DIR=./data` 并注册 ESM 解析钩子，把 vendor 的 `.js`/无扩展名 import 解析到 `.ts`），新增文件里导入 vendor 一律写显式 `.ts` 后缀。
2. **bash 沙箱**：每次调用是独立 PID 命名空间，`setsid nohup` 起的进程在下一次调用就消失；**必须用后台 job 工具启动服务**（本会话里 3904 实例多次被 SIGTERM，重启即可）。
3. **不要 `pkill -f "server/index.ts"`**：会匹配到自己的 `bash -c` 命令行导致自杀（exit 143）；要写 `pkill -f 'server/inde[x].ts'`，且对沙箱外进程无效。旧的 3901 实例（改动前代码）可能仍在跑，需要用户在自己终端停掉。
4. **npm 缓存**：`~/.npm` 只读（EROFS），如需装包先 `export npm_config_cache=<workspace>/.npm-cache`。本计划不需要新依赖。
5. **数据与记录**：写入 `data/guanwei.db`（`divinations` + `divinations_access`）。测试时产生的记录会出现在管理页，按需清理。
6. **管理口令**：`.env` 里 `DIVINATION_ADMIN_TOKEN=…`；不设则 `/api/admin/*` 返回 503（记录照常写入）。
7. **AI**：`.env` 有真实 Key（MiMo/其他 OpenRouter 兼容），AI 解读会真实计费；批量验证 e2e 时**不要**点 AI 按钮，或把 AI 断言改为「按钮存在 + 未配 Key 回退」。
8. **verify-e2e 端口**：脚本默认 `http://127.0.0.1:3901`，实际实例端口不同时用 `VERIFY_BASE=http://127.0.0.1:<port>`。
9. **低性能模式红线**：新增页面里任何 `transition`/`animation`/`box-shadow`/`filter`/`backdrop-filter`/3D 属性都必须在 `html[data-perf="high"]` 前缀下；`verify-static` S1–S3 会卡。
10. **深度内容不入 DOM**：`.deep-body` 展开前必须是空字符串（e2e 会断言），不要「先渲染后隐藏」。
11. **农历/干支口径**：紫微用春节换年（`getYearGan()/getYearZhi()`），八字由引擎按立春/节气内部处理；两者不能混用。闰月按本月（`Math.abs(getMonth())`）并在页面注明。
12. **盘面一致性**：页面渲染出的每一项都要能在 `chartBrief` 里逐字找到（尤其紫微十二宫、八字四柱），避免「页面一套、AI 引用另一套」。

---

## 10. 完成定义（DoD）

- [ ] 9 术全部可从首页进入，`/bazi`、`/ziwei`、`/qimen`、`/liuren`、`/meihua`、`/xiaoliuren`、`/astrology` 无后缀可访问
- [ ] 每页：简要盘面默认渲染（高级感达标：深色 + 暗金 + 衬线大字 + 细线 + 留白）；深度默认不入 DOM，展开后含「盘面逐一证据 + AI 提示词 + 复制 + AI 解读」
- [ ] 每页双模式可切换、不刷新、状态零丢失；low 模式无任何动效/阴影/滤镜/3D
- [ ] `POST /api/chart` 七术全通，入库 + IP/UA + 管理页可查、可导出、可补生成 AI 解读
- [ ] `/api/prompt` 九术提示词均含「必须逐字引用」+ 对应 persona；AI 深度解读与提示词同源
- [ ] `verify-static`、`verify-arts`、`verify-e2e` 全绿；塔罗/六爻零回归
- [ ] 文档同步：README（页面/接口/九术说明）、`docs/design.md`（组件与双模式矩阵）、`docs/verify.md` §9

---

## 附录 A · 实测盘面事实样例（验收基准，页面须能复现）

**bazi**（1990-06-15 午时 男）
```
【四柱】庚午 年 / 壬午 月 / 辛亥 日（日主辛金）/ 甲午 时。年命纳音路旁土。
【天干十神】年干庚劫财、月干壬伤官、日干辛比肩、时干甲正财。
【五行分布】木2 火6 土3 金2 水3（含藏干加权）。
【旺衰】日主身弱（旺衰分 2.5：月令失令（午月火） +0.5；地支无根 +0；天干得势（比劫印星 2 位） +2）。
【用神喜忌】主用神土（印星）；喜印、比劫；忌财、官杀、食伤；调候：夏月炎燥，宜水调候（壬癸）。
【大运】顺行，约 8 岁起运；癸未（8岁）、甲申（18岁）、乙酉（28岁，2017-2026）、丙戌（38岁）…
【格局】七杀格——月支午本气丁（七杀），未透干，格气内藏。
```

**ziwei**（同上，农历五月廿三 午时）
```
【命盘】火六局（年命纳音路旁土），命宫子（戊子），身宫子，紫微落辰宫，大限顺行。
【生年四化】太阳化禄、武曲化权、太阴化科、天同化忌。
【十四主星落宫】紫微辰得、天机卯旺、太阳丑不、武曲子旺、天同亥庙、廉贞申庙、天府子庙…
【十二宫事实】命宫子｜武曲、天府｜辅天哭｜化权；夫妻宫戌｜破军｜辅文曲；子女宫酉｜无主星｜辅擎羊、铃星、红鸾…
【空宫借星】子女宫空借对宫天机、巨门；疾厄宫空借对宫太阳、太阴。
【格局】日月同宫(吉)、君臣庆会(吉)、禄马交驰(吉)。
```

**qimen**（当前时刻起局）
```
【局式】阴遁9局（立冬），日辛卯 时丙申，旬首甲午。
【值符值使】值符天心落2宫，值使开门落4宫。
【关键宫位】2宫：奇仪丙、门生、星天心、八神值符、暗干辛；4宫：奇仪癸、门开、星天芮…
```

**liuren**（当前时刻起课）
```
【课式】辛卯日 丙申时，卯将加时（立冬），昼占贵人午。
【四课】干上巳、干阴子、支上戌、支阴巳。
【三传】初传子（乘天后）、中传未（乘天空）、末传寅（乘螣蛇）。
【课体】常课——四课三传乘常气，事机明朗。
```

**meihua**（报数 7/13/5）
```
【起卦】山风蛊（本卦，整饬之象，革故鼎新），动爻第5爻。
【互卦】雷泽归妹（事之中）。【变卦】巽为风（事之归）。
【体用】体卦木、用卦土，用克体，凶。
```

**xiaoliuren**（农历五月十五 午时）
```
【掌诀】留连（凶，五行属水，主数二、八、十，方位南方）。留连事难成，求谋日未明…
```

**astrology**（1990-06-15 12:00 北京）
```
【命盘之纲】上升处女21.7°，太阳双子，月亮双鱼，中天双子。宫位制：whole-sign。
【行星入宫】太阳双子24°落10宫、月亮双鱼11°落6宫、水星双子5°落9宫[庙]、金星金牛18°落8宫[庙]…
【相位】月亮刑水星、月亮六合金星、月亮拱木星、水星六合火星、金星六合木星、金星拱土星、火星刑木星。
```

---

## 附录 B · 源码索引（实现时按图索骥）

| 用途 | 路径:行 |
|---|---|
| 九术调度 + 入参 schema | `vendor/guanwei/shared/core/engine/chart.ts:21` / `:57` |
| 八字引擎 | `vendor/guanwei/shared/core/engine/bazi.ts:44`（`baziCalc`） |
| 紫微引擎 | `vendor/guanwei/shared/core/engine/ziwei.ts:14`（`ziweiCalc`，安星在 :40-120） |
| 奇门 / 六壬 / 梅花 / 小六壬 / 占星 | 同目录 `qimen.ts:10`、`liuren.ts:218`、`meihua.ts:17`、`xiaoliuren.ts:6`、`astrology.ts:58` |
| 真太阳时 | `shared/core/engine/trueSolarTime.ts:40` |
| 输入输出类型 | `shared/core/types.ts:27`（`BaziInput`）、`:60`（`ZiweiInput`） |
| 盘面事实 | `vendor/guanwei/server/src/services/chartBrief.ts:7`（每术 brief 函数 :41 起） |
| 古籍断语 | `vendor/guanwei/server/src/services/duanyu.ts:58` |
| 九术 persona | `vendor/guanwei/server/src/services/skills.ts:18`（AGENTS，`agentOf` :116） |
| 六亲一致性（可选） | `vendor/guanwei/server/src/services/sixRelatives.ts:52` |
| 时辰未知约束文案 | `vendor/guanwei/server/src/services/promptBuilder.ts:74`（`hourUnknownNote`） |
| 结构化解说模板（可选参考） | `vendor/guanwei/server/src/services/promptBuilder.ts:11`（`MINGPAN_SAMPLE`）/ `:36`（`ZHANWEN_SAMPLE`） |
| 记录入库/补挂 | `vendor/guanwei/server/src/services/divineStore.ts`（`createDivination` / `attachReport` / `getDivination`） |
| 本项目提示词构建（待泛化） | `server/routes/prompt.ts:66`（硬约束）、`:152`（`buildPromptResponse`） |
| 本项目 AI 路由（待泛化 persona） | `server/routes/aiInterpret.ts:16`（`systemPrompt`） |
| 记录行/摘要/CSV | `server/services/readingLog.ts:114`（summary 分支）、`:176`（CSV） |
| 管理页 | `public/admin.html:41`（术数下拉）、`public/assets/admin.js` |
| 前端公共能力 | `public/assets/app.js:231`（`wireDeepPanel`）、`:305`（复制委托）、`:376`（`wireAi`）、`:431`（`window.DS` 导出） |
| 页面模板 | `public/tarot.html:1-33`（早读脚本 + topbar） |
| 六爻卦爻渲染（梅花复用） | `public/assets/liuyao.js`（`.gua-row` 线条与动爻标记） |
| 验证脚本 | `scripts/verify-static.mjs:29`（htmls 列表）、`scripts/verify-e2e.mjs:60`（evalIn/waitFor） |
| 部署/环境变量 | `README.md`（§2 环境变量、§3 页面、§4 API） |
