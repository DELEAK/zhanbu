// 七术输入归一化：页面只收集「人话级」输入（公历年月日、时辰、性别、地点、报数…），
// 这里统一校验并换算成 vendor chartCalc 需要的入参。
//
// 换算口径（docs/plan-nine-arts.md §4，已实测，勿改）：
//   · 时辰：hourIndex 0=子 … 11=亥，-1=时辰未知（仅 bazi 支持）
//   · 紫微年干支：用农历年（春节换年）= lunar.getYearGan()+getYearZhi()，不用立春
//   · 农历月：闰月 getMonth() 为负 → Math.abs()（闰月按本月排盘）
//   · 小六壬：农历月/日 + 时辰序
// 校验失败一律 InputError（route 层转 400 BAD_INPUTS 并指明字段）。
import { Solar } from 'lunar-typescript';

export const CHART7_ARTS = ['bazi', 'ziwei', 'astrology', 'qimen', 'liuren', 'meihua', 'xiaoliuren'] as const;
export type Chart7Art = typeof CHART7_ARTS[number];
export const MINGPAN_ARTS: Chart7Art[] = ['bazi', 'ziwei', 'astrology'];

export function isChart7Art(v: unknown): v is Chart7Art {
  return typeof v === 'string' && (CHART7_ARTS as readonly string[]).includes(v);
}

/** 每术的展示元数据（首页/表单/能力清单共用；schema 由 chart.ts 的 CHART_INPUT_SCHEMA 转发） */
export const ART_META: Record<Chart7Art, {
  label: string;
  kind: 'mingpan' | 'zhanwen';
  group: '命盘' | '占问';
  needs: string[];
  note: string;
}> = {
  bazi: { label: '子平八字', kind: 'mingpan', group: '命盘', needs: ['birthDate', 'hour', 'gender'], note: '四柱十神，日主旺衰与大运流年' },
  ziwei: { label: '紫微斗数', kind: 'mingpan', group: '命盘', needs: ['birthDate', 'hour', 'gender'], note: '十二宫十四主星，四化与大限流年' },
  astrology: { label: '西方星盘', kind: 'mingpan', group: '命盘', needs: ['birthDate', 'hour', 'place'], note: '七行星落座落宫，相位与庙旺' },
  qimen: { label: '奇门遁甲', kind: 'zhanwen', group: '占问', needs: ['moment'], note: '九宫八门九星八神，值符值使' },
  liuren: { label: '大六壬', kind: 'zhanwen', group: '占问', needs: ['moment'], note: '四课三传十二天将，课体吉凶' },
  meihua: { label: '梅花易数', kind: 'zhanwen', group: '占问', needs: ['momentOrNumbers'], note: '本卦互卦变卦，体用生克' },
  xiaoliuren: { label: '小六壬', kind: 'zhanwen', group: '占问', needs: ['birthDateOrNumbers'], note: '六神掌诀，吉凶五行方位' },
};

export type NormalizedInput = {
  artId: Chart7Art;
  kind: 'mingpan' | 'zhanwen';
  inputs: Record<string, unknown>;
};

export class InputError extends Error {
  status = 400;
  code = 'BAD_INPUTS';
  field: string;
  constructor(field: string, message: string) {
    super(`${field}：${message}`);
    this.field = field;
    this.name = 'InputError';
  }
}

/* ---------------- 基础校验 ---------------- */

function asObj(v: unknown): Record<string, any> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
}

function intOf(v: unknown, field: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new InputError(field, '必须是整数');
  return n;
}

function intIn(v: unknown, field: string, min: number, max: number, required = true): number | null {
  const n = intOf(v, field);
  if (n === null) {
    if (required) throw new InputError(field, '缺少必填项');
    return null;
  }
  if (n < min || n > max) throw new InputError(field, `必须在 ${min}–${max} 之间（收到 ${n}）`);
  return n;
}

function numIn(v: unknown, field: string, min: number, max: number): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new InputError(field, '必须是数字');
  if (n < min || n > max) throw new InputError(field, `必须在 ${min}–${max} 之间（收到 ${n}）`);
  return n;
}

