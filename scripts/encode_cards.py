#!/usr/bin/env python3
"""牌面编码：.card-cache/<slug>.src → public/img/cards/{480,1200}/<slug>.{webp,avif}

- WebP：始终生成（480w 低性能模式 / 1200w 高性能模式回退）。
- AVIF：仅当 pillow-avif-plugin 可导入时生成（1200w 高性能模式优先源）。
用法：PYTHONPATH=<libdir> python3 encode_cards.py <cache_dir> <out_dir> <slugs.json>
"""
import json
import os
import sys

from PIL import Image

AVIF = False
try:
    import pillow_avif  # noqa: F401
    try:
        from pillow_avif import register_avif_opener
        register_avif_opener()
    except ImportError:
        pass
    AVIF = True
except Exception as e:  # 缺失时静默降级为纯 WebP
    print(f"[encode] AVIF 不可用（{e}），仅输出 WebP", file=sys.stderr)


def save(img, path, fmt, **opts):
    for attempt in (opts, {k: v for k, v in opts.items() if k == "quality"}):
        try:
            img.save(path, format=fmt, **attempt)
            return
        except (TypeError, ValueError):
            continue
    img.save(path, format=fmt, quality=opts.get("quality", 80))


def main():
    cache, out, slugs_json = sys.argv[1], sys.argv[2], sys.argv[3]
    slugs = json.load(open(slugs_json, encoding="utf-8"))
    missing = [s for s in slugs if not os.path.exists(os.path.join(cache, f"{s}.src"))]
    if missing:
        print(f"[encode] 缺少源文件 {len(missing)} 个: {missing[:5]} ...", file=sys.stderr)
        sys.exit(2)

    os.makedirs(os.path.join(out, "480"), exist_ok=True)
    os.makedirs(os.path.join(out, "1200"), exist_ok=True)

    for i, slug in enumerate(slugs, 1):
        src = Image.open(os.path.join(cache, f"{slug}.src"))
        # 源图是 RGBA，四角有少量圆角透明像素（约 0.09%）。
        # 直接 convert("RGB") 会丢掉 alpha → 圆角处变黑点；先合成到白底
        # （牌面本身自带白边，与 UI 白底无缝）。
        if src.mode in ("RGBA", "LA", "P"):
            rgba = src.convert("RGBA")
            bg = Image.new("RGB", rgba.size, (255, 255, 255))
            bg.paste(rgba, mask=rgba.getchannel("A"))
            src = bg
        else:
            src = src.convert("RGB")
        for width, q in ((480, 82), (1200, 78)):
            w = min(width, src.width)
            h = round(src.height * w / src.width)
            img = src.resize((w, h), Image.LANCZOS)
            base = os.path.join(out, str(width), slug)
            save(img, base + ".webp", "WEBP", quality=q, method=4)
            if AVIF and width == 1200:
                save(img, base + ".avif", "AVIF", quality=q - 6, speed=8)
        if i % 10 == 0 or i == len(slugs):
            print(f"  编码进度 {i}/{len(slugs)}", flush=True)


if __name__ == "__main__":
    main()
