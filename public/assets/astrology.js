/* 西方星盘页：日月升三主 + 七行星落座落宫表；深度给十二宫、相位与庙旺说明。
   盘面事实全部来自 /api/chart 的 brief 与 resultRaw。 */
(function () {
  'use strict';

  var DS = window.DS;
  var esc = DS.esc;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var state = { chart: null, question: '', category: '综合' };

  var SIGNS = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];

  function signOfLng(lng) {
    var s = Math.floor((((lng % 360) + 360) % 360) / 30);
    return SIGNS[s];
  }

  function degText(deg) {
    return (Math.round(Number(deg || 0) * 10) / 10).toFixed(1) + '°';
  }

  function planetCell(p, i, key) {
    return '<div class="pan-cell' + (key ? ' is-key' : '') + '" style="--i:' + i + '">' +
      '<span class="pan-cell-title">' + esc(p.sym || '') + ' ' + esc(p.cn || '') + '</span>' +
      '<span class="pan-cell-main"><span class="star">' + esc(p.sign || '—') + '</span> ' +
      esc(degText(p.degree)) + '</span>' +
      '<span class="pan-cell-sub">' + esc(String(p.house || '—')) + ' 宫' +
      (p.dignity && p.dignity.status ? ' · <span class="badge is-key">' + esc(p.dignity.status) + '</span>' : '') +
      (p.retrograde ? ' · <span class="badge">逆</span>' : '') +
      '</span></div>';
  }

  function briefHTML(chart) {
    var d = chart.resultRaw || {};
    var pd = d.planetDetails || [];
    var sun = pd.filter(function (p) { return p.cn === '太阳'; })[0] || {};
    var moon = pd.filter(function (p) { return p.cn === '月亮'; })[0] || {};

    var trio =
      '<div class="pan-cell"><span class="pan-cell-title">太阳 ☉</span>' +
      '<span class="pan-cell-main"><span class="gz">' + esc(d.sunSign || sun.sign || '—') + '</span> ' +
      esc(degText(sun.degree)) + '</span>' +
      '<span class="pan-cell-sub">' + esc(String(sun.house || '—')) + ' 宫' +
      (sun.dignity && sun.dignity.status ? ' · ' + esc(sun.dignity.status) : '') + '</span></div>' +
      '<div class="pan-cell"><span class="pan-cell-title">月亮 ☽</span>' +
      '<span class="pan-cell-main"><span class="gz">' + esc(d.moonSign || moon.sign || '—') + '</span> ' +
      esc(degText(moon.degree)) + '</span>' +
      '<span class="pan-cell-sub">' + esc(String(moon.house || '—')) + ' 宫' +
      (moon.dignity && moon.dignity.status ? ' · ' + esc(moon.dignity.status) : '') + '</span></div>' +
      '<div class="pan-cell is-key"><span class="pan-cell-title">上升 ↗</span>' +
      '<span class="pan-cell-main"><span class="gz">' + esc(d.ascSign || '—') + '</span> ' +
      esc(degText((Number(d.asc || 0)) % 30)) + '</span>' +
      '<span class="pan-cell-sub">中天 ' + esc(signOfLng(d.mc)) + ' · ' + esc(d.houseSystem || '') + '</span></div>';

    var planets = pd.map(function (p, i) { return planetCell(p, i, false); }).join('');

    return '<div class="chart-brief">' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">日月升</span>' +
      '<span>宫位制 ' + esc(d.houseSystem || 'whole-sign') + '</span></div>' +
      '<div class="pan-grid cols-3">' + trio + '</div></div>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">七行星落座落宫</span>' +
      '<span>庙旺得平陷见徽章</span></div>' +
      '<div class="pan-grid cols-7">' + planets + '</div></div>' +
      '</div>';
  }

  function deepHTML(chart, promptText) {
    var d = chart.resultRaw || {};
    var html = '';

    var houses = (d.houses || []).map(function (h) {
      return '<div class="pan-cell"><span class="pan-cell-title">' + esc(String(h.num)) + ' 宫</span>' +
        '<span class="pan-cell-main"><span class="star">' + esc(h.sign || '—') + '</span></span>' +
        '<span class="pan-cell-sub">宫头 ' + esc(degText(h.cusp % 30)) + ' · 主星 ' + esc(h.ruler || '—') + '</span></div>';
    }).join('');
    html += '<div class="deep-sec"><h4>十二宫</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">宫位 · 星座 · 宫主星</span>' +
      '<span>' + esc(d.houseSystem || '') + '</span></div>' +
      '<div class="pan-grid cols-4">' + houses + '</div></div></div>';

    var rows = (d.aspects || []).map(function (a) {
      return '<p><span class="badge is-key">' + esc(a[2] || '') + '</span> ' +
        esc(a[0] || '') + ' · ' + esc(a[1] || '') + ' — ' + esc(a[3] || '') + '</p>';
    }).join('');
    html += '<div class="deep-sec"><h4>相位</h4>' + (rows || '<p class="hint">本盘无相位记录。</p>') + '</div>';

    var notes = (d.planetDetails || []).filter(function (p) {
      return p.retrograde || (p.dignity && p.dignity.note);
    }).map(function (p) {
      return '<p><span class="badge">' + esc(p.cn || '') + '</span> ' +
        (p.dignity && p.dignity.note ? esc(p.dignity.note) : '') +
        (p.retrograde ? ' · 逆行' : '') + '</p>';
    }).join('');
    html += '<div class="deep-sec"><h4>庙旺与逆行</h4>' + (notes || '<p class="hint">七行星均无庙旺或逆行标注。</p>') + '</div>';

    html += '<div class="deep-sec"><h4>命盘事实（逐字引用）</h4>' +
      '<p class="mono" style="white-space:pre-wrap;line-height:1.8">' + esc(chart.brief || '') + '</p></div>';

    html += '<div class="deep-sec"><h4>断语（古籍引证）</h4>' +
      '<p style="white-space:pre-wrap;line-height:1.9">' + esc(chart.duanyu || '本盘暂无命中规则库的现成断语。') + '</p></div>';

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
      artId: 'astrology',
      id: state.chart ? state.chart.id : undefined,
      question: state.question || undefined,
      category: state.category,
      resultRaw: state.chart ? state.chart.resultRaw : undefined
    };
  }

  async function loadDeep(body) {
    if (!state.chart) throw new Error('没有可展示的星盘');
    var res = await DS.post('/api/prompt', aiPayload());
    body.innerHTML = deepHTML(state.chart, res.prompt);
    DS.wireAi(body, aiPayload());
  }

  function renderResult(chart) {
    var result = $('#result');
    result.innerHTML =
      '<hr class="rule">' +
      '<h2 class="step">STEP 03 · 简要盘面</h2>' +
      '<div class="result-meta">记录 <span class="mono">' + esc(chart.id) + '</span> · 西方星盘</div>' +
      briefHTML(chart) +
      '<details class="deep-panel" data-result="1">' +
      '<summary class="deep-sum"><span class="sum-txt">⌄ 深度解读（十二宫 · 相位 · 庙旺 · 提示词 · AI）</span></summary>' +
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
    if (inputs.hourIndex !== undefined) {
      DS.showToast('星盘需要具体时刻（0–23 时）');
      return;
    }
    state.question = ($('#question').value || '').trim();
    state.category = $('#category').value;

    btn.disabled = true;
    btn.textContent = '起盘…';
    try {
      var chart = await DS.post('/api/chart', {
        artId: 'astrology',
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

  function init() {
    DS.birthForm($('#birthForm'), { mode: 'clock', hour: 12, min: 0, place: true, lat: true });
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
