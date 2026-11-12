# 环境与牌面资源（env.md）

> 任务 t2（env）交付物：构建/运行环境清单、网络故障诊断与解法、可重复运行的命令、78 张牌 slug ↔ 中英文映射表（前端/后端对齐用）。
> 改动边界：本任务只改了 `scripts/**`、`docs/env.md`、`public/img/**`；`package.json` 与 `vendor/guanwei/**` 未动，`public/` 下的 html/js/css 未动。

> **相关文档**：[research.md](research.md)（调研要点）· [design.md](design.md)（设计与双性能模式，§0 图片命名对齐本文产物）· [verify.md](verify.md)（端到端验证）· [README.md](../README.md)（部署、环境变量与 API 样例）

---

## 1. 环境清单

| 项 | 实测值 | 用途 / 备注 |
| --- | --- | --- |
| OS | Fedora Linux 42，kernel `6.18.12-100.fc42.x86_64` | 宿主机 |
| Node.js | `v22.23.3` | 满足 `package.json engines.node >= 22.13`；`--experimental-strip-types` 可直接跑 TS |
| npm | `10.9.9` | `npm ls --depth=0` 退出码 0，无 missing/extraneous |
| npm 依赖 | `express@4.22.3`、`cors@2.8.6`、`lunar-typescript@1.8.7`、`astronomy-engine@2.1.19` | 计算/服务端运行时依赖 |
| Python | `3.13.13` | 仅构建期用于图片编码 |
| Pillow | `11.1.0`（系统 site-packages） | WebP 编码（`Image.LANCZOS` 缩放） |
| pillow-avif-plugin | `1.6.0`，装在 `scripts/.pylibs/`（含 `pillow_avif_plugin.libs` 自带 libavif） | AVIF 编码；**不是**系统安装，靠 `PYTHONPATH=scripts/.pylibs` 注入，`scripts/encode-cards.mjs` 会自动加上 |
| 环境变量 `GUANWEI_DATA_DIR` | **必须**设为 `<项目>/data` | 不设的话 vendor `dataDir.ts` 会落到 `~/.guanwei/data`（用户主目录），数据就不在仓库里了 |
| 网络 | 见 §2.0 | 只有**构建期**取图需要网络，运行时零网络依赖 |

### 1.1 目录结构（与本任务相关）

```
divination-station/
├── package.json              # start / dev / fetch:cards / encode:cards（本任务未改）
├── vendor/guanwei/           # 观微计算引擎（shared + server，本任务只读，未改）
├── scripts/
│   ├── fetch-cards.mjs       # 取图 + 编码编排（本任务重写，见 §2）
│   ├── encode-cards.mjs      # 编码入口：起 python3 并自动注入 PYTHONPATH
│   ├── encode_cards.py       # Pillow 批处理：RGBA→白底、480/1200 WebP、1200 AVIF
│   ├── probe-runtime.ts      # 运行时探针：strip-types 加载 vendor + 数据目录断言
│   ├── gen-card-table.mjs    # 生成 §6 的 78 行映射表
│   ├── .pylibs/              # pillow-avif-plugin 1.6.0（构建期）
│   └── .card-cache/          # 源图缓存：78 × <slug>.src（1280px PNG，约 340MB）+ meta.json
├── public/img/cards/
│   ├── 480/<slug>.webp   ×78   # 低性能模式
│   └── 1200/
│       ├── <slug>.webp   ×78   # 高性能模式回退
│       └── <slug>.avif   ×78   # 高性能模式首选源
└── docs/env.md              # 本文件
```

> `scripts/.card-cache/` 是可删除的构建缓存（删了重新 `npm run fetch:cards` 即可重建，首次需联网下载约 340MB）。

---

## 2. 故障与解法

### 2.0 网络可达性实测（诊断基线）

