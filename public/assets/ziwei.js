/* 紫微斗数页：4×4 十二宫棋盘（寅起顺行）+ 中心 2×2 合并块；
   盘面事实全部来自 /api/chart 的 resultRaw 与 brief（brief 的逐宫行是校验基准）。 */
(function () {
  'use strict';

  var DS = window.DS;
  var esc = DS.esc;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var state = { chart: null, question: '', category: '综合', inputs: null };

  var ZHI = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
  var PALACE_NAMES = ['命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄', '迁移', '交友', '官禄', '田宅', '福德', '父母'];
  var GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  // 地支位（0=寅 起顺行）→ 4×4 棋盘坐标 [row, col]（0 基）
  var BOARD = [
    [3, 0], [2, 0], [1, 0], [0, 0],
    [0, 1], [0, 2], [0, 3], [1, 3],
    [2, 3], [3, 3], [3, 2], [3, 1]
  ];
  // 五虎遁：年干 → 寅宫干（甲己丙、乙庚戊、丙辛庚、丁壬壬、戊癸甲）
  var YIN_GAN = { 甲: 2, 己: 2, 乙: 4, 庚: 4, 丙: 6, 辛: 6, 丁: 8, 壬: 8, 戊: 0, 癸: 0 };
  var SIHUA_NAME = { lu: '禄', quan: '权', ke: '科', ji: '忌' };

  function palaceIndex(branch, d) {
    for (var i = 0; i < 12; i++) {
      if (Number(d.palaces[i]) === branch) return i;
    }
    return -1;
  }

  function palaceName(branch, d) {
    var i = palaceIndex(branch, d);
    return i >= 0 ? PALACE_NAMES[i] : '—';
  }

  function palaceGz(branch, yearGan) {
    var start = YIN_GAN[yearGan];
    if (start == null) return ZHI[branch];
    return GAN[(start + branch) % 10] + ZHI[branch];
  }

  function starsAt(branch, map) {
    var out = [];
    if (!map) return out;
    Object.keys(map).forEach(function (k) {
      if (Number(map[k]) === branch) out.push(k);
    });
    return out;
  }

  function sihuaFor(star, d) {
    var s = d.sihua || {};
    var keys = Object.keys(s);
    for (var i = 0; i < keys.length; i++) {
      if (s[keys[i]] === star) return SIHUA_NAME[keys[i]];
    }
    return '';
  }

  function brightnessOf(star, d) {
    var m = d.effBrightness || d.brightness || {};
    return m[star] || '';
  }

  // dayun[].palaceIdx 是「地支位」（0=寅），不是宫序
  function dayunRange(branch, d) {
    var list = d.dayun || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].palaceIdx === branch) return list[i].start + '–' + list[i].end + ' 岁';
    }
    return '';
  }

  function briefLines(brief, head) {
    var lines = (brief || '').split('\n');
    var out = [];
    var on = false;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (l.indexOf(head) === 0) { on = true; continue; }
      if (on) {
        if (l.charAt(0) === '【') break;
        if (l.trim()) out.push(l);
      }
    }
    return out;
  }

  /* ---------------- 简要盘面 ---------------- */

  function starHTML(star, d) {
    var b = brightnessOf(star, d);
    var h = sihuaFor(star, d);
    return '<span class="star">' + esc(star) + '</span>' +
      (b ? '<span class="badge">' + esc(b) + '</span>' : '') +
      (h ? '<span class="badge is-key">' + esc(h) + '</span>' : '');
  }

  function boardCell(branch, idx, d, yearGan) {
    var pIdx = palaceIndex(branch, d);
    var name = pIdx >= 0 ? PALACE_NAMES[pIdx] : '—';
    var main = starsAt(branch, d.zwStars);
    var fu = starsAt(branch, d.fuStars);
    var borrowed = (d.borrowedStars || {})[String(pIdx)] || [];
    var pos = BOARD[branch];

    var mainHTML = main.length
      ? main.map(function (s) { return starHTML(s, d); }).join(' ')
      : '<span class="badge">无主星</span>';
    var subArr = [];
    if (fu.length) subArr.push('辅 ' + fu.join('、'));
    if (borrowed.length) subArr.push('借 ' + borrowed.join('、'));
    var range = dayunRange(branch, d);
    if (range) subArr.push('大限 ' + range);

    return '<div class="pan-cell' + (branch === d.ming ? ' is-key' : '') + '"' +
      ' style="grid-row:' + (pos[0] + 1) + ';grid-column:' + (pos[1] + 1) + ';--i:' + idx + '">' +
      '<span class="pan-cell-title">' + esc(name) + ' · ' + esc(palaceGz(branch, yearGan)) + '</span>' +
      '<span class="pan-cell-main">' + mainHTML + '</span>' +
      '<span class="pan-cell-sub">' + esc(subArr.join(' · ')) + '</span>' +
      '</div>';
  }

  function centerHTML(d) {
    var cur = (d.dayun || [])[d.curDayunIdx] || {};
    var curName = cur.palaceIdx != null ? palaceName(cur.palaceIdx, d) : '—';
    var items = [
      ['五行局', d.juName || '—', ''],
      ['命宫', d.mingGZ || '—', ZHI[d.ming] || ''],
      ['身宫', ZHI[d.shen] || '—', ''],
      ['紫微落宫', ZHI[d.zwPos] || '—', ''],
      ['当前大限', cur.start != null ? cur.start + '–' + cur.end + ' 岁' : '—', curName + '宫'],
      ['昼夜', d.dayNight === 'day' ? '昼生' : '夜生', '']
    ];
    var inner = items.map(function (it, i) {
      return '<div class="pan-cell" style="min-height:0;padding:9px;--i:' + (12 + i) + '">' +
        '<span class="pan-cell-title">' + esc(it[0]) + '</span>' +
        '<span class="pan-cell-main" style="font-size:14px">' + esc(it[1]) + '</span>' +
        (it[2] ? '<span class="pan-cell-sub">' + esc(it[2]) + '</span>' : '') +
        '</div>';
    }).join('');

    return '<div class="pan-cell" style="grid-row:2 / span 2;grid-column:2 / span 2;padding:8px;background:var(--bg-3)">' +
      '<div class="pan-grid" style="--pan-cols:3;border:0">' + inner + '</div>' +
      '</div>';
  }

  function yearGanOf(chart) {
    var gz = chart && chart.params && chart.params.inputs && chart.params.inputs.ganzhi;
    if (!gz && state.inputs && state.inputs.ganzhi) gz = state.inputs.ganzhi;
    return gz ? String(gz).charAt(0) : '';
  }

  function briefHTML(chart) {
    var d = chart.resultRaw || {};
    var yearGan = yearGanOf(chart);
    var cells = '';
    for (var b = 0; b < 12; b++) cells += boardCell(b, b, d, yearGan);
    cells += centerHTML(d);

    var cur = (d.dayun || [])[d.curDayunIdx] || {};
    var meta = (d.juName || '') + ' · 命宫 ' + (d.mingGZ || '—') + ' · 身宫 ' + (ZHI[d.shen] || '—') +
      ' · 紫微落' + (ZHI[d.zwPos] || '—') + '宫 · ' + (d.dayNight === 'day' ? '昼生' : '夜生');

    var liunian = '流年：' + (d.nominalAge || '—') + ' 虚岁 · 流年命宫落' + (d.liunianPalaceName || '—') +
      '（' + (ZHI[d.liunianIdx] || '—') + '）' + ((d.liunianStars || []).length ? ' · 主星 ' + d.liunianStars.join('、') : '');

    return '<div class="chart-brief">' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">紫微命盘</span>' +
      '<span>' + esc(meta) + '</span></div>' +
      '<div class="pan-grid" style="--pan-cols:4">' + cells + '</div></div>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">大限 · 流年</span>' +
      '<span>当前大限第 ' + ((d.curDayunIdx || 0) + 1) + ' 步</span></div>' +
      '<div class="pan-grid cols-2">' +
      '<div class="pan-cell is-key"><span class="pan-cell-title">当前大限</span>' +
      '<span class="pan-cell-main"><span class="gz">' + esc(cur.start != null ? cur.start + '–' + cur.end + ' 岁' : '—') + '</span></span>' +
      '<span class="pan-cell-sub">' + esc((cur.palaceIdx != null ? palaceName(cur.palaceIdx, d) : '—') + '宫 · ' + (cur.palaceIdx != null ? ZHI[cur.palaceIdx] : '')) + '</span></div>' +
      '<div class="pan-cell"><span class="pan-cell-title">流年</span>' +
      '<span class="pan-cell-main"><span class="gz">' + esc(d.nominalAge || '—') + '</span> 虚岁</span>' +
      '<span class="pan-cell-sub">' + esc(liunian) + '</span></div>' +
      '</div></div>' +
      '</div>';
  }

  /* ---------------- 深度内容 ---------------- */

  function deepHTML(chart, promptText) {
    var d = chart.resultRaw || {};
    var html = '';

    // 十二宫事实（逐字引用 brief）
    var rows = briefLines(chart.brief, '【十二宫事实');
    html += '<div class="deep-sec"><h4>十二宫事实（逐字引用）</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">宫位基准</span><span>与简要棋盘同源</span></div>' +
      '<p class="mono" style="line-height:1.9">' + rows.map(esc).join('<br>') + '</p></div></div>';

    // 生年四化落宫
    var sihua = d.sihua || {};
    var sihuaPos = d.sihuaPos || {};
    var shCells = '';
    Object.keys(sihua).forEach(function (k, i) {
      var star = sihua[k];
      var branch = Number(sihuaPos[k]);
      shCells += '<div class="pan-cell" style="--i:' + i + '">' +
        '<span class="pan-cell-title">' + esc(star) + ' 化' + SIHUA_NAME[k] + '</span>' +
        '<span class="pan-cell-main">' + esc(palaceName(branch, d)) + '宫</span>' +
        '<span class="pan-cell-sub">' + esc(ZHI[branch] || '') + ' · ' + esc(brightnessOf(star, d) || '') + '</span></div>';
    });
    html += '<div class="deep-sec"><h4>生年四化落宫</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">四化</span><span>生年干 ' +
      esc(yearGanOf(chart)) + '</span></div>' +
      '<div class="pan-grid cols-4">' + shCells + '</div></div></div>';

    // 辅星全列
    var fuCells = '';
    for (var b = 0; b < 12; b++) {
      var fu = starsAt(b, d.fuStars);
      fuCells += '<div class="pan-cell" style="--i:' + b + '">' +
        '<span class="pan-cell-title">' + esc(palaceName(b, d)) + ' · ' + esc(ZHI[b]) + '</span>' +
        '<span class="pan-cell-sub">' + esc(fu.length ? fu.join('、') : '无辅星') + '</span></div>';
    }
    html += '<div class="deep-sec"><h4>辅星全列</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">辅星</span><span>按宫位排列</span></div>' +
      '<div class="pan-grid cols-4">' + fuCells + '</div></div></div>';

    // 有效亮度
    var eff = d.effBrightness || d.brightness || {};
    var bCells = '';
    Object.keys(eff).forEach(function (s, i) {
      bCells += '<div class="pan-cell" style="--i:' + i + '">' +
        '<span class="pan-cell-title">' + esc(s) + '</span>' +
        '<span class="pan-cell-main"><span class="badge is-key">' + esc(eff[s]) + '</span></span>' +
        '<span class="pan-cell-sub">' + (d.brightness && d.brightness[s] && d.brightness[s] !== eff[s] ? '本气 ' + esc(d.brightness[s]) : '') + '</span></div>';
    });
    html += '<div class="deep-sec"><h4>有效亮度（昼夜调整后）</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">庙旺得平陷</span><span>' +
      esc(d.dayNight === 'day' ? '昼生 · 太阳得时、太阴减力' : '夜生 · 太阴得时、太阳减力') + '</span></div>' +
      '<div class="pan-grid cols-7">' + bCells + '</div></div></div>';

    // 空宫借星
    var borrowed = d.borrowedStars || {};
    var btCells = Object.keys(borrowed).map(function (k, i) {
      var pIdx = Number(k);                     // borrowedStars 的键是宫序
      var branch = Number(d.palaces[pIdx]);     // 宫序 → 地支位
      var opposite = (branch + 6) % 12;
      return '<div class="pan-cell" style="--i:' + i + '">' +
        '<span class="pan-cell-title">' + esc(PALACE_NAMES[pIdx] || '—') + '宫 · ' + esc(ZHI[branch] || '') + '</span>' +
        '<span class="pan-cell-main">空宫</span>' +
        '<span class="pan-cell-sub">借对宫' + esc(ZHI[opposite] || '') + '宫 ' +
        esc(borrowed[k].join('、')) + '</span></div>';
    }).join('');
    html += '<div class="deep-sec"><h4>空宫借星</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">借星</span><span>空宫须借对宫主星论之</span></div>' +
      '<div class="pan-grid cols-4">' + (btCells || '<div class="pan-cell"><span class="pan-cell-sub">无空宫</span></div>') + '</div></div></div>';

    // 格局
    var geju = d.geju || [];
    var gjCells = geju.map(function (g, i) {
      return '<div class="pan-cell" style="--i:' + i + '">' +
        '<span class="pan-cell-title">' + esc(g.ji || '') + '格</span>' +
        '<span class="pan-cell-main">' + esc(g.name) + '</span>' +
        '<span class="pan-cell-sub">' + esc(g.why || '') + '<br>' + esc(g.desc || '') + '</span></div>';
    }).join('');
    html += '<div class="deep-sec"><h4>格局</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">格局</span><span>' + geju.length + ' 项</span></div>' +
      '<div class="pan-grid cols-2">' + (gjCells || '<div class="pan-cell"><span class="pan-cell-sub">无成格</span></div>') + '</div></div></div>';

    // 大限 12 步
    var dyCells = (d.dayun || []).map(function (x, i) {
      return '<div class="pan-cell' + (i === d.curDayunIdx ? ' is-key' : '') + '" style="--i:' + i + '">' +
        '<span class="pan-cell-title">' + esc(x.start + '–' + x.end + ' 岁') + '</span>' +
        '<span class="pan-cell-main">' + esc(palaceName(x.palaceIdx, d)) + '宫</span>' +
        '<span class="pan-cell-sub">' + esc(ZHI[x.palaceIdx] || '') + (i === d.curDayunIdx ? ' · 当前' : '') + '</span></div>';
    }).join('');
    html += '<div class="deep-sec"><h4>大限（' + (d.dayun || []).length + ' 步）</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">大限</span><span>当前大限高亮</span></div>' +
      '<div class="pan-grid cols-4">' + dyCells + '</div></div>' +
      '<p class="hint">流年：' + esc((d.nominalAge || '—') + ' 虚岁 · 流年命宫落' + (d.liunianPalaceName || '—') +
      '（' + (ZHI[d.liunianIdx] || '—') + '）· 主星 ' + ((d.liunianStars || []).join('、') || '—')) + '</p></div>';

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
      artId: 'ziwei',
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
      '<div class="result-meta">记录 <span class="mono">' + esc(chart.id) + '</span> · 紫微斗数</div>' +
      briefHTML(chart) +
      '<details class="deep-panel" data-result="1">' +
      '<summary class="deep-sum"><span class="sum-txt">⌄ 深度解读（逐宫证据 · 提示词 · AI）</span></summary>' +
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
        artId: 'ziwei',
        question: state.question || undefined,
        category: state.category,
        inputs: inputs
      });
      state.chart = chart;
      renderResult(chart);
    } catch (e) {
      DS.showToast((e && e.message) || '排盘失败');
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
