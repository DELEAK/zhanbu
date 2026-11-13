/* 梅花易数页：本卦/互卦/变卦三卦并排（六爻线条 + 动爻标记）与体用生克；
   深度给卦辞象曰、体用旺衰与断语。盘面事实全部来自 /api/chart。 */
(function () {
  'use strict';

  var DS = window.DS;
  var esc = DS.esc;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var state = { chart: null, question: '', category: '综合' };

  // 八卦数 → 三爻（自下而上，1 阳 0 阴）
  var BITS = {
    1: [1, 1, 1], 2: [1, 1, 0], 3: [1, 0, 1], 4: [1, 0, 0],
    5: [0, 1, 1], 6: [0, 1, 0], 7: [0, 0, 1], 8: [0, 0, 0]
  };
  var GUA_NAMES = { 1: '乾', 2: '兑', 3: '离', 4: '震', 5: '巽', 6: '坎', 7: '艮', 8: '坤' };

  function guaBits(g) {
    var lower = BITS[g.down] || [1, 1, 1];
    var upper = BITS[g.up] || [1, 1, 1];
    return lower.concat(upper);
  }

  function guaHTML(d, name, gua, move) {
    var bits = guaBits(gua);
    return '<span class="pan-cell-title">' + name + '</span>' +
      '<span class="pan-cell-main"><span class="gz">' + esc(gua.name || '—') + '</span></span>' +
      '<span class="pan-cell-sub">' + esc((GUA_NAMES[gua.down] || '') + '下' + (GUA_NAMES[gua.up] || '') + '上') + '</span>' +
      DS.hexagramHTML({ lines: bits, move: move, title: '' });
  }

  function briefHTML(chart) {
    var d = chart.resultRaw || {};
    var move = d.move;
    var cells =
      '<div class="pan-cell' + '">' + guaHTML(d, '本卦', d.benGua || {}, move) + '</div>' +
      '<div class="pan-cell">' + guaHTML(d, '互卦', d.huGua || {}, 0) + '</div>' +
      '<div class="pan-cell">' + guaHTML(d, '变卦', d.bianGua || {}, 0) + '</div>';

    var ti = GUA_NAMES[d.tiGua] || '—';
    var yong = GUA_NAMES[d.yongGua] || '—';
    var bodyCells =
      '<div class="pan-cell"><span class="pan-cell-title">体卦</span>' +
      '<span class="pan-cell-main"><span class="gz">' + esc(ti) + '</span> <span class="wx">' + esc(d.tiWx || '—') + '</span></span>' +
      '<span class="pan-cell-sub">' + (d.tiWangShuai ? esc('时令 ' + d.tiWangShuai) : '不动之卦') + '</span></div>' +
      '<div class="pan-cell"><span class="pan-cell-title">用卦</span>' +
      '<span class="pan-cell-main"><span class="gz">' + esc(yong) + '</span> <span class="wx">' + esc(d.yongWx || '—') + '</span></span>' +
      '<span class="pan-cell-sub">' + (d.yongWangShuai ? esc('时令 ' + d.yongWangShuai) : '动爻所在之卦') + '</span></div>' +
      '<div class="pan-cell is-key"><span class="pan-cell-title">生克</span>' +
      '<span class="pan-cell-main">' + esc(d.shengke || '—') + '</span>' +
      '<span class="pan-cell-sub">' + (d.wangShuaiNote ? esc(d.wangShuaiNote) : '体用相较') + '</span></div>';

    var meta = '动爻 第 ' + esc(String(move || '—')) + ' 爻 · ' + esc((d.benGua || {}).name || '—') +
      ' → ' + esc((d.bianGua || {}).name || '—');

    return '<div class="chart-brief">' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">本卦 · 互卦 · 变卦</span>' +
      '<span>' + esc(meta) + '</span></div>' +
      '<div class="pan-grid cols-3">' + cells + '</div></div>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">体用</span>' +
      '<span>' + (d.monthWx ? esc('月令 ' + d.monthWx) : '') + '</span></div>' +
      '<div class="pan-grid cols-3">' + bodyCells + '</div></div>' +
      '</div>';
  }

  function guaSec(name, gua) {
    if (!gua) return '';
    return '<div class="deep-sec"><h4>' + name + ' · ' + esc(gua.name || '') + '</h4>' +
      '<p><span class="badge">卦辞</span> ' + esc(gua.ci || '（无）') + '</p>' +
      '<p><span class="badge">象曰</span> ' + esc(gua.xiang || '（无）') + '</p></div>';
  }

  function deepHTML(chart, promptText) {
    var d = chart.resultRaw || {};
    var html = '';

    html += '<div class="deep-sec"><h4>三卦六爻</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">本卦（动爻标记）</span>' +
      '<span>动爻 第 ' + esc(String(d.move || '—')) + ' 爻</span></div>' +
      '<div class="pan-grid cols-3">' +
      '<div class="pan-cell">' + guaHTML(d, '本卦', d.benGua || {}, d.move) + '</div>' +
      '<div class="pan-cell">' + guaHTML(d, '互卦', d.huGua || {}, 0) + '</div>' +
      '<div class="pan-cell">' + guaHTML(d, '变卦', d.bianGua || {}, 0) + '</div>' +
      '</div></div></div>';

    html += guaSec('本卦', d.benGua) + guaSec('互卦', d.huGua) + guaSec('变卦', d.bianGua);

    html += '<div class="deep-sec"><h4>体用旺衰</h4>' +
      '<p><span class="badge">体卦</span> ' + esc((GUA_NAMES[d.tiGua] || '—') + '（' + (d.tiWx || '—') + '）') +
      (d.tiWangShuai ? ' · 时令 ' + esc(d.tiWangShuai) : '') + '</p>' +
      '<p><span class="badge">用卦</span> ' + esc((GUA_NAMES[d.yongGua] || '—') + '（' + (d.yongWx || '—') + '）') +
      (d.yongWangShuai ? ' · 时令 ' + esc(d.yongWangShuai) : '') + '</p>' +
      '<p><span class="badge is-key">生克</span> ' + esc(d.shengke || '—') + '</p>' +
      (d.wangShuaiNote ? '<p class="hint">' + esc(d.wangShuaiNote) + '</p>' : '') +
      '</div>';

    html += '<div class="deep-sec"><h4>断语（古籍引证）</h4>' +
      '<p style="white-space:pre-wrap;line-height:1.9">' + esc(chart.duanyu || '本卦暂无命中规则库的现成断语。') + '</p></div>';

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

  function aiPayload() {
    return {
      artId: 'meihua',
      id: state.chart ? state.chart.id : undefined,
      question: state.question || undefined,
      category: state.category,
      resultRaw: state.chart ? state.chart.resultRaw : undefined
    };
  }

  async function loadDeep(body) {
    if (!state.chart) throw new Error('没有可展示的卦象');
    var res = await DS.post('/api/prompt', aiPayload());
    body.innerHTML = deepHTML(state.chart, res.prompt);
    DS.wireAi(body, aiPayload());
  }

  function renderResult(chart) {
    var result = $('#result');
    result.innerHTML =
      '<hr class="rule">' +
      '<h2 class="step">STEP 03 · 简要盘面</h2>' +
      '<div class="result-meta">记录 <span class="mono">' + esc(chart.id) + '</span> · 梅花易数</div>' +
      briefHTML(chart) +
      '<details class="deep-panel" data-result="1">' +
      '<summary class="deep-sum"><span class="sum-txt">⌄ 深度解读（卦辞象曰 · 体用 · 断语 · 提示词 · AI）</span></summary>' +
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
    var mode = $('#mode').value;
    var inputs = { mode: mode };

    if (mode === 'number') {
      var nums = ['n1', 'n2', 'n3'].map(function (id) {
        var v = Number($('#' + id).value);
        if (!Number.isFinite(v) || v < 1 || v > 999 || !Number.isInteger(v)) return NaN;
        return v;
      });
      if (nums.some(function (v) { return Number.isNaN(v); })) {
        DS.showToast('三个数都必须是 1–999 的整数');
        return;
      }
      inputs.n1 = nums[0]; inputs.n2 = nums[1]; inputs.n3 = nums[2];
    } else {
      var now;
      try {
        now = DS.readMomentForm($('#timeFields'));
      } catch (e) {
        DS.showToast(e.message || '请检查起卦时刻');
        return;
      }
      if (now) inputs.now = now;
    }

    state.question = ($('#question').value || '').trim();
    state.category = $('#category').value;

    btn.disabled = true;
    btn.textContent = '起卦…';
    try {
      var chart = await DS.post('/api/chart', {
        artId: 'meihua',
        question: state.question || undefined,
        category: state.category,
        inputs: inputs
      });
      state.chart = chart;
      renderResult(chart);
    } catch (e) {
      DS.showToast((e && e.message) || '起卦失败');
    } finally {
      btn.disabled = false;
      btn.textContent = '起 卦';
    }
  }

  function syncMode() {
    var mode = $('#mode').value;
    $('#timeFields').hidden = mode !== 'time';
    $('#numFields').hidden = mode !== 'number';
  }

  function init() {
    DS.momentForm($('#momentForm'));
    syncMode();
    $('#mode').addEventListener('change', syncMode);
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