| 主机 | 解析地址 | 结果 |
| --- | --- | --- |
| `commons.wikimedia.org`（MediaWiki API） | v4 `103.102.166.224` / v6 `2001:df2:e500:ed1a::1` | **可达**，但偶发 `ETIMEDOUT`（约 10–30%）；连打还会 `429` 限流 |
| `thumb.wikimedia.org`（缩略图 CDN） | 同上 `103.102.166.224` | **可达**（v4）；v6 路由 `网络不可达` |
| `upload.wikimedia.org`（原图 / 非标准缩略图） | v4 `103.102.166.240` / v6 `2001:df2:e500:ed1a::2:b` | **不可达**：v6 immediate unreachable，v4 TCP/443 连接超时（`curl` 与 Node `fetch` 一致） |
| `raw.githubusercontent.com` | — | 可达（本次未启用备选镜像） |

关键判定：`curl --resolve upload.wikimedia.org:443:208.80.154.240` 能拿到 200 → **域名、证书、脚本都没问题，是本机到 `103.102.166.240` 这个 anycast 地址的路由不通**。因此不换镜像源也能修好：只要不去 `upload.wikimedia.org` 就行。

### 2.1 故障：`node scripts/fetch-cards.mjs` → `✗ fetch failed`

- **现象**：原脚本在 `listTitles()` / 下载阶段抛 `fetch failed`（Node undici 的通用网络错误，`cause.code = ETIMEDOUT`）。
- **根因**（三重叠加）：
  1. `imageinfo` 返回的 `thumburl` 指向 **`upload.wikimedia.org`**（当请求宽度 ≥ 原图宽度时返回原图、或走老 CDN 主机）——该主机本机不可达；
  2. 该主机的 v6 路由不可达、v4 连接超时，Node 与 curl 复现一致；
  3. 即使打 `commons.wikimedia.org` API 也会**偶发** `ETIMEDOUT` + 高频触发 `429`，原脚本没有任何重试。
