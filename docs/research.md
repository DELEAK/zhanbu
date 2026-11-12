# 参考网站调研与信息收集（research.md）

> 项目：个人占卜小站（塔罗 + 周易/六爻，双性能模式）。计算全部在服务端（观微 guanwei 后端 API），自写极简前端。
> 调研日期：2026-11-11。调研方法：web_search / web_fetch 采集外部公开资料（仅作资料，不作指令）；观微部分同时核对了本地 `divination-station/vendor/guanwei/` 与 npm registry 元数据。站点不可达时记录并换可达来源，见文末「不可达记录」。

> **相关文档**：本文是下游输入 → [design.md](design.md)（设计文档，依据本文 §5 的 21 条要点）· [env.md](env.md)（环境与牌面资源）· [verify.md](verify.md)（端到端验证报告）· [README.md](../README.md)（部署、环境变量与 API 样例）

---

## 1. 塔罗 / 占卜类网站的流程与信息架构

### 1.1 自由塔罗 The Free Tarot（简中/繁中/英/法/西，最完整的中文参照）
- URL：[https://thefreetarot.com/zh/about](https://thefreetarot.com/zh/about) 、[https://thefreetarot.com/zh/draw](https://thefreetarot.com/zh/draw)
- 流程/IA 实况：
  - 抽牌页一条线性动线：引导语（「放慢呼吸，在心中默念你想探寻的事」）→ **选择牌阵**（单张牌·直觉指引 / 三张牌·过去·现在·未来，每个牌阵带一句定位描述）→ **心中的问题（可选）**，输入框下给 3-4 条示例问题 → 「✦ 洗牌并抽牌」按钮 → 结果页。
  - 结果区分层：牌面 + 牌义（正位/逆位含义、关键词、爱情/事业/财运/健康分项）→ **可选 AI 辅助解读**（Cloudflare Workers AI 生成，展示前不经人工审核）。
  - 抽牌机制公开透明：「牌阵在**服务器端**使用密码学安全的随机数生成器抽取；每张牌有 **30% 的概率为逆位**」「你写下的问题不会影响抽到哪些牌」；每日一牌按日期确定、同日不变。
  - 免责声明常驻页脚：「仅供娱乐与自我觉察，不预测未来，也不构成医疗、心理、法律或财务建议」。
  - 附属 IA：牌义图鉴（78 张全库）、每日一牌、是否塔罗、生日牌计算器、牌阵生成器、公开抽牌数据集。
- **可借鉴**：①「牌阵选择 → 可选提问 → 抽牌」三步前置 + 提问明示「不影响抽牌」消除公平性质疑；②示例问题列表降低提问门槛；③牌义图鉴作为结果页的下钻层（深度内容按需进入）；④AI 解读是「可选附加层」而非主体，与「简要结果 / 深度结果分层」完全同构；⑤服务器端抽牌 + 公开概率（30% 逆位）写进关于页，是信任感来源；⑥页脚免责声明措辞可直接改写复用。
- **不可借鉴**：①五语种 i18n（本站单语种，不做）；②会员付费 / 每日免费次数 / Cloudflare Workers AI 服务端代生成（本站 AI 解读是「复制提示词到任意大模型」，不内嵌 LLM）；③抽牌统计开放数据集与账号体系（本站无注册无统计）。

### 1.2 艾勒水晶（繁中水晶/塔罗站）
- URL：[https://ilove-crystal.com/free-tarot-reading/](https://ilove-crystal.com/free-tarot-reading/)
- 流程实况：「選牌陣、寫下問題，線上抽牌看牌義與心理提醒。適合感情、選擇、工作與自我整理」——同样收敛为**选牌阵 → 写问题 → 抽牌 → 牌义 + 心理提醒**；站点导航把「塔罗占卜 / 水晶能量 / 八字五行参考」并列为平级入口。
- **可借鉴**：①中文语境下「牌义 + 心理提醒」的双层文案口径（对应我们的简要结果层）；②占卜工具与命理工具（八字）平级双入口的导航组织，与本站「塔罗 + 六爻」双页面同构。
- **不可借鉴**：①电商水晶售卖导流（本站零商业化）；②WordPress 主题的视觉（与深色高级感目标不符）。

### 1.3 五个英文塔罗站横评（Biddy Tarot / Labyrinthos / Tarot.com / Galaxy Tarot / CyberOmen）
- URL：[dev.to — I Tested 5 Free Online Tarot Reading Sites](https://dev.to/song_jack_599ca99593afc8a/i-tested-5-free-online-tarot-reading-sites-here-is-what-actually-works-1pnl)
- 一手结论（该文逐一实测并打分）：
  - Biddy Tarot（7/10 学习向）：免费单张抽牌 + **最全牌义解释库**；但解读是「抽牌→读描述」，无个性化。牌义数据库是行业标杆。
  - Labyrinthos（6/10）：「Gorgeous app and website design」——视觉公认最好，但只到基础三牌阵、AI 聊天泛泛。
  - Tarot.com（5/10）：老牌海量牌库 + 每日一牌/每日一免费牌阵，但广告密集、解读预写无个性。
  - Galaxy Tarot（7/10）：免费无广告、多牌阵、**逆位解释**齐全，仍停在牌义描述层。
  - CyberOmen（8/10 深度）：唯一做「塔罗+星盘+八字+数字」**跨体系交叉解读**，AI 按具体问题生成；免费仅详摘，全文 $0.99。
  - 该文总结的四条规律：个性化 > 所谓准确度；跨体系互证「hits different」；**2 分钟内拿不到结果就流失**；免费通常=受限。
- **可借鉴**：①「牌义库 + 简要结果」与「深度解读」必须分层——横评里被扣分的站全死在「只有牌义描述」；②速度红线：点击抽牌到简要结果 ≤2 秒（我们全部本地计算，天然满足）；③逆位解释是一等公民，不可省略；④跨体系互证（六爻页给出卦象事实、AI 提示词里可带问题分类）是深度层的差异化点。
- **不可借鉴**：①广告 / 付费墙 / 每日限额（本站自托管零限制）；②Labyrinthos 式 App 化（本站是极简网页）。

### 1.4 MysticX 文档站（AI 塔罗产品的公开文档目录，仅取其 IA）
- URL：[https://dev.mysticx.ai/zh-CN/docs/human-design/design-direction-modern-mystique](https://dev.mysticx.ai/zh-CN/docs/human-design/design-direction-modern-mystique)（正文为客户端渲染，未取到；仅目录可达）
- 目录可见的 IA 信号：产品文档把「预测解读与提示词 / 场景题库与提问流程 / 卡片抽取引擎 / Web 文案与牌阵」拆成独立模块（Future Prediction 01-08），并有专门的 design-direction（设计方向）文档。
- **可借鉴**：①「提示词」独立成文档的组织方式，印证本站把 AI 解读提示词做成一等交付物（带复制按钮）是对的；②「场景题库与提问流程」对应我们的示例问题列表。
- **不可借鉴**：①其会员/积分/推送/多端体系（远超个人站规模）；②具体视觉规范未取到正文，不作依据。

### 1.5 tarot-game 开源项目的完整交互链（中文，流程实现级）
- URL：[华为云社区 — 421 行 CSS 做出完整卡牌交互](https://bbs.huaweicloud.com/blogs/493525)（原文仓库：gitcode.com/lightyearssssr/tarot-game）
- 流程实况（原文给出线性状态链）：「选牌阵 → 提问（可不填）→ 抽牌（未选牌阵时按钮禁用）→ 错峰入场动画 → 交错翻牌 → 渲染解读结果 + scrollIntoView 平滑滚动 → 重置」。
- **可借鉴**：状态链与按钮禁用态（未选牌阵不可抽）；洗牌/抽牌是纯 JS 逻辑（无放回随机抽样 + `Math.random() < 0.5` 掷正逆），动画只发生在翻牌时刻。
- **不可借鉴**：①其正逆位 50/50 掷硬币且在前端抽牌（我们按 guanwei/thefreetarot 口径 30% 逆位、服务端定稿）；②无 AI 提示词层、无深度分层（结果一次性渲染）。

---

## 2. 深色高级感视觉案例

### 2.1 Luxury Serif 设计套件规范（深色高级感的方法论总纲）
- URL：[wrongstack/wrongstack — luxury-serif KIT.md](https://raw.githubusercontent.com/wrongstack/wrongstack/e98dbba6b9c5188258efc68a650aa6b7ffe6ce34/packages/core/design-kits/luxury-serif/KIT.md)
- 规范要点：「Quiet luxury」——象牙白/近黑 + **唯一金属色点缀（金/香槟金）**、高对比衬线标题（Didot/Playfair/GT Sectra）+ 细体正文、**大量留白**、letter-spaced 大写小标签、细分隔线（hairline rules）；深色主题 token：bg `oklch(16% 0.005 60)`（近黑）、fg `oklch(94% 0.01 90)`、香槟金 `oklch(80% 0.09 85)`；动效 400-600ms ease、长淡入、绝不弹跳；**Don't：重阴影卡片、渐变、圆角大色块、明亮强调色、拥挤**。
- **可借鉴**：①「单金属色 + 深底 + 衬线 + 大留白」四件套与本站 token（#0a0a0f 底 + #c9a84c 暗金 + Georgia/'Songti SC'）几乎一一对应；②金只做点缀不铺面的克制原则；③动效上限 600ms、慢而稳；④细线分隔 + 大写小标签的层次手法。
- **不可借鉴**：①Didot/Playfair 等西文展示字体的 CDN 依赖（本站用系统衬线 Georgia/'Songti SC'，零字体请求）；②全出血大图排版（本站 900px 窄栏、图片是牌面而非摄影大图）；③浅色 ivory 主题（本站只取其深色变体）。

### 2.2 Art Deco 风格规范（金 + 深底的落地 token 级参照）
- URL：[zhaiyateng/dsh-design-skills — art-deco SKILL.md](https://raw.githubusercontent.com/zhaiyateng/dsh-design-skills/741272753c257c9b48fb60b015b4ecdb438d86e3/skills/art-deco/SKILL.md)
- 规范要点：深色底（墨绿/深蓝/黑）+ 金 `#c9a24b`/`#d4af37` + 象牙白文字；金色细线 1-2px 做边框/分隔/装饰框；标题衬线 + 大写 + 大字距（`letter-spacing: 0.15-0.3em`）；正文 `14-15px / 1.7`；按钮「金线边框 + 透明底 + 金色大写文字，hover 金色填充 + 黑字」；卡片「次级面底 + 1px 金线边框 + 角落小装饰」；分隔线「金色细线 + 中央菱形小装饰」；禁用清单：金色铺满（占比 <15%）、圆角 >4px、无衬线标题、糖果色。
- **可借鉴**：①金线按钮 hover 反转态、1px 金线卡片、菱形装饰分隔线的组件级配方可直接抄给本站（按钮/卡片/分隔线三个组件）；②`letter-spacing: 0.15-0.3em` 的小标签数值；③正文 14-15px/1.7 行高；④「金色占比 <15%」可量化为验收项。
- **不可借鉴**：①对称几何放射纹等重装饰（本站是极简，只留细线与菱形这一个装饰语汇）；②墨绿/深蓝底色（本站底色固定 #0a0a0f/#0d0d12）；③clip-path 阶梯框（多余装饰）。

### 2.3 Tarot With Rae (Dark) — 真实深色塔罗站案例
- URL：[designmagic.com.sg — Tarot With Rae (Dark) case study](https://www.designmagic.com.sg/case-studies/tarot-dark)
- 实况：新加坡塔罗师站点，整体定位「dark, candlelit site」（深色烛光感）；页面分区：下载礼遇顶条 → 烛光 hero（双按钮 Book a Session / Learn More）→ 人物故事 + 口碑徽章 → 全宽深色服务带 → 「framed photos」带框图片 + 文字的服务卡 → **金色评价带（gold testimonial band）** → 线描插画收尾 CTA → 地址/时间/邮箱页脚。
- **可借鉴**：①深色塔罗站的实证分区节奏：hero → 主体分层 → 金色高亮带 → 线描收尾；②「金色带」只出现一次、用于最重要的引文/结果（对应本站深度结果的金色标题）；③图片全部「带框（framed）」呈现——对应牌面卡的 1px 金线框；④线描（line-art）插画优于写实照片，符合深色底上的轻量装饰。
- **不可借鉴**：①预约/WhatsApp 转化漏斗、评价轮播（本站无业务转化）；②WordPress 结构与营销文案密度。

### 2.4 Dribbble 深色占卜灵感（仅视觉灵感清单，不作规范依据）
- URL：[Astrology Tarot Reading Website – Dark Hero Section](https://dribbble.com/shots/27188922-Astrology-Tarot-Reading-Website-Dark-Hero-Section) 、[TAROT CARD: Inner Wisdom Unveiled](https://dribbble.com/shots/27808872--TAROT-CARD-Inner-Wisdom-Unveiled-Tarot-Learning-App-UI-De) 、[Tarot App Design – Daily Horoscope Mobile UI](https://dribbble.com/shots/27552203-Tarot-App-Design-Daily-Horoscope-Mobile-UI)
- **可借鉴**：深色占卜 UI 的共性语言——星点/细线/金色渐层文字/居中衬线标题/卡片暗层叠放，可作为 404/空态/装饰细节的灵感。
- **不可借鉴**：Shot 无实现细节与可核对的代码，色彩数值不可直接采信；渐层金字（gold gradient text）与重光效在禁 WebGL/粒子约束下不采用。

---

## 3. 前端图片性能实践 + 克制的 CSS 3D 翻牌

### 3.1 图片优化终极指南：WebP/AVIF 选型、懒加载与 CDN 配置（中文实践总纲）
- URL：[腾讯云开发者社区 — 图片优化终极指南](https://cloud.tencent.com.cn/developer/article/2600756)
- 关键事实：图片常占页面传输量 40%+，直接影响 LCP/CLS；目标 LCP ≤1s、首屏图片 ≤200KB；**格式选型：首屏/大图优先 AVIF，普通图与图标用 WebP，PNG/JPEG 作回退**；`<picture>` 三段式（AVIF source → WebP source → img JPEG 回退）+ `srcset`（`640w/1200w`）+ `sizes`（`(max-width: 640px) 640px, 1200px`）；关键图 `loading="eager" fetchpriority="high"`，其余 `loading="lazy"`；**必给固有尺寸（width/height 或 aspect-ratio）防 CLS**；懒加载可用原生或 IntersectionObserver（`data-src` 换 `src` 后 `unobserve`）；Sharp 批量转档脚本生成 `*-480/1200.avif/webp`；质量分档（人像 70-80、插画 60-70、背景 50-60）；常见坑：懒加载 LCP 图、srcset 与 sizes 不匹配下载错尺寸。
- **可借鉴**：①本站牌面图管线直接套 `*-480.* / *-1200.*` 双档 + AVIF/WebP/JPEG 三格式（与 `public/img/cards/480|1200` 目录正好吻合）；②`<picture>` + `srcset` + `sizes` 模板照抄；③width/height 固有尺寸规范；④low 模式 = 只声明 480 档 srcset，high 模式 = 声明 `480w,1200w` 让浏览器按 DPR 选档；⑤断点 640px 与 sizes 表达式对齐。
- **不可借鉴**：①CDN 内容协商（`Vary: Accept` / Nginx map / try_files）——本站自托管单机、构建期定格式即可；②Cloudflare/Cloudinary 边缘动态转图（无 CDN）；③RUM 监控与月度报表（个人站过重）。

### 3.2 MDN `<picture>` 元素（权威语义）
- URL：[MDN — `<picture>`：picture 元素](https://developer.mozilla.org/zh-CN/docs/Web/HTML/Reference/Elements/picture)
- 关键语义：`<picture>` 内多个 `<source type="image/avif|image/webp">` 按**格式支持度**择一命中，`<img>` 是必选回退与 alt/尺寸载体；source 也可用 media/srcset 做响应式分支。
- **可借鉴**：type 协商顺序固定为 AVIF → WebP → JPEG（旧浏览器安全回退）；alt 文案写牌名（可访问性 + 无图占位可读）。
- **不可借鉴**：media 属性做多分支（sizes/srcset 已够，多分支增加维护面）。

### 3.3 MDN `backface-visibility`（翻牌的权威属性语义）
- URL：[MDN — backface-visibility](https://developer.mozilla.org/zh-CN/docs/Web/CSS/Reference/Properties/backface-visibility)
- 关键语义：`backface-visibility: hidden` 使元素背面在 3D 旋转中不可见；需配合 `transform-style: preserve-3d`（父级）才能让正反两面共享同一 3D 上下文。
- **可借鉴**：两面都设 `backface-visibility: hidden` 是翻牌正确性与省绘制的关键；只在卡片容器建 3D 上下文，页面其余部分保持平面。
- **不可借鉴**：无（权威参考，直接采用）。

### 3.4 421 行 CSS 做出完整卡牌交互：纯前端动效的克制做法（翻牌实现的黄金样本）
- URL：[华为云社区 — 421 行 CSS 做出完整卡牌交互](https://bbs.huaweicloud.com/blogs/493525)（原实现：gitcode.com/lightyearssssr/tarot-game，文档 E2-CSS卡牌动效.md）
- 实现要点（原文代码级）：
  ```css
  .tarot-card { width: 130px; height: 200px; position: relative;
    transform-style: preserve-3d;
    transition: transform .7s cubic-bezier(.4,.2,.2,1); }
  .tarot-card.is-flipped { transform: rotateY(180deg); }
  /* 两面共用 backface-visibility: hidden; 正面预旋转 rotateY(180deg) */
  ```
  三关键：①`preserve-3d` 建 3D 上下文共用旋转轴；②`backface-visibility: hidden` 保证翻转过程只见朝外面；③**正面预旋转 180°**——父级转 180° 时正面刚好朝前，语义零跳变。JS 只 `setTimeout(() => inner.classList.add('is-flipped'), 600 + i * 180)` 加类，**零 rAF / 零 Web Animations / 零逐帧驱动**，动画完全交给浏览器合成器的 transform 硬加速路径。
  - 洗牌 = 纯 JS 无放回随机抽样（`slice()` 复制牌池 + `Math.floor(Math.random()*pool.length)` + `splice` 摘除）；正逆位掷硬币。
  - 入场：`.tarot-slot { animation: slotIn .5s ease both; /* opacity 0→1 + translateY(18px→0) */ }`，`animationDelay = i * 0.18s` 错峰；翻牌再错峰（600+i*180），两段式编排。
  - **逆位不旋转几何，只换类**：`.is-reversed` 改背景/边框/关键词色——只触发 paint 不触发 layout，视觉语义足够。
  - 性能纪律：全部动画只动 transform/opacity（合成器路径）；**不加 `will-change`/`translateZ(0)`**——≤10 张卡场景加了只多占内存无收益；整个 CSS 421 行（390→420 只加 30 行）。
  - 状态机：CSS 语义化类（`.is-flipped/.is-active/.is-reversed/:disabled`）+ JS 单状态对象 + 两个 setTimeout，总时长 = `600 + 张数×180 + 700`。
  - 移动端：640px 断点卡尺寸 130×200 → 108×168，flex + 一个媒体查询覆盖全部屏幕。
- **可借鉴**：以上全部——翻牌三关键、单条 transition、加类驱动、错峰两段编排、逆位只换类、无 will-change、640px 断点数值、缓动 `cubic-bezier(.4,.2,.2,1)` 与 0.7s 时长。与本站「禁 Three.js/粒子/WebGL/rAF 动画库」约束完全同向。
- **不可借鉴**：①正逆位 50/50 前端掷硬币（我们 30%、服务端定稿）；②洗牌在浏览器做（我们抽牌逻辑在 guanwei 后端）；③结果一次性渲染（我们简要/深度分层、深度不入 DOM）。

### 3.5 preserve-3d 翻牌的最小正确写法（对照样本）
- URL：[pproenca/dot-skills — emilkowal-animations/transform-3d-preserve.md](https://raw.githubusercontent.com/pproenca/dot-skills/master/skills/.experimental/emilkowal-animations/references/transform-3d-preserve.md)
- 要点：正确组合 = 容器 `perspective: 1000px` + 卡片 `transform-style: preserve-3d` + 双面 `backface-visibility: hidden` + 背面 `transform: rotateY(180deg)` + 单条 `transition: transform 500ms ease-out`；错误示例是「无 preserve-3d 时子元素被压平、背面不可见」。
- **可借鉴**：容器 `perspective` 是 3.4 样本未显式给出的一环，补上才有真实景深；transition 时长 500-700ms 区间皆可。
- **不可借鉴**：hover 触发翻转的交互（我们是点击/抽牌后按序翻牌）。

---

## 4. 观微 guanwei 自身 UI 与文档 —— 为何走「观微后端 API + 自写极简前端」

### 4.1 guanwei 本体（npm `guanwei` / GitHub RubyCcll/guanwei，MIT）
- URL：[https://github.com/RubyCcll/guanwei](https://github.com/RubyCcll/guanwei) 、[https://www.npmjs.com/package/guanwei](https://www.npmjs.com/package/guanwei)（npm 网页端 Cloudflare 拦截，元数据经 [registry.npmjs.org/guanwei](https://registry.npmjs.org/guanwei) 取得）
- 文档关键事实：
  - 定位：「观微 Guanwei · 九术排盘与 AI 深度解读（八字/紫微/星盘/奇门/**六爻**/六壬/梅花/小六壬/**塔罗**）」——九术里塔罗与六爻都在计算引擎范围内，恰好覆盖本站两页面。
  - 架构：「前端 React 18 + TS + Vite + Tailwind（宋式美学 UI）；后端 Express + tsx（SSE 流式 + SQLite）；**共享引擎 shared/core/engine/*（lunar-typescript 历法 + astronomy-engine 星历）**」；「起占结果由后端计算并**持久化入库**（SQLite），六爻摇卦、塔罗抽牌等交互结果同样**后端定稿**」。
  - 开放分发（v1.3.0 起）：**REST API `packages/guanwei-api`**——`POST /v1/chart`（九术排盘，纯计算零 token）、`GET /v1/arts`（九术能力清单 + 参数 schema）；另有 MCP Server（stdio / HTTP / SSE 三传输）。安全默认：只绑 `127.0.0.1`、per-IP 限流（默认 120 次/分）、`GUANWEI_API_HOST=0.0.0.0` 显式放开。
  - 单一算法副本：Web 端与 API/MCP「共用 shared/core 单一算法副本」；278 项测试，与 Swiss Ephemeris / lunar-typescript / iztro / qimen-dunjia 交叉验证（六爻纳甲/世位/六神与京房八宫独立推导全对齐）。
  - 自托管定位：「排盘与 AI 解读都跑在你自己机器上……不采集任何遥测」；MIT 许可。
- UI 事实：guanwei 自带 UI 是「宋式美学」浅色水墨风的完整 React SPA（react-router + zustand + tailwind + lucide，含古籍页背景动画、学馆、档案管理、历史归档）；演示站 [rubyccll.github.io/guanwei](https://rubyccll.github.io/guanwei/)（含 [/#/demo](https://rubyccll.github.io/guanwei/#/demo) 纯浏览器排盘演示）。
- **可借鉴**：①计算引擎与 AI 解读编排（盘面事实注入 → persona → 结构化报告）直接复用；②其 `/v1` REST 与 shared/core 直调两种接入形态都存在，本地方案二选一；③其安全默认（127.0.0.1 绑定、限流、无遥测）与个人自托管站的威胁模型一致；④「问题-术数适配性分析」「盘面事实一致性约束」等 prompt 工程思路可迁入本站 AI 提示词模板；⑤免责声明措辞（「占问所得，仅供修身养性、怡情遣兴之用，不构成任何决策依据」）可直接用。
- **不可借鉴**：①「宋式美学」浅色 UI 与本站深色高级感视觉规范冲突——这正是自写前端的核心理由；②React 18 + Vite + Tailwind + router + 状态库的 SPA 体量（对双页面个人站是负担，也违背「极简前端」）；③用户/档案/SQLite 历史/登录鉴权体系（本站无账号）；④AI 解读的 LLM 直连与 SSE 流式（本站改为复制提示词，无 LLM 依赖）；⑤古籍/学馆等附加栏目。

### 4.2 本地 vendored 副本实测（`divination-station/vendor/guanwei/`，v1.3.5）
- 服务端路由即 API 面（`vendor/guanwei/server/src/routes/`）：
  - `tarot.ts`：`GET /cards`（牌库）、`GET /spreads`（牌阵）、`POST /draw`（body `{spreadId|customSpread}` → 服务端 `drawCards(spread)` 返回 `{cards, spread}`；自定义牌阵限 1-20 位）、`POST /interpret`（`{cards, spread, question, category}` → `generateInterpretation`；牌数限 1-20、问题 ≤300 字：「所问之事请控制在 300 字以内」）。
  - `divine.ts`：起占 → `chartCalc` 引擎计算 → SQLite 入库 → 返回 `resultRaw + display`；带 token 归属校验与宽松建档。
  - 另有 `hour.ts`（时辰反推）、`ai.ts`（LLM 解读）、`users.ts`。
  - 引擎面（`vendor/guanwei/shared/core/engine/`）：`tarotEngine.ts`（`shuffleDeck` / `drawCards` / `generateInterpretation`）、`tarot.ts`、`liuyao.ts`、`meihua.ts`、`chart.ts`、`gua64` 数据等。
  - 正逆位实测：`shared/core/engine/tarotEngine.ts:43` `const isReversed = Math.random() < 0.3;`——**逆位率 30%**，与 thefreetarot 公开口径一致；逆位在解读文本与「逆位占比」话术（0 / ≤0.3 / ≤0.6 / >0.6 分档）中是一等变量。
- **可借鉴**：①`/draw`、`/interpret` 的入参限长（牌 1-20、问题 300 字）直接作为本站服务端校验基线；②六爻走 `chartCalc`/liuyao 引擎、塔罗走 `drawCards`，两页面共用同一调用模式（POST → 引擎 → 结果 JSON）；③`/interpret` 返回的分层解读文本可作「深度结果」服务端素材。
- **不可借鉴**：`ai.ts` / `users.ts` / `divineStore.ts` 的账号、归档、LLM 链路（超范围）。

### 4.3 路线论证（结论）
「观微后端 API + 自写极简前端」是四个约束的唯一交集：
1. **计算在服务端**：guanwei 的排盘/摇卦/抽牌本就是后端定稿（README 明文），调用 `vendor/guanwei` 的 shared/core 引擎或其 `/v1` REST 均满足；浏览器零计算、零历法库。
2. **视觉规范**：本站深色高级感（#0a0a0f + 暗金 + 衬线）与 guanwei 自带「宋式美学」浅色 SPA 完全相反；改它的 UI 等于重写前端，不如自写。
3. **极简前端 + 双性能模式**：guanwei 前端是 React 全家桶；本站需要的是无框架（或极轻）、`data-perf` 可切、深度结果懒注入的静态页，自写体量小一个数量级。
4. **合规与边界**：guanwei MIT 许可允许复用引擎/接口；用户规范明确允许该备选路线；guanwei 自身的自托管、无遥测、127.0.0.1 默认与个人站定位一致。

---

## 5. 可直接落到设计文档的要点（≥10 条）

1. **页面动线定为线性状态链**：选牌阵 → 提问（可选）→ 抽牌（未选牌阵时按钮禁用）→ 牌面错峰入场 → 交错翻牌 → 简要结果 + `scrollIntoView` 平滑滚动 → 展开深度结果 → AI 提示词复制 → 重置。塔罗与六爻两页共用此骨架（六爻的「选牌阵」换成「起卦」）。〔1.1 / 1.5〕
2. **提问框可选 + 示例问题**：placeholder 给 3-4 条示例（感情走向 / 事业方向 / 眼下困境 / 近期契机）；明示「问题不改变抽卦结果」；服务端限长 300 字（沿用 guanwei `BAD_QUESTION` 口径）。〔1.1 / 4.2〕
3. **抽牌/摇卦全部服务端定稿**：塔罗 `POST /draw` 式调用（或直调 `drawCards`），正逆位概率 **30%**（`tarotEngine.ts:43`），前端只接收 `{cards, spread}` 渲染；六爻同理由 `chartCalc`/liuyao 引擎定卦。〔1.1 / 4.2〕
4. **正逆位表达：只换语义类，不旋转几何**——`.is-reversed` 改牌面边框/关键词色 + 文字「逆位」徽章（可访问性兜底），零 layout 成本。〔3.4〕
5. **翻牌动效**：卡片容器 `perspective: 1000px`；卡片 `transform-style: preserve-3d` + 单条 `transition: transform .7s cubic-bezier(.4,.2,.2,1)`；双面 `backface-visibility: hidden`，正面预旋转 `rotateY(180deg)`；JS 只加 `.is-flipped` 类，`setTimeout(600 + i*180)` 错峰。禁 rAF / Web Animations / 动画库。〔3.3 / 3.4 / 3.5〕
6. **入场错峰两段编排**：`slotIn .5s ease`（opacity 0→1 + translateY 18px→0），`animationDelay: i*0.18s` 先入场、翻牌再错峰；总时长 `600 + 张数×180 + 700` 毫秒内闭环。〔3.4〕
7. **动画只动合成器属性**（transform/opacity），不加 `will-change`/`translateZ(0)`；hover 只做 `translateY(-4px)`；`prefers-reduced-motion` 下全部瞬时切换。〔2.1 / 3.4〕
8. **牌面图片双档管线**：`public/img/cards/480|1200` 两档 + AVIF/WebP/JPEG 三格式（Sharp 构建期转档，质量 60-80）；`<picture>` type 协商 AVIF→WebP→JPEG，`srcset="…480w, …1200w"`，`sizes="(max-width: 640px) 480px, 200px"`（按卡槽实际宽）；img 固定 `width/height` 防 CLS；`data-perf="low"` 只声明 480 档，`high` 声明全档；结果区之外 `loading="lazy"`。〔3.1 / 3.2〕
9. **简要/深度分层 + 深度懒注入 DOM**：结果页首屏只渲染简要结果（牌名/正逆位/一句话/牌位释义）；深度块默认不入 DOM，点击「展开深度解读」才注入（一次性插入，无动画）；深度块内含完整解读 + AI 提示词区。〔1.1 / 1.3〕
10. **视觉 token 落值**：底 `#0a0a0f`、次级面 `#0d0d12`（卡片）、暗金 `#c9a84c`（线条/边框/小标签，**占比 <15%**）、淡青 `#8fbcbb`（次强调：链接/hover/六爻动爻）、辅助灰 `#6b6b70`（正文辅助）；卡片 = 次级面底 + 1px 金线边框 + 角落菱形小装饰；分隔 = 金色细线 + 中央菱形。〔2.1 / 2.2〕
11. **排版落值**：标题衬线 `Georgia, 'Songti SC', serif`；小标签大写 + `letter-spacing: 0.15-0.3em`；正文 `14-15px / 1.7`；主容器 900px 居中，640px 断点：卡尺寸 130×200 → 108×168、单列布局、小标签字距收窄。〔2.1 / 2.2 / 3.4〕
12. **动效节奏上限**：所有 transition/animation 400-700ms、ease-out 风格缓动、无弹跳无旋转装饰；「高级感来自组合时机与缓动控制」。〔2.1 / 3.4〕
13. **AI 解读提示词带复制按钮**：提示词模板预填「问题 + 牌位/卦象事实（牌名、正逆位、位置；或本卦/变卦/六亲）+ 简要结果」，用户复制到任意大模型；按钮点击后变「已复制」1.5s 后复原（`navigator.clipboard.writeText` + 降级 `execCommand`）；不内嵌 LLM、不做代生成。〔1.1 / 1.4 / 4.3〕
14. **免责声明常驻页脚**：「本占卜仅供娱乐与自我觉察，不构成医疗、心理、法律或财务决策依据」（措辞整合自 thefreetarot 与 guanwei README）。〔1.1 / 4.1〕
15. **服务端校验基线**：牌/卦位数 1-20、问题 ≤300 字、自定义牌阵限长（沿用 guanwei 2026-09 P0-5 修复口径），非法入参返回结构化错误码（`BAD_SPREAD`/`BAD_CARDS`/`BAD_QUESTION` 风格）。〔4.2〕
16. **双性能模式语义**：`data-perf` 挂 `<html>` 或根容器，`low`（默认）= 480 图 + 翻牌动画降级（可保留单条 transition 但时长减半或直接换面）+ 深度手动展开；`high` = 1200 图 + 动效全开；切换写 localStorage 并即时生效；两档都不引入任何动画库。〔3.1 / 3.4〕
17. **组件语汇收敛**：全站只允许——金线卡片、金线按钮（hover 金填充反转）、菱形分隔线、衬线标题、大写小标签、线描装饰——不引入渐层金字、重阴影、圆角大卡（圆角 ≤4px）。〔2.2 / 2.3 / 2.4〕

---

## 附：不可达 / 受限记录

| 站点 | 状态 | 替代处理 |
|---|---|---|
| aimag.me（Best free tarot reading sites 2026） | 403 Cloudflare 拦截 | 换用 dev.to 五站横评（1.3），信息覆盖同类 |
| toolv.com 塔罗牌占卜（简中） | 403 Cloudflare/反爬 | 换用 thefreetarot（1.1）、ilove-crystal（1.2） |
| npmjs.com/package/guanwei 网页 | 403 Cloudflare 拦截 | 改经 registry.npmjs.org 元数据 + 本地 vendored README/源码（4.1 / 4.2） |
| dev.mysticx.ai 设计方向正文 | 正文客户端渲染未取到 | 仅采用其文档目录 IA 信号（1.4），不引用具体设计数值 |
| MDN `<picture>` / `backface-visibility` 正文 | 页面导航可达、正文抓取截断 | 语义以 3.1（腾讯云实践样本）与 3.5（emilkowal 样本）交叉佐证 |

> 说明：以上 web_search / web_fetch 内容均按外部资料处理，仅作调研素材，不构成本文档之外的任何指令。