function genderOf(v: unknown): '男' | '女' {
  const s = String(v ?? '').trim();
  if (s !== '男' && s !== '女') throw new InputError('gender', '只能是「男」或「女」');
  return s;
}

/** 公历日期合法性：Solar.fromYmd 对 2-31 这类越界日期不报错（会顺延），这里用 UTC Date 回读校验 */
function solarOf(v: unknown, field: string): { y: number; m: number; d: number } {
  const o = asObj(v);
  const y = intIn(o.y, field + '.y', 1900, 2100);
  const m = intIn(o.m, field + '.m', 1, 12);
  const d = intIn(o.d, field + '.d', 1, 31);
  const dt = new Date(Date.UTC(y as number, (m as number) - 1, d as number));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== (m as number) - 1 || dt.getUTCDate() !== d) {
    throw new InputError(field + '.d', `公历日期不合法：${y}-${m}-${d}`);
  }
  try {
    Solar.fromYmd(y as number, m as number, d as number);
  } catch {
    throw new InputError(field + '.d', `公历日期不合法：${y}-${m}-${d}`);
  }
  return { y: y as number, m: m as number, d: d as number };
}

function hourIndexOf(v: unknown, opts: { allowUnknown?: boolean } = {}): number {
  const n = intOf(v, 'hourIndex');
  if (n === null) throw new InputError('hourIndex', '缺少必填项（0=子 … 11=亥）');
  if (opts.allowUnknown && n === -1) return -1;
  if (n < 0 || n > 11) throw new InputError('hourIndex', '必须在 0–11 之间（0=子 … 11=亥）');
  return n;
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

/** 时辰序 → 钟表中点（与 bazi 缺省口径一致：子时取 00:30） */
export function hourIndexToClock(hourIndex: number): { hh: number; mm: number } {
  return { hh: (hourIndex * 2) % 24, mm: 30 };
}

/** 经度/纬度（可选） */
function locationOf(v: unknown): Record<string, number> | undefined {
  const o = asObj(v);
  const lng = numIn(o.lng, 'location.lng', -180, 180);
  const lat = numIn(o.lat, 'location.lat', -90, 90);
  if (lng === null && lat === null) return undefined;
  const out: Record<string, number> = {};
  if (lng !== null) out.lng = lng;
  if (lat !== null) out.lat = lat;
  // vendor trueSolarTime 需要 lng；只给了 lat 时按北京经度兜底，避免静默无校正
  if (out.lng === undefined) out.lng = 116.4;
  return out;
}

function lunarOf(y: number, m: number, d: number, hourIndex: number) {
  // 时辰未知（-1）只用于 bazi/ziwei 的缺时辰盘：取子时中点兜底换算农历日期
  const clock = hourIndexToClock(hourIndex < 0 ? 0 : hourIndex);
  const { hh, mm } = clock;
  const solar = Solar.fromYmdHms(y, m, d, hh, mm, 0);
  const lunar = solar.getLunar();
  return {
    ganzhi: lunar.getYearGan() + lunar.getYearZhi(),
    month: Math.abs(lunar.getMonth()),  // 闰月为负 → 按本月
    day: lunar.getDay(),
    time: `${pad2(hh)}:${pad2(mm)}`,
  };
}

function momentOf(v: unknown, field: string): string {
  if (v === null || v === undefined || v === '') return new Date().toISOString();
  const s = String(v).trim();
  const t = Date.parse(s);
  if (Number.isNaN(t)) throw new InputError(field, '不是合法的时刻（建议 ISO 8601 字符串）');
  return new Date(t).toISOString();
}

function numbersOf(o: Record<string, any>, needAll = true): { n1?: number; n2?: number; n3?: number } {
  const out: { n1?: number; n2?: number; n3?: number } = {};
  (['n1', 'n2', 'n3'] as const).forEach((k, i) => {
    const n = intOf(o[k], k);
    if (n === null) {
      if (needAll) throw new InputError(k, '报数起卦需要 n1/n2/n3 三个 1–999 的整数');
      return;
    }
    if (n < 1 || n > 999) throw new InputError(k, '必须在 1–999 之间');
    out[k] = n;
  });
  return out;
}

/* ---------------- 每术归一化 ---------------- */

export function normalizeChartInputs(artId: unknown, rawInputs: unknown): NormalizedInput {
  if (!isChart7Art(artId)) {
    throw new InputError('artId', '只支持七术：bazi / ziwei / astrology / qimen / liuren / meihua / xiaoliuren（六爻走 /api/liuyao、塔罗走 /api/tarot/session）');
  }
  const i = asObj(rawInputs);
  const kind = MINGPAN_ARTS.includes(artId) ? 'mingpan' : 'zhanwen';

  if (artId === 'bazi') {
    const date = solarOf({ y: i.y, m: i.m, d: i.d }, 'birthDate');
    const hourIndex = hourIndexOf(i.hourIndex, { allowUnknown: true });
    const gender = genderOf(i.gender);
    const location = locationOf(i.location);
    let time: string | undefined;
    if (i.time !== null && i.time !== undefined && i.time !== '') {
      const s = String(i.time).trim();
      const mt = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s);
      if (!mt) throw new InputError('time', '必须是 HH:MM（24 小时制）');
      time = pad2(Number(mt[1])) + ':' + mt[2];
    }
    return {
      artId, kind,
      inputs: { y: date.y, m: date.m, d: date.d, hourIndex, gender, time, location },
    };
  }

  if (artId === 'ziwei') {
    const date = solarOf({ y: i.y, m: i.m, d: i.d }, 'birthDate');
    const hourIndex = hourIndexOf(i.hourIndex, { allowUnknown: true });   // 紫微支持「时辰未知」（vendor 按缺时辰盘处理）
    const gender = genderOf(i.gender);
    const location = locationOf(i.location);
    const lunar = lunarOf(date.y, date.m, date.d, hourIndex);
    return {
      artId, kind,
      inputs: {
        ganzhi: lunar.ganzhi,
        month: lunar.month,
        day: lunar.day,
        hour: hourIndex,
        gender,
        birthYear: date.y,
        solarDate: [date.y, date.m, date.d],
        time: lunar.time,
        location,
      },
    };
  }

  if (artId === 'astrology') {
    const date = solarOf({ y: i.y, m: i.m, d: i.d }, 'birthDate');
    const hour = intIn(i.hour, 'hour', 0, 23);
    const min = intIn(i.min ?? 0, 'min', 0, 59);
    // 兼容扁平 lng/lat（§4 契约）与 location 对象两种写法
    const flat = asObj(i.location);
    const lng0 = numIn(i.lng ?? flat.lng, 'lng', -180, 180);
    const lat0 = numIn(i.lat ?? flat.lat, 'lat', -90, 90);
    return {
      artId, kind,
      inputs: { y: date.y, m: date.m, d: date.d, hour, min, lng: lng0 ?? 116.4, lat: lat0 ?? 39.9 },
    };
  }

  if (artId === 'qimen' || artId === 'liuren') {
    return { artId, kind, inputs: { datetime: momentOf(i.datetime, 'datetime') } };
  }

  if (artId === 'meihua') {
    const mode = String(i.mode ?? 'time') === 'number' ? 'number' : 'time';
    if (mode === 'number') {
      const nums = numbersOf(i, true);
      return { artId, kind, inputs: { mode, ...nums } };
    }
    return { artId, kind, inputs: { mode, now: i.now ? momentOf(i.now, 'now') : undefined } };
  }

  // xiaoliuren
  const mode = String(i.mode ?? 'time') === 'number' ? 'num' : 'time';
  if (mode === 'num') {
    const nums = numbersOf(i, true);
    return { artId, kind, inputs: { mode, ...nums } };
  }
  const date = solarOf({ y: i.y, m: i.m, d: i.d }, 'birthDate');
  const hourIndex = hourIndexOf(i.hourIndex);
  const lunar = lunarOf(date.y, date.m, date.d, hourIndex);
  return { artId, kind, inputs: { mode: 'time', m: lunar.month, d: lunar.day, h: hourIndex } };
}