- **解法**（已落在 `scripts/fetch-cards.mjs`）：
  1. **只从 `thumb.wikimedia.org` 取图**，并强制走「标准缩略尺寸」：请求 `iiurlwidth=1200`，MediaWiki 会**向上取整到 1280px 标准尺寸**（标准集：20/40/60/120/250/330/500/960/1280/1920/3840，见 [Common thumbnail sizes](https://w.wiki/GHai)），1280 ≥ 产物 1200w，缩放无损；
  2. `normalizeThumb()` 兜底：万一仍拿到 `upload.wikimedia.org` 的 `/thumb/...` 路径就改写主机名；拿到原图路径（无 `/thumb/`）则**直接报错**（提示调小 `iiurlwidth`），绝不静默走不可达主机；
  3. 所有 HTTP 走 `fetchRetry()`：指数退避 + 抖动（800ms×2ⁿ，上限 20s）、`429` 读 `Retry-After`、默认 6 次、致命 4xx 不重试；
  4. `dns.setDefaultResultOrder('ipv4first')`：本机 v6 路由不可达，先走 v4 省一次失败；
  5. 下载并发 4，先写 `.part` 再原子 rename，校验 PNG magic + 最小体积，杜绝把错误页当源图。

### 2.2 故障：非标准缩略尺寸被 `400` 拒绝

- `https://thumb.wikimedia.org/.../1200px-xxx.png` 直连返回 **400**，页面提示 `Use thumbnail sizes listed on https://w.wiki/GHai`（T414805：热链只接受标准尺寸）。
- **解法**：不要自己拼缩略图 URL，一律用 `imageinfo` 返回的 `thumburl`；请求宽度取 1200 → 服务端给 1280px 标准尺寸。

### 2.3 故障：偶发 `ETIMEDOUT` / `429`

- **解法**：见 §2.1 第 3 点。实测 78 张下载过程中出现多次重试，全部自愈，最终 78/78 成功。
- API 查询做了限速（每批 26 个标题、批间 sleep 900ms，共 4 次请求），避免触发 429。

### 2.4 故障：源图 RGBA 圆角透明 → 编码后黑角

- 源图是 RGBA，四角有约 **0.09%** 的圆角透明像素（alpha=0）。
- 原 `encode_cards.py` 直接 `convert("RGB")` 会丢掉 alpha → 圆角处变**黑点**。
- **解法**：先 `alpha_composite` 到白底再转 RGB（牌面本身自带白边，与常见浅色 UI 无缝）。

### 2.5 AVIF 编码依赖

- AVIF 需要 `pillow-avif-plugin`；本机已装到 `scripts/.pylibs/`（1.6.0，自带 `pillow_avif_plugin.libs`）。
- `scripts/encode-cards.mjs` 会自动把 `PYTHONPATH` 前置为 `scripts/.pylibs`；**手动**跑 `encode_cards.py` 必须自己带：`PYTHONPATH=scripts/.pylibs python3 scripts/encode_cards.py ...`。
- 插件缺失时脚本自动降级为纯 WebP（不会硬失败），但本环境已验证 AVIF 可用。

---

## 3. 重跑命令

```bash
cd divination-station

# ① 全量：查 Commons API + 下载源图 + 编码（缓存命中时几乎秒回，无需网络）
npm run fetch:cards

# ② 强制重新查询 Commons 元数据（牌名/文件有变动时）
npm run fetch:cards -- --refresh-meta

# ③ 离线重编码：只用 .card-cache 里已有的源图重新出 480/1200 WebP + 1200 AVIF
npm run fetch:cards -- --skip-download
npm run encode:cards            # 等价：只跑编码步骤

# ④ 运行时探针：strip-types 能否加载 vendor 模块 + GUANWEI_DATA_DIR 是否生效
GUANWEI_DATA_DIR="$PWD/data" node --experimental-strip-types scripts/probe-runtime.ts

# ⑤ 重新生成 §6 的映射表（输出到 stdout）
node scripts/gen-card-table.mjs
```

> 说明：`npm run fetch:cards -- --xxx` 里的 `--` 是 npm 透传参数的必需写法。
> 首次全量需要联网（约 4 次 API 请求 + 78 个 1280px PNG，约 340MB，实测 10–15 分钟）；之后全部走缓存。

### 3.1 环境变量（跑服务时必带）

```bash
GUANWEI_DATA_DIR="$PWD/data" npm start      # 或 npm run dev
```

不设该变量时，`vendor/guanwei/server/src/services/dataDir.ts` 的 `pickDataDir()` 会回退到 `~/.guanwei/data`（用户主目录），数据就跑到项目外了。探针 ④ 会对这一条做断言。

---

## 4. 校验（本任务实跑结果）

```bash
# 产物数量
ls public/img/cards/480/*.webp   | wc -l   # → 78
ls public/img/cards/1200/*.webp  | wc -l   # → 78
ls public/img/cards/1200/*.avif  | wc -l   # → 78

# 依赖与探针
npm ls --depth=0                            # → exit 0，无 missing/extraneous
GUANWEI_DATA_DIR="$PWD/data" node --experimental-strip-types scripts/probe-runtime.ts   # → exit 0
```

本任务实跑输出：

```text
$ ls public/img/cards/480/*.webp   | wc -l   → 78
$ ls public/img/cards/1200/*.webp  | wc -l   → 78
$ ls public/img/cards/1200/*.avif  | wc -l   → 78      # 480/ 下不产 avif（只有 1200 需要）

$ npm ls --depth=0
divination-station@1.0.0 …
├── astronomy-engine@2.1.19
├── cors@2.8.6
├── express@4.22.3
└── lunar-typescript@1.8.7
exit=0                                            # 无 missing / extraneous

$ GUANWEI_DATA_DIR="$PWD/data" node --experimental-strip-types scripts/probe-runtime.ts
✓ tarotCards 数量 = 78 — 78
✓ slug 唯一 — 78 个
✓ 中英文牌名齐全
✓ DATA_DIR = <项目>/data — …/divination-station/data
✓ dataFile() 落在 DATA_DIR — …/divination-station/data/probe.txt
✓ DATA_DIR 可写
✓ Node ≥ 22.13 — 22.23.3
✓ 运行时探针全部通过
exit=0
```

逐文件校验（234 个产物全部用 Pillow 打开并 `load()`，AVIF 需先 `import pillow_avif`）：

```text
文件总数: 234
尺寸集合 480/webp  [(480, 823)]        # 78 个，全部一致
尺寸集合 1200/webp [(1200, 2057)]      # 78 个，全部一致
尺寸集合 1200/avif [(1200, 2057)]      # 78 个，全部一致，format=AVIF
slug 集合 = meta.json 的 78 个 slug，无缺无多
比例偏差 |r − 7/12| ≤ 0.005 全部通过
the-fool 480 角像素 (255,255,255)      # RGBA 圆角已白底合成，无黑角
错误: 0
```

重复运行（缓存全命中，零网络）：

```text
$ time npm run fetch:cards -- --skip-download
① 元数据缓存命中（78 张），跳过 API 查询
② --skip-download：源图缓存齐全
③ 编码 WebP/AVIF…  → 78/78
✓ 完成：480/78.webp + 1200/78.webp + 1200/78.avif → public/img/cards
exit=0        real 0m29.6s
```

---

## 5. 图片规格（前端取图约定）

| 产物 | 尺寸 | 编码参数 | 用途 |
| --- | --- | --- | --- |
| `public/img/cards/480/<slug>.webp` | 480 × 823 | WebP quality 82, method 4 | **低性能模式**（省流量） |
| `public/img/cards/1200/<slug>.webp` | 1200 × 2057 | WebP quality 78, method 4 | **高性能模式**回退 / WebP 不可用时 |
| `public/img/cards/1200/<slug>.avif` | 1200 × 2057 | AVIF quality 72, speed 8 | **高性能模式**首选源 |

- **比例**：源图 Commons RWS deck 全部为 `2100 × 3600`（= 7:12 精确），取 1280px 标准缩略后为 `1280 × 2194`，产物 `480 × 823`（0.5832）与 `1200 × 2057`（0.5834）均为**约 7:12** 竖版（7/12 = 0.58333）。
- **slug 规则**：`nameEn` → 小写 → 非字母数字压成 `-`。例：`The Fool` → `the-fool`，`Ace of Pentacles` → `ace-of-pentacles`。
- **版权**：Rider–Waite–Smith 牌面由 Pamela Colman Smith 绘制（1909），已进入公共领域；来源 [Wikimedia Commons: Rider-Waite Smith tarot deck](https://commons.wikimedia.org/wiki/Category:Rider-Waite_Tarot_deck)。
- **标题映射**：Commons 文件名 = `<nameEn> (Rider-Waite Smith tarot deck).png`；例外两张王牌存为 `One of …`：`Ace of Pentacles`→`One of Pentacles`、`Ace of Swords`→`One of Swords`（脚本内 `ALIASES`）。
- 运行时**零网络依赖**：前端直接引用 `public/img/cards/...` 静态路径即可。

---

## 6. 78 张牌 slug ↔ 中英文映射表

由 `node scripts/gen-card-table.mjs` 生成，数据源 = `vendor/guanwei/shared/core/data/tarotCards.ts` 的 `name` / `nameEn`（运行时唯一权威牌名），顺序即牌组顺序（大阿卡纳 22 + 小阿卡纳 56）。

| # | slug | nameEn | nameZh | 组别 |
| ---: | --- | --- | --- | --- |
| 1 | `the-fool` | The Fool | 愚者 | 大阿卡纳 |
| 2 | `the-magician` | The Magician | 魔术师 | 大阿卡纳 |
| 3 | `the-high-priestess` | The High Priestess | 女祭司 | 大阿卡纳 |
| 4 | `the-empress` | The Empress | 女皇 | 大阿卡纳 |
| 5 | `the-emperor` | The Emperor | 皇帝 | 大阿卡纳 |
| 6 | `the-hierophant` | The Hierophant | 教皇 | 大阿卡纳 |
| 7 | `the-lovers` | The Lovers | 恋人 | 大阿卡纳 |
| 8 | `the-chariot` | The Chariot | 战车 | 大阿卡纳 |
| 9 | `strength` | Strength | 力量 | 大阿卡纳 |
| 10 | `the-hermit` | The Hermit | 隐者 | 大阿卡纳 |
| 11 | `wheel-of-fortune` | Wheel of Fortune | 命运之轮 | 大阿卡纳 |
| 12 | `justice` | Justice | 正义 | 大阿卡纳 |
| 13 | `the-hanged-man` | The Hanged Man | 倒吊人 | 大阿卡纳 |
| 14 | `death` | Death | 死神 | 大阿卡纳 |
| 15 | `temperance` | Temperance | 节制 | 大阿卡纳 |
| 16 | `the-devil` | The Devil | 恶魔 | 大阿卡纳 |
| 17 | `the-tower` | The Tower | 塔 | 大阿卡纳 |
| 18 | `the-star` | The Star | 星星 | 大阿卡纳 |
| 19 | `the-moon` | The Moon | 月亮 | 大阿卡纳 |
| 20 | `the-sun` | The Sun | 太阳 | 大阿卡纳 |
| 21 | `judgement` | Judgement | 审判 | 大阿卡纳 |
| 22 | `the-world` | The World | 世界 | 大阿卡纳 |
| 23 | `ace-of-wands` | Ace of Wands | 权杖首牌 | 小阿卡纳·权杖 |
| 24 | `two-of-wands` | Two of Wands | 权杖二 | 小阿卡纳·权杖 |
| 25 | `three-of-wands` | Three of Wands | 权杖三 | 小阿卡纳·权杖 |
| 26 | `four-of-wands` | Four of Wands | 权杖四 | 小阿卡纳·权杖 |
| 27 | `five-of-wands` | Five of Wands | 权杖五 | 小阿卡纳·权杖 |
| 28 | `six-of-wands` | Six of Wands | 权杖六 | 小阿卡纳·权杖 |
| 29 | `seven-of-wands` | Seven of Wands | 权杖七 | 小阿卡纳·权杖 |
| 30 | `eight-of-wands` | Eight of Wands | 权杖八 | 小阿卡纳·权杖 |
| 31 | `nine-of-wands` | Nine of Wands | 权杖九 | 小阿卡纳·权杖 |
| 32 | `ten-of-wands` | Ten of Wands | 权杖十 | 小阿卡纳·权杖 |
| 33 | `page-of-wands` | Page of Wands | 权杖侍从 | 小阿卡纳·权杖 |
| 34 | `knight-of-wands` | Knight of Wands | 权杖骑士 | 小阿卡纳·权杖 |
| 35 | `queen-of-wands` | Queen of Wands | 权杖王后 | 小阿卡纳·权杖 |
| 36 | `king-of-wands` | King of Wands | 权杖国王 | 小阿卡纳·权杖 |
| 37 | `ace-of-cups` | Ace of Cups | 圣杯首牌 | 小阿卡纳·圣杯 |
| 38 | `two-of-cups` | Two of Cups | 圣杯二 | 小阿卡纳·圣杯 |
| 39 | `three-of-cups` | Three of Cups | 圣杯三 | 小阿卡纳·圣杯 |
| 40 | `four-of-cups` | Four of Cups | 圣杯四 | 小阿卡纳·圣杯 |
| 41 | `five-of-cups` | Five of Cups | 圣杯五 | 小阿卡纳·圣杯 |
| 42 | `six-of-cups` | Six of Cups | 圣杯六 | 小阿卡纳·圣杯 |
| 43 | `seven-of-cups` | Seven of Cups | 圣杯七 | 小阿卡纳·圣杯 |
| 44 | `eight-of-cups` | Eight of Cups | 圣杯八 | 小阿卡纳·圣杯 |
| 45 | `nine-of-cups` | Nine of Cups | 圣杯九 | 小阿卡纳·圣杯 |
| 46 | `ten-of-cups` | Ten of Cups | 圣杯十 | 小阿卡纳·圣杯 |
| 47 | `page-of-cups` | Page of Cups | 圣杯侍从 | 小阿卡纳·圣杯 |
| 48 | `knight-of-cups` | Knight of Cups | 圣杯骑士 | 小阿卡纳·圣杯 |
| 49 | `queen-of-cups` | Queen of Cups | 圣杯王后 | 小阿卡纳·圣杯 |
| 50 | `king-of-cups` | King of Cups | 圣杯国王 | 小阿卡纳·圣杯 |
| 51 | `ace-of-swords` | Ace of Swords | 宝剑首牌 | 小阿卡纳·宝剑 |
| 52 | `two-of-swords` | Two of Swords | 宝剑二 | 小阿卡纳·宝剑 |
| 53 | `three-of-swords` | Three of Swords | 宝剑三 | 小阿卡纳·宝剑 |
| 54 | `four-of-swords` | Four of Swords | 宝剑四 | 小阿卡纳·宝剑 |
| 55 | `five-of-swords` | Five of Swords | 宝剑五 | 小阿卡纳·宝剑 |
| 56 | `six-of-swords` | Six of Swords | 宝剑六 | 小阿卡纳·宝剑 |
| 57 | `seven-of-swords` | Seven of Swords | 宝剑七 | 小阿卡纳·宝剑 |
| 58 | `eight-of-swords` | Eight of Swords | 宝剑八 | 小阿卡纳·宝剑 |
| 59 | `nine-of-swords` | Nine of Swords | 宝剑九 | 小阿卡纳·宝剑 |
| 60 | `ten-of-swords` | Ten of Swords | 宝剑十 | 小阿卡纳·宝剑 |
| 61 | `page-of-swords` | Page of Swords | 宝剑侍从 | 小阿卡纳·宝剑 |
| 62 | `knight-of-swords` | Knight of Swords | 宝剑骑士 | 小阿卡纳·宝剑 |
| 63 | `queen-of-swords` | Queen of Swords | 宝剑王后 | 小阿卡纳·宝剑 |
| 64 | `king-of-swords` | King of Swords | 宝剑国王 | 小阿卡纳·宝剑 |
| 65 | `ace-of-pentacles` | Ace of Pentacles | 星币首牌 | 小阿卡纳·星币 |
| 66 | `two-of-pentacles` | Two of Pentacles | 星币二 | 小阿卡纳·星币 |
| 67 | `three-of-pentacles` | Three of Pentacles | 星币三 | 小阿卡纳·星币 |
| 68 | `four-of-pentacles` | Four of Pentacles | 星币四 | 小阿卡纳·星币 |
| 69 | `five-of-pentacles` | Five of Pentacles | 星币五 | 小阿卡纳·星币 |
| 70 | `six-of-pentacles` | Six of Pentacles | 星币六 | 小阿卡纳·星币 |
| 71 | `seven-of-pentacles` | Seven of Pentacles | 星币七 | 小阿卡纳·星币 |
| 72 | `eight-of-pentacles` | Eight of Pentacles | 星币八 | 小阿卡纳·星币 |
| 73 | `nine-of-pentacles` | Nine of Pentacles | 星币九 | 小阿卡纳·星币 |
| 74 | `ten-of-pentacles` | Ten of Pentacles | 星币十 | 小阿卡纳·星币 |
| 75 | `page-of-pentacles` | Page of Pentacles | 星币侍从 | 小阿卡纳·星币 |
| 76 | `knight-of-pentacles` | Knight of Pentacles | 星币骑士 | 小阿卡纳·星币 |
| 77 | `queen-of-pentacles` | Queen of Pentacles | 星币王后 | 小阿卡纳·星币 |
| 78 | `king-of-pentacles` | King of Pentacles | 星币国王 | 小阿卡纳·星币 |
