# 设计文档（design.md）——个人占卜小站（九术：塔罗 / 六爻 / 八字 / 紫微 / 奇门 / 六壬 / 梅花 / 小六壬 / 占星，双性能模式）

> 依据：`docs/research.md`（17 条参考、21 条要点）+ 用户原始规范。读者：前端工程师，照本文即可实现，无需再查参考站。
> 规则：本文中的数值（颜色值、毫秒、像素、选择器）即验收标准；「〔§x〕」指 research.md 对应小节。
> 日期：2026-11-11（初版：塔罗 + 六爻）；2026-11-13 扩展九术（新增七页与统一起盘 API，见 [plan-nine-arts.md](plan-nine-arts.md)）。实现形态：无框架原生 HTML/CSS/JS 静态页 + Express 静态托管；计算全部在服务端（观微 guanwei 引擎，`vendor/guanwei/shared/core`）。
>
> **相关文档**：[research.md](research.md)（本文依据，§5 要点）· [env.md](env.md)（环境与牌面资源）· [verify.md](verify.md)（端到端验证报告，九术验收见 §6）· [plan-nine-arts.md](plan-nine-arts.md)（九术接入计划与验收契约）· [README.md](../README.md)（部署与 API 样例）

---

## 0. 总则

1. **视觉一句话**：深底（#0a0a0f）+ 唯一金属色（暗金 #c9a84c）点缀 + 衬线标题 + 大留白 + 1px 细线语汇。金色只做线条/文字/小徽章，**占比 <15%**，禁止大面积金填充。〔§2.1/2.2〕
2. **动线一句话**：线性状态链，九术共用骨架——「前置输入 → 服务端定稿 → 错峰入场 → 交错翻牌/成卦/铺盘 → 简要盘面（scrollIntoView）→ 深度懒展开 → AI 提示词复制 → 重置」。塔罗/六爻保留仪式性编排；七术以盘面为主，入场只做格级淡入。〔§1.1/1.5〕
3. **性能一句话**：双性能模式 `data-perf="low|high"`，low 为默认；low 零动效零 3D、只载 480w WebP、深度不入 DOM；high 才有翻牌 3D、错峰、1200 AVIF。切换不刷新页面、信息零丢失。
4. **文件布局（建议，前端按此建）**：
   ```
   public/
     index.html          首页入口（九术分组卡）
     tarot.html          塔罗占卜        liuyao.html       六爻起卦
     bazi.html           八字命盘        ziwei.html        紫微斗数
     qimen.html          奇门遁甲        liuren.html       大六壬
     meihua.html         梅花易数        xiaoliuren.html   小六壬
     astrology.html      西方星盘
     assets/styles.css   全站样式（token + 组件 + 双模式 + 第 20 节九术盘面）
     assets/app.js       全站脚本（状态链 + 模式切换 + 懒注入 + 复制/Toast + 表单助手）
     assets/{tarot,liuyao,bazi,ziwei,qimen,liuren,meihua,xiaoliuren,astrology}.js  各页脚本
     img/cards/480/<slug>.webp        （构建产物，脚本已就位）
     img/cards/1200/<slug>.webp|.avif
   ```
   图片产物命名来自 `scripts/encode_cards.py`（`public/img/cards/{480,1200}/<slug>.{webp,avif}`；AVIF 仅 1200 档生成）。

---

## 1. 信息架构与页面线框

### 1.1 站点地图

```
index.html（首页入口，九术分三组）
 ├─ 命盘组：bazi.html 八字 · ziwei.html 紫微 · astrology.html 占星
 ├─ 占问组：liuyao.html 六爻 · qimen.html 奇门 · liuren.html 六壬
 │          · meihua.html 梅花 · xiaoliuren.html 小六壬
 └─ 牌类组：tarot.html 塔罗
运营：admin.html（起占记录，口令保护；不在首页入口暴露）
公共 chrome：顶栏（站名 + 性能模式 toggle）｜页脚（免责声明 + 机制说明）
无导航栏之外的栏目；无账号、无历史、无统计。
```

### 1.2 页面 A：首页入口（index.html）

```
┌──────────────────────────────────────────────────────────────┐
│ .topbar  「观微卜影」              性能模式 [ 流畅 ● | 精致 ]      │
├──────────────────────────────────────────────────────────────┤
│  .hero（居中，上下留白 ≥64px）                                   │
│            ◆  观 微 卜 影  ◆      ← h1 30px 衬线 ls .2em        │
│    占问所得，仅供修身养性、怡情遣兴之用      ← 辅助说明 12.5px 灰      │
│  ────────────────── ◆ ──────────────────   ← .rule 分隔线      │
│  .entry-grid（2 列；≤640px 单列）                               │
│  ┌─────────────────────────┐  ┌─────────────────────────┐     │
│  │ .entry-card              │  │ .entry-card              │     │
│  │ 01 / TAROT   ← 小标签     │  │ 02 / LIUYAO              │     │
│  │ 塔罗占卜      ← 牌名级标题   │  │ 六爻起卦                   │     │
│  │ 78 张韦特牌面，牌阵自选，     │  │ 纳甲筮法，摇卦定爻，          │     │
│  │ 抽牌与正逆位由服务端定稿。    │  │ 本卦变卦、世应动爻全列。       │     │
│  │ [ 进 入 卜 问 → ]          │  │ [ 进 入 起 卦 → ]          │     │
│  └─────────────────────────┘  └─────────────────────────┘     │
│  <details class="deep-panel">「抽牌机制与概率」…（可含 30% 逆位说明）│
├──────────────────────────────────────────────────────────────┤
│ .footer  免责声明（§2.5 全文）+ 「服务端计算 · 无遥测」              │
└──────────────────────────────────────────────────────────────┘
```

元素清单：`.topbar` / `.perf-toggle`（§2.5-1）/ `.hero h1` / `.entry-grid > .entry-card`×2（金线卡片）/ `.rule` / `details.deep-panel` / `.footer`。

### 1.3 页面 B：塔罗占卜（tarot.html）——线性状态链

状态链（JS 单一状态对象驱动，按钮禁用态随状态切换）〔§1.5〕：

```
S0 选牌阵 → S1 提问(可选) → [洗牌并抽牌 btn，未选牌阵时 disabled]
   → S2 服务端 POST 抽牌（定稿：牌 + 正逆位，逆位率 30% 服务端给出）
   → S3 牌面错峰入场（high）→ S4 交错翻牌（high）/瞬时翻面（low）
   → S5 简要结果 + scrollIntoView → S6 深度懒展开 → S7 AI 提示词复制 → S8 重置
```

