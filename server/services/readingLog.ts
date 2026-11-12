// 起占记录访问元数据（IP / UA / 来源）与查看用查询
//
// 表结构：divinations_access 与 guanwei 的 divinations 一对一（divine_id 主键），
// 不改上游表结构（vendor 代码插入 divinations 时不会写这些列，因此单独建表）。
//
// 隐私说明：本模块会把访问者 IP 与 UA 落库，属于可识别信息；默认只在你自己部署的
// 服务器上使用，查看入口走 /api/admin/*（需 DIVINATION_ADMIN_TOKEN），不对外暴露。
import { getDb } from '../../vendor/guanwei/server/src/services/db.ts';

const MAX_IP = 64;
export const MAX_UA = 300;

export interface AccessInfo {
  ip?: string;
  ua?: string;
  referer?: string;
}

let ensured = false;

export function ensureAccessTable(): void {
  if (ensured) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS divinations_access (
      divine_id   TEXT PRIMARY KEY,
      ip          TEXT,
      ua          TEXT,
      referer     TEXT,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_access_time ON divinations_access(created_at DESC);
  `);
  ensured = true;
}

function clip(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  return s || null;
}

/** 记录一次起占的访问来源（divine_id 必须已存在于 divinations） */
export function recordAccess(divineId: string, info: AccessInfo): void {
  ensureAccessTable();
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO divinations_access (divine_id, ip, ua, referer, created_at)
              VALUES (?, ?, ?, ?, ?)`).run(
    divineId,
    clip(info.ip, MAX_IP),
    clip(info.ua, MAX_UA),
    clip(info.referer, MAX_UA),
    Date.now(),
  );
}

export interface RecordRow {
  id: string;
  artId: string;
  question: string | null;
  createdAt: string;
  createdAtMs: number;
  ip: string | null;
  ua: string | null;
  referer: string | null;
  hasReport: boolean;
  status: string;
  // 简要预览：塔罗=牌面数量/牌阵；六爻=本卦→变卦
  summary: string;
}

/** 时间戳统一转东八区字符串（divinations.created_at 可能是 ms 整数，也可能是旧版的 ISO 文本） */
export function fmtStamp(v: unknown): string {
  if (v == null || v === '') return '';
  let ms: number;
  if (typeof v === 'number' || /^\d+$/.test(String(v))) ms = Number(v);
  else {
    const t = Date.parse(String(v));
    if (Number.isNaN(t)) return String(v);
    ms = t;
  }
  if (!Number.isFinite(ms)) return String(v);
  const d = new Date(ms + 8 * 3600_000); // 固定东八区，避免受服务器时区影响
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** 列表（按时间倒序），不含大字段 result_raw_json，供管理页表格用 */
export function listRecords(opts: { limit?: number; offset?: number; artId?: string } = {}) {
  ensureAccessTable();
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const offset = Math.max(Number(opts.offset) || 0, 0);
  const artId = opts.artId && opts.artId !== 'all' ? String(opts.artId) : null;
  const db = getDb();

  const where = artId ? 'WHERE d.art_id = ?' : '';
  const args = artId ? [artId] : [];

  const total = Number(db.prepare(`SELECT count(*) c FROM divinations d ${where}`).get(...args).c);
  const rows = db.prepare(`
    SELECT d.id, d.art_id, d.question, d.created_at, d.status, d.report_json IS NOT NULL AS has_report,
           d.result_raw_json, a.ip, a.ua, a.referer
      FROM divinations d
      LEFT JOIN divinations_access a ON a.divine_id = d.id
      ${where}
     ORDER BY d.created_at DESC
     LIMIT ? OFFSET ?
  `).all(...args, limit, offset);

  return { total, limit, offset, list: rows.map(toRow) };
}

function toRow(r: any): RecordRow {
  let summary = '';
  try {
    const raw = JSON.parse(r.result_raw_json);
    if (r.art_id === 'tarot') {
      const n = Array.isArray(raw?.cards) ? raw.cards.length : 0;
      summary = (raw?.spread?.name || raw?.spread?.id || '') + ` · ${n} 张`;
    } else if (r.art_id === 'liuyao') {
      const ben = raw?.benGua?.name || raw?.benGua?.nm || '?';
      const bian = raw?.bianGua?.name || raw?.bianGua?.nm || '';
      const dong = Array.isArray(raw?.dongYao) ? raw.dongYao.join(',') : '';
      summary = `本卦 ${ben}` + (bian ? ` → 变卦 ${bian}` : '（无变卦）') + (dong ? ` · 动爻 ${dong}` : '');
    }
  } catch { /* 摘要失败不影响列表 */ }
  return {
    id: r.id,
    artId: r.art_id,
    question: r.question || null,
    createdAt: fmtStamp(r.created_at),
    createdAtMs: Number(r.created_at) || 0,
    ip: r.ip || null,
    ua: r.ua || null,
    referer: r.referer || null,
    hasReport: Boolean(r.has_report),
    status: r.status,
    summary,
  };
}

/** 单条完整记录（含盘面 / 解读报告 / 来源） */
export function getRecord(id: string) {
  ensureAccessTable();
  const db = getDb();
  const row: any = db.prepare(`
    SELECT d.*, a.ip, a.ua, a.referer
      FROM divinations d
      LEFT JOIN divinations_access a ON a.divine_id = d.id
     WHERE d.id = ?
  `).get(String(id));
  if (!row) return null;
  const parse = (s: string | null) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
  return {
    id: row.id,
    artId: row.art_id,
    kind: row.kind,
    question: row.question || null,
    createdAt: fmtStamp(row.created_at),
    createdAtMs: Number(row.created_at) || 0,
    status: row.status,
    params: parse(row.params_json),
    resultRaw: parse(row.result_raw_json),
    report: parse(row.report_json),
    reportQuality: row.report_quality || null,
    access: { ip: row.ip || null, ua: row.ua || null, referer: row.referer || null },
  };
}

/** CSV 导出（带 UTF-8 BOM，Excel 直接双击不乱码） */
export function recordsCsv(rows: RecordRow[]): string {
  const head = ['时间', '术数', '问题', '摘要', '来源IP', 'UA', 'Referer', '有AI解读', '记录ID'];
  const esc = (v: unknown) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = rows.map(r => [
    r.createdAt,
    r.artId, r.question || '', r.summary, r.ip || '', r.ua || '', r.referer || '',
    r.hasReport ? '是' : '否', r.id,
  ].map(esc).join(','));
  return '\ufeff' + [head.map(esc).join(','), ...lines].join('\r\n') + '\r\n';
}
