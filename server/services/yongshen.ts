// 六爻「用神候选」推导（自写，不依赖 vendor）：
// 按所问之事的关键词 → 六亲 → 卦中纳甲爻位，给 AI 解读一个聚焦方向。
//
// 取用神规则（增删须与 README/docs 同步）：
//   问财          → 妻财爻
//   问事业/官司/工作 → 官鬼爻
//   问父母/文书/房子  → 父母爻
//   问子女/宠物/平安  → 子孙爻
//   问兄弟/朋友/合伙  → 兄弟爻
//   无匹配        → 以世爻为候选
//
// 另可传入问题分类 select（docs/design.md §4.3 映射：财运→妻财、事业/官职→官鬼、
// 学业/文书/合同→父母、子女/创作→子孙、健康→官鬼（世爻另标）、人际/竞争→兄弟），
// 分类命中的六亲排在最前，再叠加关键词命中的其余六亲。
//
// 输出只给「爻位 + 纳甲干支 + 六亲 + 六神 + 世应/动/旬空」，绝不代替排盘事实本身。

export interface CandidateLine {
  pos: number;          // 1-6（初爻=1）
  posName: string;      // 初爻/二爻/…/上爻
  gz: string;           // 纳甲干支（如 己酉）
  liuqin: string;       // 妻财/官鬼/父母/子孙/兄弟
  shen: string;         // 六神
  isShi: boolean;
  isYing: boolean;
  kong: boolean;        // 旬空
  dong: boolean;        // 动爻
}

export interface YongshenCandidate {
  liuqin: string;       // 六亲（纳甲）
  reason: string;       // 触发的规则说明
  matched: string[];    // 命中的问题关键词
  lines: CandidateLine[];   // 卦中该六亲的爻（可能为空 → 用神不上卦）
}

export interface YongshenResult {
  /** 首选用神（无匹配时 = 世爻六亲） */
  primary: YongshenCandidate;
  /** 全部命中候选（按规则优先级排序，含 primary） */
  candidates: YongshenCandidate[];
  /** 世爻参考（始终给出） */
  shi: CandidateLine | null;
  matchedAny: boolean;
  text: string;         // 可直接拼进提示词的中文段落
}

const POS_NAMES = ['初', '二', '三', '四', '五', '上'];
export function posName(pos: number): string {
  return (POS_NAMES[pos - 1] || String(pos)) + '爻';
}

/** 关键词 → 六亲 规则表（顺序 = 优先级，与任务口径一致） */
const RULES: { liuqin: string; reason: string; kws: string[] }[] = [
  {
    liuqin: '妻财', reason: '问财（财运/收入/生意/投资）',
    kws: ['财运', '钱财', '收入', '生意', '投资', '盈利', '赚钱', '赚钱', '奖金', '工资', '薪资', '报酬', '收益', '债', '股票', '基金', '买房的钱', '钱'],
  },
  {
    liuqin: '官鬼', reason: '问事业/官司/工作',
    kws: ['事业', '官司', '工作', '职位', '升职', '晋升', '诉讼', '打官司', '老板', '领导', '编制', '考公', '应聘', '面试', '项目'],
  },
  {
    liuqin: '父母', reason: '问父母/文书/房子',
    kws: ['父母', '爸妈', '爹', '妈', '文书', '房子', '房', '屋', '房产', '合同', '学业', '考试', '成绩', '文凭', '证件', '车辆', '车'],
  },
  {
    liuqin: '子孙', reason: '问子女/宠物/平安',
    kws: ['子女', '孩子', '小孩', '宝宝', '宠物', '猫', '狗', '平安', '健康', '病', '就医', '吃药', '怀孕', '生育'],
  },
  {
    liuqin: '兄弟', reason: '问兄弟/朋友/合伙',
    kws: ['兄弟', '朋友', '合伙', '合作', '同辈', '闺蜜', '室友', '同事'],
  },
];

/**
 * 问题分类 select → 六亲（docs/design.md §4.3「用神候选映射」）。
 * 仅作关键词之外的补充输入：分类命中时该六亲排在最前，其余仍按上面的关键词规则列出。
 * 空串 = 该分类不指定六亲（综合/感情/未分类）→ 交给关键词规则，再兜底到世爻。
 */
const CATEGORY_MAP: Record<string, string> = {
  '综合': '', '感情': '', '未分类': '',
  '财运': '妻财',
  '事业': '官鬼', '官职': '官鬼',
  '学业': '父母', '文书': '父母', '合同': '父母',
  '子女': '子孙', '创作': '子孙',
  '健康': '官鬼',                    // design：健康 → 官鬼（忌）与世爻并标；世爻始终在下方单列
  '人际': '兄弟', '竞争': '兄弟',
};

