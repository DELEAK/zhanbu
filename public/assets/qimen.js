/* 奇门遁甲页：值符值使行 + 洛书九宫（4 9 2 / 3 5 7 / 8 1 6）简要盘面；
   深度给每宫细目（奇仪/门/星/神/暗干）、局式与断语。盘面事实全部来自 /api/chart。 */
(function () {
  'use strict';

  var DS = window.DS;
  var esc = DS.esc;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var state = { chart: null, question: '', category: '综合' };

  // 洛书九宫在 3×3 网格中的行优先顺序
  var BOARD = [4, 9, 2, 3, 5, 7, 8, 1, 6];

  function juText(d) {
    return (d.yin ? '阴遁' : '阳遁') + d.ju + '局（' + (d.jqName || '') + '）';
  }

  function briefHTML(chart) {
    var d = chart.resultRaw || {};
    var zf = d.pan && d.pan[String(d.zfPalace)] ? d.pan[String(d.zfPalace)] : {};
    var zs = d.pan && d.pan[String(d.zsPalace)] ? d.pan[String(d.zsPalace)] : {};

    var cells = '';
    BOARD.forEach(function (g, i) {
      var p = (d.pan || {})[String(g)] || {};
      var shen = (d.shen || {})[String(g)] || '';
      var an = (d.tianYi || {})[String(g)] || '';
      var isKey = g === d.zfPalace || g === d.zsPalace;
      var shenTxt = shen || (g === 5 ? '中宫' : '—');
      var main = '<span class="gz">' + esc(p.yi || '—') + '</span>' +
        (p.men ? ' <span class="badge is-key">' + esc(p.men) + '门</span>' : ' <span class="badge">中宫</span>') +
        (p.star ? ' <span class="star">' + esc(p.star) + '</span>' : '');
      cells += '<div class="pan-cell' + (isKey ? ' is-key' : '') + '" style="--i:' + i + '">' +
        '<span class="pan-cell-title">' + g + ' 宫</span>' +
        '<span class="pan-cell-main">' + main + '</span>' +
        '<span class="pan-cell-sub">' + esc(shenTxt) + ' · 暗干 ' + esc(an || '—') + '</span>' +
        '</div>';
    });

    var meta = juText(d) + ' · 日' + (d.dayGZ || '—') + ' 时' + (d.hourGZ || '—') +
      ' · 旬首' + (d.xunshouName || '—') + '（' + (d.xunShou || '—') + '）';

    return '<div class="chart-brief">' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">值符 · 值使</span>' +
      '<span>' + esc(meta) + '</span></div>' +
      '<div class="pan-grid cols-2">' +
      '<div class="pan-cell is-key"><span class="pan-cell-title">值符</span>' +
      '<span class="pan-cell-main"><span class="star">' + esc(d.zfStar || '—') + '</span></span>' +
      '<span class="pan-cell-sub">落 ' + esc(String(d.zfPalace || '—')) + ' 宫 · 奇仪 ' + esc(zf.yi || '—') + '</span></div>' +
      '<div class="pan-cell is-key"><span class="pan-cell-title">值使</span>' +
      '<span class="pan-cell-main"><span class="badge is-key">' + esc(d.zsMen || '—') + '门</span></span>' +
      '<span class="pan-cell-sub">落 ' + esc(String(d.zsPalace || '—')) + ' 宫 · 奇仪 ' + esc(zs.yi || '—') + '</span></div>' +
      '</div></div>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">九宫盘</span>' +
      '<span>洛书方位：4 9 2 / 3 5 7 / 8 1 6</span></div>' +
      '<div class="pan-grid" style="--pan-cols:3">' + cells + '</div></div>' +
      '</div>';
  }

  function deepHTML(chart, promptText) {
    var d = chart.resultRaw || {};
    var html = '';

    // 局式
    var juCells =
      '<div class="pan-cell"><span class="pan-cell-title">阴阳遁 · 局数</span>' +
      '<span class="pan-cell-main">' + esc(juText(d)) + '</span><span class="pan-cell-sub">节气 ' + esc(d.jqName || '—') + '</span></div>' +
      '<div class="pan-cell"><span class="pan-cell-title">日柱 · 时柱</span>' +
      '<span class="pan-cell-main">' + esc((d.dayGZ || '—') + ' / ' + (d.hourGZ || '—')) + '</span><span class="pan-cell-sub">日辛卯 时丁酉</span></div>' +
      '<div class="pan-cell"><span class="pan-cell-title">旬首</span>' +
      '<span class="pan-cell-main">' + esc((d.xunshouName || '—')) + '</span><span class="pan-cell-sub">遁仪 ' + esc(d.xunShou || '—') + '</span></div>' +
      '<div class="pan-cell"><span class="pan-cell-title">值符值使</span>' +
      '<span class="pan-cell-main">' + esc((d.zfStar || '—') + ' · ' + (d.zsMen || '—') + '门') + '</span>' +
      '<span class="pan-cell-sub">' + esc((d.zfPalace || '—') + ' 宫 / ' + (d.zsPalace || '—') + ' 宫') + '</span></div>';
    html += '<div class="deep-sec"><h4>局式</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">起局</span><span>' + esc(juText(d)) + '</span></div>' +
      '<div class="pan-grid cols-4">' + juCells + '</div></div></div>';

    // 每宫细目
    var rows = '';
    BOARD.forEach(function (g) {
      var p = (d.pan || {})[String(g)] || {};
      var shen = (d.shen || {})[String(g)] || '';
      var an = (d.tianYi || {})[String(g)] || '';
      rows += '<div class="pan-cell"><span class="pan-cell-title">' + g + ' 宫</span>' +
        '<span class="pan-cell-main">' + esc(p.yi || '—') + ' · ' + esc(p.men ? p.men + '门' : '中宫') +
        ' · ' + esc(p.star || '—') + '</span>' +
        '<span class="pan-cell-sub">' + esc(shen || (g === 5 ? '中宫' : '—')) + ' · 暗干 ' + esc(an || '—') + '</span></div>';
    });
    html += '<div class="deep-sec"><h4>九宫细目</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">奇仪 · 门 · 星 · 神 · 暗干</span>' +
      '<span>值符宫/值使宫见简要盘</span></div>' +
      '<div class="pan-grid cols-3">' + rows + '</div></div></div>';

    // 断语
    html += '<div class="deep-sec"><h4>断语（古籍引证）</h4>' +
      '<p style="white-space:pre-wrap;line-height:1.9">' + esc(chart.duanyu || '本盘暂无命中规则库的现成断语。') + '</p></div>';

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

  function aiPayload() {
    return {
      artId: 'qimen',
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
      '<div class="result-meta">记录 <span class="mono">' + esc(chart.id) + '</span> · 奇门遁甲</div>' +
      briefHTML(chart) +
      '<details class="deep-panel" data-result="1">' +
      '<summary class="deep-sum"><span class="sum-txt">⌄ 深度解读（九宫细目 · 断语 · 提示词 · AI）</span></summary>' +
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
    var datetime;
    try {
      datetime = DS.readMomentForm($('#momentForm'));
    } catch (e) {
      DS.showToast(e.message || '请检查起局时刻');
      return;
    }
    state.question = ($('#question').value || '').trim();
    state.category = $('#category').value;

    btn.disabled = true;
    btn.textContent = '起局…';
    try {
      var chart = await DS.post(DS.isLucky() ? '/api/chart/lucky' : '/api/chart', {
        artId: 'qimen',
        question: state.question || undefined,
        category: state.category,
        inputs: datetime ? { datetime: datetime } : {}
      });
      state.chart = chart;
      renderResult(chart);
    } catch (e) {
      DS.showToast((e && e.message) || '起局失败');
    } finally {
      btn.disabled = false;
      btn.textContent = '起 局';
    }
  }

  function init() {
    DS.momentForm($('#momentForm'));
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