```
┌──────────────────────────────────────────────────────────────┐
│ .topbar  「观微卜影 / 塔罗占卜」          性能模式 [ 流畅 | 精致 ]    │
├──────────────────────────────────────────────────────────────┤
│ .step  STEP 01 · 选择牌阵                     ← 小标签 11px 大写   │
│ .spread-grid（牌阵选择卡，取自 GET /spreads）                     │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│ │ 一张牌        │ │ 过去-现在-未来 │ │ 问题-障碍-建议-结果│ …（≤640px 单列）│
│ │ 直觉指引      │ │ 三张牌时序     │ │ 四张牌解题       │            │
│ └──────────────┘ └──────────────┘ └──────────────┘            │
│ .step  STEP 02 · 心中的问题（可选）                              │
│ ┌──────────────────────────────────────────────────────┐      │
│ │ textarea#question  placeholder：                       │      │
│ │ 「感情走向如何？/ 事业该往哪走？/ 眼下困境怎么破？/ 近期契机在哪？」│      │
│ └──────────────────────────────────────────────────────┘      │
│ .chips  示例问题（点击填入）：感情走向 · 事业方向 · 眼下困境 · 近期契机  │
│ .hint   「问题不改变抽到哪些牌；请控制在 300 字以内。」               │
│ .category  问题分类 select：综合/感情/事业/财运/学业/健康/人际          │
│ [ ✦ 洗 牌 并 抽 牌 ]  ← .btn-primary，S0 时 :disabled            │
├──────────────────────────────────────────────────────────────┤
│ #result（S3 起渲染；S5 scrollIntoView 到此）                     │
│ .rule ───────────────── ◆ ─────────────────                    │
│ .step  STEP 03 · 简要结果                                      │
│ .card-row（牌阵槽位，横排 flex；≤640px 两列/单列）                  │
│  ┌ .card-slot --i:0 ──┐  ┌ .card-slot --i:1 ──┐               │
│  │ [牌位编号徽章 01]      │  │ [02]                 │               │
│  │ .card-inner（翻牌）    │  │ …                    │               │
│  │  .card-face--back    │  │                      │               │
│  │  .card-face--front   │  │                      │               │
│  │ 牌名「愚者」← 20px 衬线│  │                      │               │
│  │ 逆位 徽章（若 isReversed）│ │                      │               │
│  │ 关键词：新开端 · 冒险   │  │                      │               │
│  │ 一句摘要 ≤40 字        │  │                      │               │
│  └─────────────────────┘  └─────────────────────┘               │
│ [ ⌄ 展开深度解读 ]   ← details.deep-panel summary               │
│ [ 复制 AI 解读提示词 ]（深度区内，§2.5-7）                          │
│ [ ↺ 重新占卜 ]  ← 回 S0，保留问题文本                              │
├──────────────────────────────────────────────────────────────┤
│ .footer  免责声明                                                 │
└──────────────────────────────────────────────────────────────┘
```

要点：抽牌按钮 disabled 规则〔§1.5〕；提问明示「不影响抽牌」〔§1.1〕；示例问题 chips〔§1.1/1.4〕；结果区 scrollIntoView（high `behavior:'smooth'`，low `'auto'`）。

### 1.4 页面 C：六爻起卦（liuyao.html）——与塔罗同构

状态链：`S0 起卦前置（问题可选 + 分类）→ [起卦 btn] → S2 服务端定爻（LiuyaoResult）→ S3 成卦呈现（high 错峰点亮六爻，自初爻向上）→ S5 简要结果 → S6 深度懒展开 → S7 复制 → S8 重新起卦`。无「选牌阵」步，六爻即一卦。

```
┌──────────────────────────────────────────────────────────────┐
│ .topbar  「观微卜影 / 六爻起卦」          性能模式 [ 流畅 | 精致 ]    │
├──────────────────────────────────────────────────────────────┤
│ .step STEP 01 · 所问何事（可选）                                │
│ textarea#question + .chips 示例 + .category 分类（同塔罗页）       │
│ .hint 「一事一占；问题不改变摇卦结果；300 字以内。」                  │
│ [ ◆ 起 卦 ]  ← .btn-primary                                   │
├──────────────────────────────────────────────────────────────┤
│ #result                                                        │
│ .step STEP 02 · 简要结果                                       │
│ .gua-brief（金线卡片）                                          │
│   本卦 「火水未济」← 卦名 20px 衬线    卦宫：离宫（游魂）              │
│   变卦 「火风鼎」（若有动爻；无动爻写「无动爻，卦不变」）                │
│   世爻：三爻 ◆ 应爻：上爻            动爻：二爻、五爻                 │
│ .hexagram（六爻行，自下而上 初→上）                                │
│   上九 ▅▅▅▅▅   ○ 动   ← .yao-row                            │
│   六五 ▅▅　▅▅   × 动                                         │
│   九四 ▅▅▅▅▅   [世]                                        │
│   六三 ▅▅　▅▅                                               │
│   九二 ▅▅▅▅▅   [应]                                        │
│   初六 ▅▅　▅▅                                               │
│ [ ⌄ 展开深度解读 ]  [ 复制 AI 起卦提示词 ]  [ ↺ 重新起卦 ]           │
├──────────────────────────────────────────────────────────────┤
│ .footer  免责声明                                                 │
└──────────────────────────────────────────────────────────────┘
```

爻象字符用 Unicode（`▅▅▅▅▅` / `▅▅　▅▅`），动爻标记 `○`（阳动）/`×`（阴动）——纯文本零图片。变卦爻行在深度面板给（简要只给变卦卦名）。

### 1.5 命盘/占问七页（bazi / ziwei / qimen / liuren / meihua / xiaoliuren / astrology）

七页与塔罗、六爻共用同一骨架与同一套 chrome（顶栏 + 性能 toggle + 页脚免责），差异只在「起盘表单」与本术盘面：

```
STEP 01 出生 / 起局信息（.form-grid；或 #mode 双模式表单）
STEP 02 所问之事（可选：textarea#question ≤300 字 + 分类 select + 起盘按钮）
STEP 03 简要盘面（服务端 chartBrief 定稿）→ details.deep-panel 懒展开「证据 + 提示词 + AI」
```