function toLine(raw: any, pos: number, dongYao: number[]): CandidateLine {
  const l = raw.najia.lines[pos - 1];
  return {
    pos,
    posName: posName(pos),
    gz: l.gz,
    liuqin: l.liuqin,
    shen: l.shen,
    isShi: !!l.isShi,
    isYing: !!l.isYing,
    kong: !!l.kong,
    dong: Array.isArray(dongYao) && dongYao.includes(pos),
  };
}

function lineText(l: CandidateLine): string {
  const marks = [l.isShi ? '世' : '', l.isYing ? '应' : '', l.dong ? '动爻' : '', l.kong ? '旬空' : ''].filter(Boolean).join('、');
  return l.posName + ' ' + l.gz + l.liuqin + '（' + l.shen + '）' + (marks ? '［' + marks + '］' : '');
}

/**
 * 推导用神候选。
 * @param question 所问之事（可空）
 * @param resultRaw chartCalc('liuyao', {}) 的结果，需含 najia
 * @param category  问题分类（可空，前端 select：综合/感情/事业/财运/学业/健康/人际）
 */
export function deriveYongshen(question: string | undefined, resultRaw: any, category?: string): YongshenResult | null {
  if (!resultRaw || !resultRaw.najia || !Array.isArray(resultRaw.najia.lines) || resultRaw.najia.lines.length !== 6) return null;
  const dongYao: number[] = Array.isArray(resultRaw.dongYao) ? resultRaw.dongYao : [];
  const q = String(question || '');
  const cat = String(category || '').trim();
  const shiRaw = resultRaw.najia.lines.findIndex((l: any) => l.isShi);
  const shi = shiRaw >= 0 ? toLine(resultRaw, shiRaw + 1, dongYao) : null;

  const linesOf = (liuqin: string): CandidateLine[] =>
    resultRaw.najia.lines
      .map((l: any, i: number) => (l.liuqin === liuqin ? toLine(resultRaw, i + 1, dongYao) : null))
      .filter(Boolean) as CandidateLine[];

  const candidates: YongshenCandidate[] = [];
  const seen = new Set<string>();
  const push = (liuqin: string, reason: string, matched: string[]) => {
    if (!liuqin || seen.has(liuqin)) return;
    seen.add(liuqin);
    candidates.push({ liuqin, reason, matched, lines: linesOf(liuqin) });
  };

  // ① 分类 select 优先（design §4.3 映射；未分类/综合/感情 → 空，交给关键词）
  const catLiuqin = CATEGORY_MAP[cat];
  if (catLiuqin) push(catLiuqin, `按问题分类「${cat}」取用神`, []);
  // ② 关键词规则（与任务口径一致，顺序即优先级）
  for (const rule of RULES) {
    const matched = rule.kws.filter(k => q.includes(k));
    if (matched.length === 0) continue;
    push(rule.liuqin, rule.reason, [...new Set(matched)]);
  }

  const matchedAny = candidates.length > 0;
  const primary: YongshenCandidate = matchedAny
    ? candidates[0]
    : {
        liuqin: shi ? shi.liuqin : '世爻',
        reason: '未匹配到问题关键词与分类，按规则以世爻为候选',
        matched: [],
        lines: shi ? [shi] : [],
      };

  const oneLine = (c: YongshenCandidate, tag: string): string =>
    '· ' + tag + c.liuqin + '——' + c.reason
    + (c.matched.length ? '（命中关键词：' + c.matched.join('、') + '）' : '')
    + '：'
    + (c.lines.length
        ? c.lines.map(lineText).join('；')
        : '本卦六亲中未见' + c.liuqin + '爻（用神不上卦，须寻伏神，勿自行补造）')
    + '。';

  const L: string[] = [];
  L.push('【用神候选（按问题关键词与分类推导，仅用于聚焦解读方向，不替代上方排盘事实）】');
  L.push(oneLine(primary, '首选'));
  for (const c of candidates.slice(1)) L.push(oneLine(c, '备选'));
  if (shi) L.push('· 世爻参考：' + lineText(shi) + '。');
  L.push('· 若上述候选与【排盘事实】冲突，一律以【排盘事实】为准；不得自行增删爻位或改写纳甲六亲。');

  return { primary, candidates, shi, matchedAny, text: L.join('\n') };
}
