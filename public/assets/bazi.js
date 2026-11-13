/* 子平八字页：服务端定稿盘面 → 简要盘面 → 深度面板（逐柱证据 + 提示词 + AI）
   盘面事实一切以 /api/chart 返回的 resultRaw 为准，前端不重算。 */
(function () {
  'use strict';

  var DS = window.DS;
  var esc = DS.esc;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var state = {
    chart: null,
    question: '',
    category: '综合',
    inputs: null
  };

  /* ---------------- 小工具 ---------------- */

  function panCell(idx, titleHtml, mainHtml, subHtml, key) {
    return '<div class="pan-cell' + (key ? ' is-key' : '') + '" style="--i:' + idx + '">' +
      (titleHtml ? '<span class="pan-cell-title">' + titleHtml + '</span>' : '') +
      (mainHtml ? '<span class="pan-cell-main">' + mainHtml + '</span>' : '') +
      (subHtml ? '<span class="pan-cell-sub">' + subHtml + '</span>' : '') +
      '</div>';
  }

  function pan(title, meta, inner, cols) {
    var cls = cols === 4 || cols === 7 ? ' cols-' + cols : '';
    var style = cols && cols !== 4 && cols !== 7 ? ' style="--pan-cols:' + cols + '"' : '';
    return '<div class="pan">' +
      '<div class="pan-head"><span class="pan-title">' + title + '</span>' +
      (meta ? '<span>' + meta + '</span>' : '') + '</div>' +
      '<div class="pan-grid' + cls + '"' + style + '>' + inner + '</div>' +
      '</div>';
  }

  function fmtGz(gz) {
    if (!gz || gz === '未知') return '<span class="gz">—</span>';
    return '<span class="gz">' + esc(gz) + '</span>';
  }

  function pillarParts(gz) {
    if (!gz || gz === '未知' || gz.length < 2) return { gan: '—', zhi: '—', unknown: true };
    return { gan: gz.slice(0, 1), zhi: gz.slice(1, 2), unknown: false };
  }

  function currentDayun(d) {
    var year = d.liunian && d.liunian.year ? d.liunian.year : new Date().getFullYear();
    var list = d.dayun || [];
    for (var i = 0; i < list.length; i++) {
      if (year >= list[i].startYear && year <= list[i].endYear) return { item: list[i], index: i };
    }
    return { item: null, index: -1 };
  }

  /* ---------------- 简要盘面 ---------------- */

  function briefHTML(chart) {
    var d = chart.resultRaw || {};
    var out = '<div class="chart-brief">';

    // 四柱：4 列 × 3 行（柱名 / 天干 / 地支）
    var pillars = [
      { name: '年柱', gz: d.yearGZ },
      { name: '月柱', gz: d.monthGZ },
      { name: '日柱', gz: d.dayGZ },
      { name: '时柱', gz: d.hourGZ }
    ];
    var cells = '';
    var idx = 0;
    pillars.forEach(function (p) {
      cells += panCell(idx++, p.name, '', '', false);
    });
    pillars.forEach(function (p) {
      var part = pillarParts(p.gz);
      cells += panCell(idx++, '', part.unknown ? '<span class="gz">—</span>' : '<span class="gz">' + esc(part.gan) + '</span>', '', false);
    });
    pillars.forEach(function (p) {
      var part = pillarParts(p.gz);
      cells += panCell(idx++, '', part.unknown ? '<span class="badge">不排</span>' : '<span class="gz">' + esc(part.zhi) + '</span>', '', false);
    });

    var birth = '公历 ' + (state.inputs ? state.inputs.y + '-' + state.inputs.m + '-' + state.inputs.d : '') +
      (state.inputs && state.inputs.gender ? ' · ' + state.inputs.gender : '');
    out += pan('四柱', birth, cells, 4);

    // 日主 · 旺衰 · 用神
    var ys = d.yongshen || {};
    var sd = d.strengthDetail || {};
    var metaCells =
      panCell(0, '日主', '<span class="gz">' + esc(d.dayGan || '—') + '</span> <span class="wx">' + esc(d.dayGanWx || '') + '</span>', esc(d.dayGanWx ? d.dayGanWx + '日主' : ''), false) +
      panCell(1, '旺衰', esc(d.strength || '—'), '旺衰分 ' + (sd.score == null ? '—' : sd.score) + ' · 生扶 ' + (d.support == null ? '—' : d.support) + ' · 克泄 ' + (d.drain == null ? '—' : d.drain), false) +
      panCell(2, '用神', '<span class="wx">' + esc(ys.wx || '—') + '</span> <span class="badge is-key">' + esc(ys.shishen || '') + '</span>', '喜 ' + esc((ys.xi || []).join('、') || '—'), false);
    out += pan('日主 · 旺衰 · 用神', '', metaCells, 3);

    // 五行分布（藏干加权）
    var wx = d.wxWeighted || d.wxCount || {};
    var wxC = '';
    var wi = 0;
    ['木', '火', '土', '金', '水'].forEach(function (k) {
      var n = wx[k];
      wxC += panCell(wi++, esc(k), '<span class="wx">' + esc(k) + '</span> ' + (n == null ? '—' : n), '含藏干权重', false);
    });
    out += '<div class="pan"><div class="pan-head"><span class="pan-title">五行分布</span><span>藏干加权</span></div>' +
      '<div class="pan-grid" style="--pan-cols:5">' + wxC + '</div></div>';

    // 当前大运 · 流年
    var cur = currentDayun(d);
    var dyn = cur.item;
    var dyCells =
      panCell(0, '当前大运',
        dyn ? '<span class="gz">' + esc(dyn.gz) + '</span>' : '<span class="gz">—</span>',
        dyn ? esc(dyn.startAge + ' 岁起 · ' + dyn.startYear + '–' + dyn.endYear + ' · ' + (dyn.ganShishen || '') + '/' + (dyn.zhiShishen || '')) : '未入大运',
        true) +
      panCell(1, '流年',
        d.liunian ? '<span class="gz">' + esc(d.liunian.gz) + '</span>' : '<span class="gz">—</span>',
        d.liunian ? esc(d.liunian.year + ' · ' + (d.liunian.ganShishen || '') + ' / ' + (d.liunian.zhiShishen || '')) : '',
        false);
    out += pan('当前大运 · 流年', '', dyCells, 2);

    out += '</div>';
    return out;
  }

  /* ---------------- 深度内容 ---------------- */

  function deepHTML(chart, promptText) {
    var d = chart.resultRaw || {};
    var html = '';

    // 逐柱十神 · 藏干
    var pillars = [
      { name: '年柱', gz: d.yearGZ },
      { name: '月柱', gz: d.monthGZ },
      { name: '日柱', gz: d.dayGZ },
      { name: '时柱', gz: d.hourGZ }
    ];
    var ss = d.shishen || [];
    var cg = d.canggan || [];
    var cells = '';
    var i = 0;
    pillars.forEach(function (p, pi) {
      var part = pillarParts(p.gz);
      var s = ss[pi] ? ss[pi].name : '';
      var c = cg[pi];
      var cang = '';
      if (c && c.gans && c.gans.length) {
        cang = c.gans.map(function (g) {
          return esc(g.gan) + '(' + esc(g.qi || '') + ') ' + esc(g.shishen || '');
        }).join(' · ');
      } else if (part.unknown) {
        cang = '时辰未知 · 不排';
      }
      cells += panCell(i++, esc(p.name) + ' · ' + (part.unknown ? '—' : esc(part.gan)),
        part.unknown ? '<span class="badge">不排时柱</span>' : '<span class="badge is-key">' + esc(s) + '</span>',
        cang, false);
    });

    html += '<div class="deep-sec"><h4>逐柱十神 · 藏干</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">四柱细目</span><span>' +
      esc((d.nayin || '') + ' · 胎元 ' + (d.taiyuan || '—')) + '</span></div>' +
      '<div class="pan-grid cols-4">' + cells + '</div></div></div>';

    // 旺衰拆解
    var sd = d.strengthDetail || {};
    html += '<div class="deep-sec"><h4>旺衰拆解</h4>' +
      '<p class="hint">旺衰分 ' + (sd.score == null ? '—' : sd.score) + ' · 月令 ' + (sd.ling == null ? '—' : sd.ling) +
      ' · 通根 ' + (sd.gen == null ? '—' : sd.gen) + ' · 得势 ' + (sd.shi == null ? '—' : sd.shi) + '</p>' +
      '<p>' + (sd.reasons && sd.reasons.length ? esc(sd.reasons.join('；')) : '无拆解明细') + '</p></div>';

    // 用神喜忌
    var ys = d.yongshen || {};
    var ysCells =
      panCell(0, '用神', '<span class="wx">' + esc(ys.wx || '—') + '</span> ' + esc(ys.shishen || ''), '', true) +
      panCell(1, '喜', esc((ys.xi || []).join('、') || '—'), '生扶日主', false) +
      panCell(2, '忌', esc((ys.ji || []).join('、') || '—'), '克泄日主', false) +
      panCell(3, '调候', esc(ys.tiaohou || '—'), '', false);
    html += '<div class="deep-sec"><h4>用神喜忌</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">取用</span></div>' +
      '<div class="pan-grid cols-4">' + ysCells + '</div></div>' +
      '<p>' + esc(ys.reason || '') + '</p></div>';

    // 格局 · 神煞
    var gj = d.geju || {};
    var shensha = d.shensha || [];
    html += '<div class="deep-sec"><h4>格局 · 神煞</h4>' +
      '<p><span class="badge is-key">' + esc(gj.name || '—') + '</span> ' + esc(gj.basis || '') + '</p>' +
      '<p>' + (shensha.length
        ? shensha.map(function (s) { return '<span class="badge">' + esc(s.name) + ' · ' + esc(s.zhi || '') + ' · ' + esc(s.type || '') + '</span>'; }).join(' ')
        : '无') + '</p></div>';

    // 胎元 · 命宫 · 身宫
    var gongCells =
      panCell(0, '胎元', '<span class="gz">' + esc(d.taiyuan || '—') + '</span>', '', false) +
      panCell(1, '命宫', '<span class="gz">' + esc(d.minggong || '—') + '</span>', '', false) +
      panCell(2, '身宫', '<span class="gz">' + esc(d.shengong || '—') + '</span>', '', false);
    html += '<div class="deep-sec"><h4>胎元 · 命宫 · 身宫</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">三垣</span></div>' +
      '<div class="pan-grid cols-3">' + gongCells + '</div></div></div>';

    // 大运 8 步（当前高亮）
    var cur = currentDayun(d);
    var dyCells = '';
    (d.dayun || []).forEach(function (x, di) {
      dyCells += panCell(di, esc(x.startAge + ' 岁 · ' + x.startYear + '–' + x.endYear),
        '<span class="gz">' + esc(x.gz) + '</span>',
        esc((x.ganShishen || '') + ' / ' + (x.zhiShishen || '')),
        di === cur.index);
    });
    var qy = d.qiYun || {};
    html += '<div class="deep-sec"><h4>大运（' + (d.dayun || []).length + ' 步）</h4>' +
      '<p class="hint">' + esc(qy.detail || '') + '</p>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">大运</span><span>当前大运高亮</span></div>' +
      '<div class="pan-grid cols-4">' + dyCells + '</div></div></div>';

    // 提示词 + AI
    html += '<div class="deep-sec"><h4>AI 解读提示词</h4>' +
      '<div class="prompt-block">' +
      '<textarea class="prompt-box" readonly rows="9">' + esc(promptText || '（提示词生成失败）') + '</textarea>' +
      '<div class="prompt-actions">' +
      '<button class="btn btn-ai" type="button">AI 深度解读</button>' +
      '<button class="btn btn-copy" type="button">复制 AI 解读提示词</button>' +
      '</div></div>' +
      '<div class="ai-out" hidden></div></div>';

    return html;
  }

  /* ---------------- 请求与渲染 ---------------- */

  function aiPayload() {
    return {
      artId: 'bazi',
      id: state.chart ? state.chart.id : undefined,
      question: state.question || undefined,
      category: state.category,
      resultRaw: state.chart ? state.chart.resultRaw : undefined
    };
  }

  async function loadDeep(body) {
    if (!state.chart) throw new Error('没有可展示的盘面');
    var res = await DS.post('/api/prompt', aiPayload());
    body.innerHTML = deepHTML(state.chart, res.prompt);
    DS.wireAi(body, aiPayload());
  }

  function renderResult(chart) {
    var result = $('#result');
    result.innerHTML =
      '<hr class="rule">' +
      '<h2 class="step">STEP 03 · 简要盘面</h2>' +
      '<div class="result-meta">记录 <span class="mono">' + esc(chart.id) + '</span> · 子平八字</div>' +
      briefHTML(chart) +
      '<details class="deep-panel" data-result="1">' +
      '<summary class="deep-sum"><span class="sum-txt">⌄ 深度解读（逐柱证据 · 提示词 · AI）</span></summary>' +
      '<div class="deep-body"></div>' +
      '</details>';
    result.hidden = false;

    var details = $('#result .deep-panel');
    DS.wireDeepPanel(details, loadDeep);
    DS.wireAi(details, aiPayload());

    if (result.scrollIntoView) {
      result.scrollIntoView({ behavior: DS.scrollBehavior(), block: 'start' });
    }
  }

  async function cast() {
    var btn = $('#castBtn');
    var inputs;
    try {
      inputs = DS.readBirthForm($('#birthForm'));
    } catch (e) {
      DS.showToast(e.message || '请检查出生信息');
      return;
    }
    state.inputs = inputs;
    state.question = ($('#question').value || '').trim();
    state.category = $('#category').value;

    btn.disabled = true;
    btn.textContent = '排盘…';
    try {
      var chart = await DS.post('/api/chart', {
        artId: 'bazi',
        question: state.question || undefined,
        category: state.category,
        inputs: inputs
      });
      state.chart = chart;
      renderResult(chart);
    } catch (e) {
      DS.showToast((e && e.message) || '起盘失败');
    } finally {
      btn.disabled = false;
      btn.textContent = '起 盘';
    }
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    DS.birthForm($('#birthForm'), { hourUnknown: true, place: true });
    $('#castBtn').addEventListener('click', cast);

    var cat = $('#category');
    if (cat) {
      cat.addEventListener('change', function () {
        var deep = $('#result .deep-panel');
        if (!deep || !deep.getAttribute('data-loaded')) return;
        if (deep.open) {
          DS.refreshDeep(deep);
        } else {
          deep.removeAttribute('data-loaded');
          var body = deep.querySelector('.deep-body');
          if (body) body.innerHTML = '';
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