| 页面 | 起盘输入 | 简要布局（词汇见 §2.5-12） | 深度内容 |
|---|---|---|---|
| bazi.html 八字 | 公历生日 + 时辰索引（含「时辰未知」-1）+ 性别 + 可选经度 | 四柱 4×3（柱名/天干/地支）+ 日主·旺衰·用神 3 格 + 五行（藏干加权）5 格 + 当前大运/流年 2 格 | 逐柱十神·藏干 / 旺衰拆解 / 用神喜忌 / 格局·神煞 / 胎元·命宫·身宫 / 大运 8 步 / 提示词 |
| ziwei.html 紫微 | 同上（服务端换算农历年干支、农历月日、时辰） | 4×4 十二宫棋盘（地支寅起顺行，命宫起逆布）+ 中心 2×2（五行局/命宫/身宫/紫微落宫/当前大限/昼夜）+ 大限·流年 2 格 | 十二宫事实逐字 / 生年四化落宫 / 辅星全列 / 有效亮度 / 空宫借星 / 格局 / 大限 12 步 / 提示词 |
| astrology.html 占星 | 公历生日 + 出生时刻（24h）+ 经纬度（默认 116.4/39.9） | 日月升 3 格（上升 `.is-key`）+ 七行星 7 格（星座/度数/宫位/庙旺/逆行） | 十二宫 / 相位 / 庙旺与逆行 / 命盘事实逐字 / 断语 / 提示词 |
| qimen.html 奇门 | 起局时刻（默认现在，可改为所念之事时刻） | 值符/值使 2 格 + 洛书九宫 3×3（宫号/奇仪/门/星/八神，值符值使宫 `.is-key`） | 局式 / 九宫细目 / 断语 / 提示词 |
| liuren.html 六壬 | 起课时刻（同上） | 四课 4 格（干上/干阴/支上/支阴）+ 三传 3 格（含天将） | 四课三传与课体说明 / 天地盘十二位 / 十二天将布宫 / 断语 / 提示词 |
| meihua.html 梅花 | 时间起卦（时刻）或报数起卦（n1/n2/n3 1–999） | 本卦·互卦·变卦 3 格（六爻线条 + 动爻标记）+ 体用 3 格（体/用/生克） | 三卦六爻 / 卦辞象曰 / 体用旺衰 / 断语 / 提示词 |
| xiaoliuren.html 小六壬 | 时辰起课（公历日期 + 时辰）或报数 | 六掌诀横排（命中 `.is-key`）+ 吉凶/五行/主数/方位 + 断语诗 | 三步推算 / 六神全表 / 诀辞 / 断语 / 提示词 |

契约要点：
- **前端零计算**：盘面、干支、星曜、宫位、断语全部来自 `POST /api/chart` 的 `resultRaw` 与 `brief`；页面只用 `resultRaw` 查表渲染，`brief` 原样展示并可交叉核对。
- **记录一致**：结果区 `.result-meta` 展示记录 id（`d_…`）；`/admin.html` 自动出现同一条记录，summary 由服务端 `readingLog.toRow()` 按术生成。
- **深度懒注入**：`details.deep-panel[data-result="1"]` 首次展开才请求 `/api/prompt`；注入顺序固定为「逐项证据 → AI 解读提示词（textarea + 复制 + AI 按钮）→ AI 输出区」。

---

## 2. 设计 token 与组件清单

### 2.1 颜色 token

```css
:root {
  --bg:        #0a0a0f;   /* 页面底 */
  --bg-2:      #0d0d12;   /* 次级面：卡片、深度面板 */
  --bg-3:      #12121a;   /* 输入框/选中底 */
  --gold:      #c9a84c;   /* 暗金：线条/边框/小标签/强调，占比 <15% */
  --gold-line: rgba(201,168,76,.38);   /* 常态金线（卡片/分隔） */
  --gold-dim:  rgba(201,168,76,.14);   /* 克制高亮底（low/high 世应弱底色；high 另叠金线） */
  --teal:      #8fbcbb;   /* 次强调：链接、hover、六爻动爻标记 */
  --fg:        #e8e4da;   /* 象牙白正文 */
  --fg-dim:    #6b6b70;   /* 辅助说明 */
  --danger:    #b3574a;   /* 逆位/警示徽章（仅文字与 1px 边框） */
}
```

规则：任何视口内金色元素（线条+文字+徽章）总面积 <15%；hover 反转按钮是唯一允许的金填充面且同时只有一个；禁渐变、禁第二金属色。〔§2.1/2.2〕

### 2.2 排版 token（字号层级：牌名/卦名 > 关键词 > 正文 > 辅助说明）

```css
:root {
  --font-serif: Georgia, 'Songti SC', 'SimSun', serif;   /* 标题/牌名/卦名/卦爻辞 */
  --font-body:  -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
```

| 层级 | 用途 | 字号/行高 | 字体族 | 字距 | 颜色 |
|---|---|---|---|---|---|
| h1 页面主标题 | 站名/页题 | 30px（≤640px 24px）/1.2 | 衬线 | .2em | --fg |
| h2 分区标题 | STEP 标题 | 13px 大写/1.4 | 无衬线 | .22em | --gold |
| **牌名/卦名** | 卡牌名、本卦变卦名 | **20px**（≤640px 17px）/1.3 | 衬线 | .04em | --fg |
| **关键词** | 牌关键词、卦宫/六亲标签 | **15px**/1.5 | 衬线 | .05em | --teal（逆位时 --danger） |
| **正文** | 摘要、深度正文 | **15px/1.7**（≤640px 14px） | 无衬线 | 0 | --fg |
| **辅助说明** | 牌位描述、hint、页脚 | **12.5px/1.6** | 无衬线 | .02em | --fg-dim |
| 小标签 eyebrow | 01 / TAROT 等 | 11px 大写/1.4 | 无衬线 | .22em | --gold |

标题只用衬线；小字号中文正文用无衬线保证可读；层级靠「字号 + 字体族 + 颜色」三重区分。〔§2.1/2.2/3.4〕

### 2.3 间距 / 边框 / 圆角 / 容器

- 间距刻度（4px 基）：`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`；组件内边距 16px，卡片间 16px，STEP 区块间 48px（≤640px 32px），hero 上下 64px。
- 容器：`.container { max-width: 900px; margin: 0 auto; padding: 0 24px; }`。
- 细线边框：常态 `1px solid var(--gold-line)`；强调（选中卡、结果牌面框）`1px solid var(--gold)`。**全站无第 2 种边框宽度**（禁 2px 粗框）。
- 圆角：`--r-sm: 2px; --r-md: 4px;`——**任何元素圆角 ≤4px**。〔§2.2〕
- 菱形装饰语汇（唯一装饰）：分隔线中央 `◆`、卡片角落 4px `◆`、徽章用菱形/圆形细线框。

### 2.4 动效 token

- 时长：400–700ms；缓动统一 `cubic-bezier(.4,.2,.2,1)`（翻牌）与 `ease`（入场/过渡）；无弹跳、无旋转装饰。〔§2.1/3.4〕
- **全部动效声明只出现在 `html[data-perf="high"]` 选择器下**；low 模式补一条防御性 reset（§3.2-1）。只动 `transform`/`opacity`/`max-height`/颜色；禁 `will-change`、禁 `translateZ(0)`。〔§3.4〕

