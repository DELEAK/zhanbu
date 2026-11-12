// 项目路径常量（与 cwd 无关，按文件自身位置推导）
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** .../divination-station/server */
export const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
/** .../divination-station */
export const ROOT = path.resolve(SERVER_DIR, '..');
/** 静态站点根 .../divination-station/public */
export const PUBLIC_DIR = path.join(ROOT, 'public');
/** 牌面图片根 .../divination-station/public/img/cards（480/ 与 1200/ 两个子目录） */
export const CARD_IMG_DIR = path.join(PUBLIC_DIR, 'img', 'cards');
/** 运行时数据目录（guanwei.db 落点），由 bootstrap.mjs 注入 GUANWEI_DATA_DIR */
export const DATA_DIR = process.env.GUANWEI_DATA_DIR || path.join(ROOT, 'data');
