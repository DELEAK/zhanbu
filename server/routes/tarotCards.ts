// GET /api/tarot/cards —— vendored 观微路由的外层包装（不修改 vendor 源码）。
//
// vendor 的路由原样返回 tarotCards（无图片信息）；本路由先应答 /cards，
// 为每张牌补 slug 与三档图片 URL，其余四个 tarot 端点仍由 vendor tarotRouter 处理。
//
// slug 规则与 scripts/fetch-cards.mjs 的 slugOf()、docs/env.md 完全一致：
//   nameEn 转小写 → 非字母数字连续段压成 '-'
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { tarotCards } from '../../vendor/guanwei/shared/core/data/tarotCards.ts';
import { CARD_IMG_DIR } from '../paths.ts';

export function cardSlug(nameEn: string): string {
  return String(nameEn ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** 文件存在 → 返回 /img/... 公开 URL；不存在 → ''（前端回退 480 webp 或不显示大图） */
function urlIfExists(rel: string): string {
  return fs.existsSync(path.join(CARD_IMG_DIR, rel)) ? '/img/cards/' + rel : '';
}

export interface CardImageFields {
  slug: string;
  imgLow: string;      // /img/cards/480/<slug>.webp
  imgHiWebP: string;   // /img/cards/1200/<slug>.webp
  imgHiAvif: string;   // /img/cards/1200/<slug>.avif
}

/** 给单张牌补图片字段（每请求现算：图片由 env 任务后续生成，避免启动期缓存成空值） */
export function withImages(card: any): any {
  const slug = cardSlug(card.nameEn);
  const img: CardImageFields = {
    slug,
    imgLow: urlIfExists(path.join('480', slug + '.webp')),
    imgHiWebP: urlIfExists(path.join('1200', slug + '.webp')),
    imgHiAvif: urlIfExists(path.join('1200', slug + '.avif')),
  };
  return { ...card, ...img };
}

const router = Router();

// 只接管 GET /cards；其余方法/路径放行给 vendor tarotRouter
router.get('/cards', (_req, res) => {
  res.json({ cards: tarotCards.map(withImages) });
});

export default router;