### 2.5 组件清单（8 个必选 + 3 个随页 + 3 个九术通用）

**2.5-1 性能模式 toggle**（顶栏右侧）
- 结构：`<button class="perf-toggle" role="switch" aria-checked="false">性能模式 <b class="perf-state">流畅</b></button>`；文案随状态在「流畅」↔「精致」切换。
- 样式：11px 大写小标签样式 + 1px 金线胶囊（radius 999px 例外？否——用 `--r-md: 4px` 矩形，保持圆角纪律）；选中侧文字 --gold。
- 行为：点击即 `document.documentElement.dataset.perf = 'low'|'high'` + `localStorage.setItem('divination.perf', mode)`；**不刷新页面**（§3.3）。

**2.5-2 按钮**（`.btn` / `.btn-primary` / `:disabled`）
```css
.btn { font: 11px/1 var(--font-body); letter-spacing: .15em; padding: 12px 28px;
  border: 1px solid var(--gold); border-radius: 2px; background: transparent; color: var(--gold);
  cursor: pointer; }
html[data-perf="high"] .btn { transition: background-color .25s ease, color .25s ease; }
.btn:hover { background: var(--gold); color: var(--bg); }   /* 金线按钮 hover 反转〔§2.2〕 */
.btn:disabled { border-color: var(--gold-line); color: var(--fg-dim); cursor: not-allowed; background: transparent; }
```
主按钮（抽牌/起卦）全大写加字距：`洗 牌 并 抽 牌`。

**2.5-3 牌阵选择卡**（`.spread-card`）
- 结构：`<button class="spread-card" aria-pressed="false">` + `.eyebrow`（序号 01/02…）+ 名称（牌名级 17px 衬线）+ 一句定位描述（辅助说明级）。
- 样式：`--bg-2` 底 + 1px `--gold-line` 边框 + 右上角 4px `◆`；hover 边框转 `--gold`（high 加 `transform: translateY(-4px)`，low 瞬时只换边框色）〔§3.4〕；`.is-selected` = `--gold` 边框 + `--gold-dim` 底 + `aria-pressed="true"`。
- 布局：`.spread-grid` flex wrap，卡宽 `(900-16n)/3` 近似 `minmax(240px, 1fr)`；≤640px 单列。

**2.5-4 牌面卡（翻牌容器）**（`.card-slot > .card-inner > .card-face--back + .card-face--front`）
- 尺寸：桌面 130×200px，≤640px 108×168px。〔§3.4〕
- 牌背：`--bg-2` 底 + 1px 金线框 + 中央 `◆` 线描纹样（CSS 细线，无图片）。
- 牌面：`<picture>`（§3.2-5）+ 下方文字区（牌名/正逆位徽章/关键词/一句摘要）。
- 逆位表达：`.is-reversed` **只换语义类**——边框/关键词色转 `--danger` + 文字徽章「逆位」，**不旋转几何、不动 transform**。〔§3.4〕

**2.5-5 牌位编号徽章**（`.pos-badge`）
- `<span class="pos-badge">01</span>`（两位补零）+ 牌位名（如「过去」）。11px 大写、1px 金线菱形/圆形框、直径 22px；在牌面上浮 `-10px` 偏移。爻位版本复用：`[世]`/`[应]` 徽章用 `--teal` 文字。

**2.5-6 分隔线**（`.rule`）
```css
.rule { border: 0; border-top: 1px solid var(--gold-line); position: relative; margin: 48px 0; }
.rule::before { content: "◆"; position: absolute; left: 50%; top: -7px; transform: translateX(-50%);
  font-size: 8px; color: var(--gold); background: var(--bg); padding: 0 8px; }
```

**2.5-7 details 深度面板**（`.deep-panel`）与 **2.5-8 复制按钮**（`.btn-copy`）
- 结构：`<details class="deep-panel"><summary>⌄ 展开深度解读</summary><div class="deep-body"><!-- 懒注入 --></div></details>`；深度内容（AI 解读全文、逐爻证据）**首次展开时才注入 DOM**（low 强制、high 同一路径）。〔§5-9〕
- high 展开过渡（max-height）：
```css
html[data-perf="high"] .deep-body { overflow: hidden; max-height: 0; opacity: 0;
  transition: max-height .5s ease, opacity .5s ease; }
html[data-perf="high"] .deep-panel.is-open .deep-body { max-height: 4000px; opacity: 1; }
```
  JS：`details.open = true` → 注入内容 → `setTimeout(() => details.classList.add('is-open'), 30)`（与翻牌同为 setTimeout 纪律，零 rAF）。low：同一注入流程但无过渡（瞬时显示）。
- 复制按钮：`<button class="btn btn-copy">复制 AI 解读提示词</button>`；点击 `navigator.clipboard.writeText(prompt)`，失败降级隐藏 textarea + `document.execCommand('copy')`；成功后文案 →「已复制 ✓」，1500ms 后复原（`setTimeout`）；同时 `showToast('提示词已复制')`。〔§5-13〕
- 提示词模板（textarea readonly 可见 + 一键复制）：
  - 塔罗：`你是一位塔罗解读师。我的问题是：{question}（分类：{category}）。牌阵：{spread.name}。抽到：{position.name} 位 {card.name}{正位|逆位}…。请结合牌位与正逆位给出解读，并给一句可执行建议。`
  - 六爻：`你是一位六爻解卦师。所问：{question}（分类：{category}）。起卦时间：{date}。本卦 {benGua.name}（{gong}），变卦 {bianGua.name}，动爻 {dongYao}，世爻 {shiPos} 应爻 {yingPos}，日月：{dayGZ}/{monthZhi}，旬空 {xunKong}、月破 {yuePo}。请按用神、旺衰、动变断吉凶。`

**2.5-9 Toast**（`#toast`）
- `<div id="toast" role="status" aria-live="polite"></div>`，fixed bottom 32px 居中，`--bg-2` 底 + 1px 金线，正文级文字；`showToast(msg)` 显示 1800ms 后 `setTimeout` 移除 `.is-show`。
- low：`display:none↔block` 瞬时；high：`.is-show { animation: toastIn .3s ease both; }`（opacity 0→1 + translateY(8px)→0）。

**2.5-10 输入组**（textarea / chips / select）：`--bg-3` 底、1px `--gold-line` 边框、radius 2px、正文 15px；聚焦边框 `--gold`（无光晕无阴影）。chips 为小号 `.btn` 样式（padding 6px 14px），点击填入 textarea。

**2.5-11 爻位行**（`.yao-row`）：`爻题(九二) + 爻象字符 + 干支 + [六亲][六神] + [世|应] 徽章 + 动爻标记`；行高 44px，1px 底线 `--gold-line`；动爻行标记 `--teal`。

**2.5-12 盘面容器与格子**（`.pan` / `.pan-head` / `.pan-grid` / `.pan-cell`）——九术通用
- 结构：`<section class="pan"><div class="pan-head"><span class="pan-title">标题</span><span class="pan-meta">副信息</span></div><div class="pan-grid cols-N">…</div></section>`；格内用 `.pan-cell-title / .pan-cell-main / .pan-cell-sub` 三级文字。
- 样式：`.pan` = `--bg-2` 底 + 1px `--gold-line`；`.pan-grid` 用 `repeat(var(--pan-cols,3), minmax(0,1fr))` + 1px gap（由金线充当分隔线）；`.pan-cell` min-height 64px；`.is-key` = `--bg-3` 底 + 左侧 2px 金线（**静态**，两模式同款——重点不靠动画表达）。列数修饰 `.cols-2/3/4/7`（默认 3）。
- 内容词汇（**必须复用，不自行发明新类名**）：`.gz`（干支/星座，衬线 20px 暗金）、`.wx`（五行徽章 12.5px）、`.star`（星曜 15px，`.is-minor` 灰 12.5px）、`.badge`（12px 细线标签，`.is-key` 金）、`.mono`（等宽数字/事实行）、`.chart-brief`（简要盘面文字块）。

**2.5-13 表单助手**（`DS.birthForm` / `DS.momentForm`）
- 出生表单：日期 `input[type=date]` + 时辰 `select`（`-1=时辰未知`，仅八字/紫微）+ 性别 + 可选经度；统一 `.form-grid`（2 列，`.span-2` 跨列），标签 `.field-label`，控件 `.field`。
- 时刻表单：`input[type=datetime-local]`，预填本地当前分钟；`readMomentForm` 空值 → 请求不带 `datetime`（服务端默认现在）。
- 校验：日期必需、经度 ±180、纬度 ±90、时 0–23/分 0–59；失败 `throw new Error(可读文案)`，页面 `catch` 后 `DS.showToast`。

**2.5-14 盘面格错峰入场（high 专属）**
```css
@keyframes pan-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
html[data-perf="high"] .pan-cell { animation: pan-in .16s ease both; animation-delay: calc(var(--i, 0) * 28ms); }
```
- 仅 opacity/translateY（4px 内），单格 ≤0.16s；`--i` 由页面脚本按格序写入；low 用同一份 DOM 静态呈现、零动画。deep 面板展开仍按 §2.5-7 的 `max-height` + `opacity` 过渡（high 专属）。

---

## 3. 双性能模式矩阵（CSS 选择器级实现要点）

### 3.1 机制

- `data-perf="low|high"` 挂 `<html>`；**默认 low**（首访无记录即 low）。
- 防闪烁早读脚本（每个 `<head>` 内联、样式表之前）：
  ```html
  <script>document.documentElement.dataset.perf =
    localStorage.getItem('divination.perf') === 'high' ? 'high' : 'low';</script>
  ```
- 切换实现：`document.documentElement.dataset.perf = mode; localStorage.setItem('divination.perf', mode);`——**零 reload、零重渲染**。

### 3.2 矩阵（逐条；左列即验收条目）

| # | 能力 | low（默认）`html[data-perf="low"]` | high `html[data-perf="high"]` |
|---|---|---|---|
| 1 | transition/animation 总开关 | 防御 reset：`html[data-perf="low"] *, html[data-perf="low"] *::before, html[data-perf="low"] *::after { transition: none !important; animation: none !important; }`；**代码里一切 transition/animation 声明必须以 `html[data-perf="high"]` 为前缀** | 声明生效；统一 400–700ms |
| 2 | box-shadow / filter / backdrop-filter | 禁（全站禁令，low 再叠 reset：`box-shadow:none !important; filter:none !important; backdrop-filter:none !important;`） | 同样禁（高级感来自细线与留白，不靠阴影）〔§2.1〕 |
| 3 | 3D / WebGL / 粒子 / rAF | 零 3D 上下文、零 canvas、零 rAF（翻面=瞬时换面） | 仅翻牌一处 CSS 3D（下一行）；仍零 WebGL/粒子/rAF |
| 4 | 翻牌 | `html[data-perf="low"] .card-inner { transform: none; }` `html[data-perf="low"] .card-face--front { display: none; }` `html[data-perf="low"] .card-inner.is-flipped .card-face--front { display: block; }` `html[data-perf="low"] .card-inner.is-flipped .card-face--back { display: none; }`——加 `.is-flipped` 瞬时翻面 | `.card-slot { perspective: 1000px; }`；`.card-inner { transform-style: preserve-3d; transition: transform .7s cubic-bezier(.4,.2,.2,1); }`（**全卡仅此一条 transition**）；`.card-inner.is-flipped { transform: rotateY(180deg); }`；双面 `.card-face { backface-visibility: hidden; }`；正面预旋转 `transform: rotateY(180deg)`；JS 只 `setTimeout(() => inner.classList.add('is-flipped'), 600 + i*180)` 错峰〔§3.3/3.4/3.5〕 |
| 5 | 入场错峰 | 无动画；内容一次性呈现 | `@keyframes slotIn { from { opacity:0; transform: translateY(18px);} to { opacity:1; transform:none;} }`；`html[data-perf="high"] .card-slot { animation: slotIn .5s ease both; animation-delay: calc(var(--i) * 180ms); }`（`--i` 由 JS 按槽位写入；与翻牌两段编排，总时长 `600 + 张数×180 + 700`ms 内闭环）〔§3.4〕 |
| 6 | 牌面图片 | 只载当前展示所需 **480w WebP**：`<img src="/img/cards/480/<slug>.webp" width="130" height="200" loading="lazy" decoding="async">`；`#result` 之外不预载、不请求 1200/AVIF | `<picture>`：`<source type="image/avif" srcset="/img/cards/1200/<slug>.avif">` → `<source type="image/webp" srcset="/img/cards/480/<slug>.webp 480w, /img/cards/1200/<slug>.webp 1200w" sizes="(max-width: 640px) 108px, 130px">` → `<img>` JPEG/WebP 回退 + 固有 width/height 防 CLS〔§3.1/3.2〕 |
| 7 | 深度 DOM（AI 解读全文 / 逐爻证据） | **默认不入 DOM**；展开 `details` 时懒注入，收起后保留注入（不重复请求） | 同一懒注入路径（单代码路径）；差异仅在展开动效 |
| 8 | details 展开 | 瞬时显示（无过渡） | `max-height: 0 → 4000px` + `opacity` 过渡 .5s（§2.5-7 代码） |
| 9 | 当前牌位 / 世应爻高亮 | **静态 `--gold-dim` 弱底色**（`.yao-row.is-shi, .yao-row.is-ying` 两模式皆有，无动画无金线）+ 静态徽章（牌位名、`[世]`/`[应]` 文字）——低性能模式保留此微弱底色差异作静态质感 | 克制增强：同款弱底色 + 金线 `html[data-perf="high"] .yao-row.is-shi, html[data-perf="high"] .yao-row.is-ying { background: var(--gold-dim); border-left: 1px solid var(--gold); }`；翻牌编排期 `.card-slot.is-active .card-face { border-color: var(--gold); }`，编排结束移除——无光晕、无阴影 |
| 10 | Toast | `display` 瞬时切换 | `.is-show` 加 `toastIn .3s ease both` |
| 11 | hover 微动效 | 只换边框/文字色 | 按钮反转 .25s、卡片 `translateY(-4px)` .25s（仅 transform）〔§3.4〕 |
| 12 | scrollIntoView | `behavior: 'auto'` | `behavior: 'smooth'` |
| 13 | prefers-reduced-motion | 无需处理（本就无动效） | `@media (prefers-reduced-motion: reduce) { html[data-perf="high"] *, html[data-perf="high"] *::before, html[data-perf="high"] *::after { transition-duration: .01ms !important; animation-duration: .01ms !important; animation-delay: 0ms !important; } }` + JS 翻牌 setTimeout 全部置 0（一次翻完）〔§5-7〕 |
| 14 | 九术盘面格（`.pan-cell`） | 静态呈现（无入场动画；`.is-key` 底色/金线照常可见） | `pan-in` 0.16s 错峰淡入（`animation-delay: calc(var(--i) * 28ms)`），仅 opacity/translateY(4px)；盘面内容不重排、不跳变 |

### 3.3 切换语义（不刷新 + 零丢失，逐条保证）

1. toggle 只改 `dataset.perf` 与 localStorage；**DOM 节点不重建**（同一批节点，身份不变）。
2. 已渲染结果保持：抽牌/起卦结果、已翻牌状态（`.is-flipped` 保留）、已注入深度面板及其 `open` 状态、问题输入、选中牌阵、问题分类、滚动位置——全部原样。
3. **不重放动画**：low→high 不给已显示的牌补翻牌/入场动画（仅对之后新抽的牌生效）；high→low 已翻牌直接处于终态（transition:none 下无跳变）。
4. 图片即时重写：切换时 JS 遍历 `#result picture` 重写 source/srcset 为对应档位（浏览器缓存命中则无感）；文字与状态一概不动。
5. 模式状态在顶栏 toggle 文案实时可见（流畅/精致），`aria-checked` 同步。

---

## 4. 简要结果 vs 深度结果内容清单

### 4.1 分层原则

- **简要层**：点击抽牌/起卦后 ≤2s 必达（本地服务端天然满足〔§1.3〕），首屏只含简要层 DOM。
- **深度层**：`details.deep-panel` 懒注入；含完整解读与 AI 提示词复制（AI 解读 = 复制提示词到任意大模型，**不内嵌 LLM**〔§4.3〕）。
- 免责声明常驻页脚（两页 + 首页同文）：「本占卜仅供娱乐与自我觉察，不预测未来，也不构成医疗、心理、法律或财务决策依据。」〔§1.1/5-14〕

### 4.2 塔罗（tarot.html）

| 层 | 内容（逐项） | 数据来源（引擎字段） |
|---|---|---|
| **简要** | ① 牌名（中文 20px 衬线 + 英文小标签）② 正逆位（徽章「正位/逆位」；逆位整卡 `.is-reversed`）③ 1–2 个关键词 ④ 一句摘要（≤40 字，「牌位 + 关键词」合成）⑤ 牌位编号徽章 + 牌位名 | `POST /draw` → `DrawnCard{cardId,isReversed,positionId}`；`GET /cards` → `TarotCard{name,nameEn,keywords}`；`Spread.positions[].name/description` |
| **深度** | ① 完整正位义 / 逆位义（分栏或分段）② 牌阵位解读（该牌落在该位的解读段）③ 问题语境段（opening/overview）④ 行动建议 + 提示/警示段 ⑤ **AI 解读提示词复制按钮** | `POST /interpret` → `InterpretationResult{sections[]}`（section.type = opening/overview/card/esoteric/life-action/warning/summary）；`TarotCard.meanings.upright/reversed`、`deepMeaning` |

### 4.3 六爻（liuyao.html）

| 层 | 内容（逐项） | 数据来源（引擎字段） |
|---|---|---|
| **简要** | ① 本卦卦名（+卦宫）② 变卦卦名（无动爻则「无动爻，卦不变」）③ 世爻/应爻位置（`[世]`/`[应]` 徽章）④ 动爻标记（爻行 `○/×` + 动爻位列表） | `LiuyaoResult{benGua,bianGua,dongYao,najia{gong,shiPos,yingPos}}` |
| **深度** | ① 逐爻表：爻位/爻象/干支/**六亲**/**六神**/**旺衰**/世应/空破 ② **用神候选**徽章（按问题类别→六亲映射标注候选爻，并给 `shiLiQin` 世爻六亲作参考）③ 变卦对应爻 ④ 卦辞/爻辞（`GuaEntry.ci/xiang`）⑤ **AI 起卦提示词复制按钮** | `najia.lines[]{gz,ganWx,zhiWx,liuqin,shen,isShi,isYing,kong}`、`{dayGZ,monthZhi,yuePo,xunKong,shiLiQin}`；旺衰为展示层推导（下） |

- **旺衰推导规则（展示层，纯函数）**：月支五行 vs 爻支五行——同者「旺」、月生爻「相」、爻生月「休」、爻克月「囚」、月克爻「死」；输入仅 `najia.monthZhi` + `lines[].zhiWx`。
- **用神候选映射（问题分类 select → 六亲）**：综合→世爻；财运→妻财；事业/官职→官鬼；学业/文书/合同→父母；子女/创作→子孙；健康→官鬼（忌）与世爻并标；人际/竞争→兄弟。同六亲多爻时全部标注「用神候选」，不擅自取舍。

### 4.4 「一句摘要」生成（塔罗简要层，前端模板）

`{position.name}位：{关键词1}与{关键词2}在此位上提示{正位→「顺势而为」|逆位→「先内观再行动」}。`——固定模板、≤40 字，不含任何断言式预测（合规口径）。

### 4.5 七术（命盘 / 占问）分层

| 层 | 内容（共通 + 本术证据） | 数据来源 |
|---|---|---|
| **简要** | `.chart-brief` 服务端文案（逐字，≤1 屏）+ 本术盘面（布局见 §1.5）：四柱 / 棋盘 / 九宫 / 四课三传 / 三卦 / 掌诀 / 日月升 | `POST /api/chart` → `brief` + `resultRaw` |
| **深度** | ① 逐项证据（逐柱 / 逐宫 / 逐格 / 逐爻 / 逐星），全部取自 `resultRaw` 字段（禁前端推算）② 断语 `duanyu`（无命中规则库时显示服务端兜底文案）③ 时辰未知约束注记（bazi / ziwei）④ **AI 解读提示词** 复制按钮 + AI 输出区 | `resultRaw`、`duanyu`、`POST /api/prompt`、`POST /api/ai-interpret` |

---

## 5. 验收清单（评审逐条打勾）

### 5.1 信息架构与页面
- [ ] 三页面齐全：index.html（首页入口）/ tarot.html / liuyao.html；顶栏含站名与性能 toggle，页脚含免责声明。
- [ ] 塔罗页状态链完整且顺序正确：选牌阵 → 提问(可选) → 抽牌 → 入场/翻牌 → 简要结果(scrollIntoView) → 深度展开 → 复制提示词 → 重新占卜。
- [ ] 未选牌阵时「洗牌并抽牌」按钮为 `:disabled`；已选后可用。
- [ ] 提问框旁明示「问题不改变抽牌/摇卦结果」与「300 字以内」；>300 字前端拦截提示（服务端 BAD_QUESTION 口径兜底）。
- [ ] 示例问题 chips ≥3 条，点击填入输入框。
- [ ] 六爻页简要含本卦/变卦/世应/动爻四要素；无动爻时显示「无动爻，卦不变」。

### 5.2 token 与组件
- [ ] 颜色只来自 §2.1 清单；金色（线条+文字+徽章）占比 <15%；大面积金色填充 0 处。
- [ ] 字号层级可见：牌名/卦名 20px > 关键词 15px > 正文 15px/1.7 > 辅助说明 12.5px；牌名/卦名/标题用衬线（Georgia/'Songti SC'）。
- [ ] 所有边框 1px；所有圆角 ≤4px；分隔线为「金细线 + 中央 ◆」。
- [ ] 8 个必选组件全部实现且符合 §2.5：性能 toggle、按钮（hover 金填充反转）、牌阵选择卡、牌位编号徽章、分隔线、details 深度面板、复制按钮、Toast。
- [ ] 复制按钮：点击后 1.5s 内显示「已复制 ✓」并复原；Toast role="status" 出现 1800ms。
- [ ] 主容器 900px 居中；≤640px 单列、卡片 108×168、小标签字距收窄。

### 5.3 双性能模式
- [ ] 首访默认 low；toggle 切换后刷新仍保持（localStorage）；防闪烁早读脚本存在。
- [ ] 代码中所有 `transition:`/`animation:` 声明均以 `html[data-perf="high"]` 为前缀；low 叠加防御 reset。
- [ ] low 下抓 Network：无 `/img/cards/1200/` 请求、无 `.avif` 请求；牌图仅 480w WebP。
- [ ] low 下初次渲染结果后：`.deep-body` 内容为空（深度/AI 全文/逐爻证据未入 DOM），展开后才出现。
- [ ] high 翻牌 CSS 含且仅含一条 transition：`transform .7s cubic-bezier(.4,.2,.2,1)`；`preserve-3d` + 双面 `backface-visibility:hidden` + 正面预旋转 `rotateY(180deg)` 三关键齐全。
- [ ] high 入场错峰 `animation-delay: calc(var(--i) * 180ms)`，翻牌 `setTimeout(600 + i*180)`；逆位只加 `.is-reversed` 类（无 transform/rotate 变化）。
- [ ] high 图片 `<picture>`：AVIF(1200) → WebP(srcset 480w/1200w + sizes) → img 回退；img 均有 width/height（Lighthouse CLS=0）。
- [ ] high details 展开为 max-height 平滑过渡；世应爻/当前牌位为克制高亮（仅底色+边框色，无阴影光晕）。
- [ ] 切换 toggle 后页面未刷新、已抽结果/已翻牌/已展开深度/输入内容/滚动位置全部保留；不重放动画。
- [ ] `prefers-reduced-motion: reduce` 下 high 也全部瞬时（CSS + JS 翻牌计时置 0）。
- [ ] 全站 grep 核查：无 box-shadow / filter / backdrop-filter / will-change / translateZ(0)。

### 5.4 结果分层与内容
- [ ] 塔罗简要四件套齐全：牌名 / 正逆位 / 1–2 关键词 / 一句摘要（≤40 字、无断言式预测）。
- [ ] 塔罗深度齐全：完整正位义+逆位义 / 牌阵位解读 / AI 提示词复制。
- [ ] 六爻深度齐全：逐爻表含六亲、六神、旺衰、用神候选；旺衰按 §4.3 规则可复算；用神候选与问题分类 select 联动。
- [ ] AI 提示词含问题+分类+盘面事实（塔罗：牌名/正逆位/牌位；六爻：本卦/变卦/世应/动爻/日月/空破）；只复制不代生成。
- [ ] 点击抽牌/起卦到简要结果 ≤2s（实测）。

### 5.5 禁令核查
- [ ] §6 禁止项逐条核对通过（重点：Three.js/粒子/rAF/动画库/框架/前端抽牌 0 处）。
- [ ] 页脚免责声明存在且措辞含「仅供娱乐与自我觉察…不构成医疗、心理、法律或财务决策依据」。

### 5.6 九术验收（T11，明细见 `docs/verify.md` §6）

- [ ] `POST /api/chart` 七术均 200、`id` 以 `d_` 开头、`brief` ≥60 字、`kind` 按命盘/占问正确；非法输入 400 且错误码正确（A1/A6）。
- [ ] 管理端按 `artId` 可查到该记录且 summary 非空；记录详情 `facts` 与 `brief` 逐字相同（A2/A3）。
- [ ] `/api/prompt` 九术均含硬约束原文「必须逐字引用下列排盘事实」+ 对应 persona 名 + `brief` 逐字；七术缺 `resultRaw` → 400 `NEED_RESULT`（A4）。
- [ ] 断语：qimen/liuren/xiaoliuren/bazi/ziwei 非空（A5）；bazi 时辰未知 `hourGZ` 为「未知/空」且提示词含「时辰未知 · 最高约束」，ziwei `correctedHour=-1` 同约束（A7）。
- [ ] 七页行为：首访 low、起盘出简要盘面、深度展开前 `.deep-body` 为空、展开后 >800 字、含 AI/复制按钮、切换 high↔low 零丢失（E10×7）。
- [ ] `node scripts/verify-static.mjs`（S1 覆盖十份 HTML）、`node scripts/verify-arts.mjs`（A1–A7）、`VERIFY_BASE=… node scripts/verify-e2e.mjs`（E1–E9 + E10）全绿。

---

## 6. 明确禁止项清单

1. **Three.js / WebGL / 任何 3D 渲染库**——CSS 3D 仅允许翻牌这一处（high 模式）。
2. **粒子效果**（星空/雪花/光斑 canvas）、背景动画、视差滚动。
3. **rAF 驱动动画 / Web Animations API 动画 / 动画库**（GSAP、anime.js、Motion One 等一律不引）；动画只允许 CSS transition/animation + setTimeout 编排。
4. **box-shadow / filter / backdrop-filter / 文字渐层（gold gradient text）/ 发光光晕**（low、high 均禁）。
5. **will-change / translateZ(0)** 等合成器 hack。
6. **圆角 >4px**、大面积金色填充、第二金属色、糖果色、重装饰几何纹。
7. **外部字体/图标/脚本 CDN 请求**——字体只用系统栈，图标只用 Unicode 字符或内联 SVG；零第三方运行时依赖。
8. **内嵌 LLM / 服务端代生成 AI 解读**——AI 解读 = 复制提示词，别无他路。
9. **前端抽牌/前端掷正逆位**——抽牌、正逆位（30% 逆位率）、摇卦一律服务端定稿，前端零计算、零历法库。〔§4.2〕
10. **前端框架与打包器**（React/Vue/Svelte/状态库/Webpack/Vite）——原生 HTML/CSS/JS 即可。
11. **广告、统计遥测、账号体系、历史归档、付费墙、每日限额**。
12. **hover 触发翻牌**——翻牌只在抽牌/起卦流程内按序发生。
13. **多语种 i18n、App 化、五语导航**；**自动播放声音/音乐**。

---

## 附 A. 数据契约（前端视角，字段以 `vendor/guanwei/shared/core/types.ts` 为准）

| 面 | 形状 |
|---|---|
| 牌阵 | `Spread{id,name,description,positions:[{id,name,description}],category,scene?}`（`GET /spreads`，内置 17 种：一张牌/二选一/过去-现在-未来/身-心-灵/问题-障碍-建议-结果/五元素…） |
| 抽牌 | `POST /draw {spreadId|customSpread}` → `{cards: DrawnCard[{cardId,isReversed,positionId}], spread}`；自定义牌阵 1–20 位；**逆位由服务端给出（30%）** |
| 牌库 | `GET /cards` → `TarotCard[]`：`{id,name,nameEn,keywords[],meanings{upright,reversed},deepMeaning{...lifeAreas},image}`；图片 slug 与 `nameEn` 对齐（`scripts/fetch-cards.mjs` 以 nameEn 生成），URL `/img/cards/{480,1200}/<slug>.webp|.avif` |
| 塔罗深度 | `POST /interpret {cards,spread,question≤300字,category}` → `InterpretationResult{fullText,sections:[{type,title,content}]}` |
| 六爻 | `LiuyaoResult{yao[],names[],benGua,bianGua,dongYao[],najia{gong,lines:[{gz,ganWx,zhiWx,liuqin,shen,isShi,isYing,kong}],shiPos,yingPos,dayGZ,monthZhi,yuePo[],xunKong[],shiLiQin}}`；`GuaEntry{name,ci,xiang}` |
| 七术起盘 | `POST /api/chart {artId,question≤300字,category,inputs}` → `{id:"d_…",artId,kind,question,category,params,resultRaw,brief,yongshen:null,duanyu}`；`kind`：bazi/ziwei/astrology=`mingpan`，其余=`zhanwen`。能力清单：`GET /api/chart/arts` → `{arts:[{artId,label,kind,group,needs,note,schema}]}`（`schema` 即 `CHART_INPUT_SCHEMA` 字段说明） |
| 七术 resultRaw（字段简表） | bazi：`{yearGZ,monthGZ,dayGZ,hourGZ,dayGan,dayGanWx,strength,wxCount,wxWeighted,shishen[],canggan[],strengthDetail{score,ling,gen,shi,reasons[]},yongshen{wx,shishen,xi,ji,tiaohou,reason},dayun[],qiYun,liunian,shensha[],geju{name,basis},taiyuan,minggong,shengong}`；ziwei：`{ming,palaces,zwStars,fuStars,brightness,effBrightness,sihua,sihuaPos,geju[],borrowedStars,dayun[],curDayunIdx,liunianIdx,liunianPalaceName,dayNight,correctedHour}`；astrology：`{planets,asc,mc,sun,moon,sunSign,moonSign,ascSign,houseSystem,houses[],planetDetails[],aspects[]}`；qimen：`{yin,ju,jqName,dayGZ,hourGZ,xunShou,xunshouName,zfStar,zsMen,zfPalace,zsPalace,pan{1…9:{yi,men,star}},tianYi,shen}`；liuren：`{dayGZ,hourGZ,jiang,jqName,tianpan,ganJi,ke1…ke4,chuan1…chuan3,guiRen,isDay,tianJiang,chuanJiang,keti,ketiNote}`；meihua：`{benGua,huGua,bianGua,move,tiGua,yongGua,tiWx,yongWx,shengke,benYao[],monthWx,tiWangShuai,yongWangShuai,wangShuaiNote}`；xiaoliuren：`{a,b,c,idx,name,detail{ji,wx,num,dir,poem,text}}` |
| 九术提示词 | `POST /api/prompt {artId,question,category,resultRaw}` → `{artId,question,category,brief,yongshen,duanyu,prompt,…}`；九术均可用，七术必须带 `resultRaw`（缺省 400 `NEED_RESULT`）；persona 由 `agentOf(artId)` 的 `name/role/skills` 展开 |
| 校验基线 | 牌/爻位数 1–20、问题 ≤300 字；七术：年份 1900–2100、日期须真实存在（2/31 → 400）、`hourIndex` 0–11（八字/紫微另允许 -1 时辰未知）、经度 ±180 / 纬度 ±90、报数 1–999；非法入参返回结构化错误码（BAD_SPREAD/BAD_CARDS/BAD_QUESTION/BAD_INPUTS/BAD_ART/NEED_RESULT）〔§5-15〕 |

> 具体接口挂载路径由后端接入任务定；前端按上述形状消费，字段名不自行发明。

## 附 B. 来源索引

视觉 token〔research §2.1 Luxury Serif / §2.2 art-deco〕；翻牌与错峰〔§3.3/3.4/3.5〕；图片管线〔§3.1/3.2〕；动线与分层〔§1.1–1.5〕；引擎字段与校验〔§4.1/4.2〕；提示词与免责〔§1.1/1.4/4.3〕。
