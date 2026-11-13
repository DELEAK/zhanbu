/* 大六壬页：四课 + 三传（含天将）简要盘面；深度给天地盘、十二天将布宫、课体与断语。
   盘面事实全部来自 /api/chart 的 resultRaw 与 brief。 */
(function () {
  'use strict';

  var DS = window.DS;
  var esc = DS.esc;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var state = { chart: null, question: '', category: '综合' };

  // tianpan / tianJiang 的键：0=子 … 11=亥
  var ZI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var KE_NAMES = ['干上', '干阴', '支上', '支阴'];
  var CHUAN_NAMES = ['初传', '中传', '末传'];

  function jiangOfZhi(zhi, d) {
    var tp = d.tianpan || {};
    var tj = d.tianJiang || {};
    var keys = Object.keys(tp);
    for (var i = 0; i < keys.length; i++) {
      if (tp[keys[i]] === zhi) return tj[keys[i]] || '';
    }
    return '';
  }

  function briefHTML(chart) {
    var d = chart.resultRaw || {};
    var ke = [d.ke1, d.ke2, d.ke3, d.ke4];
    var chuan = d.chuanJiang || [
      { chuan: d.chuan1, jiang: '' },
      { chuan: d.chuan2, jiang: '' },
      { chuan: d.chuan3, jiang: '' }
    ];

    var keCells = ke.map(function (z, i) {
      return '<div class="pan-cell" style="--i:' + i + '">' +
        '<span class="pan-cell-title">' + KE_NAMES[i] + '</span>' +
        '<span class="pan-cell-main"><span class="gz">' + esc(z || '—') + '</span></span>' +
        '<span class="pan-cell-sub">' + esc(jiangOfZhi(z, d) || '—') + '</span></div>';
    }).join('');

    var chuanCells = chuan.map(function (c, i) {
      return '<div class="pan-cell' + (i === 0 ? ' is-key' : '') + '" style="--i:' + i + '">' +
        '<span class="pan-cell-title">' + CHUAN_NAMES[i] + '</span>' +
        '<span class="pan-cell-main"><span class="gz">' + esc(c.chuan || '—') + '</span></span>' +
        '<span class="pan-cell-sub"><span class="badge">' + esc(c.jiang || '—') + '</span></span></div>';
    }).join('');

    var meta = (d.dayGZ || '—') + '日 ' + (d.hourGZ || '—') + '时 · ' + (d.jiang || '—') + '将加时（' +
      (d.jqName || '—') + '） · ' + (d.isDay ? '昼占' : '夜占') + ' · 贵人' + (d.guiRen || '—');

    return '<div class="chart-brief">' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">课式 · 四课</span>' +
      '<span>' + esc(meta) + '</span></div>' +
      '<div class="pan-grid cols-4">' + keCells + '</div></div>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">三传</span>' +
      '<span>' + esc((d.keti || '—') + (d.chuanMethod ? ' · 发用 ' + d.chuanMethod : '')) + '</span></div>' +
      '<div class="pan-grid cols-3">' + chuanCells + '</div></div>' +
      '</div>';
  }

  function deepHTML(chart, promptText) {
    var d = chart.resultRaw || {};
    var html = '';

    // 课式全貌
    var keCells = [d.ke1, d.ke2, d.ke3, d.ke4].map(function (z, i) {
      return '<div class="pan-cell"><span class="pan-cell-title">' + KE_NAMES[i] + '</span>' +
        '<span class="pan-cell-main">' + esc(z || '—') + '</span>' +
        '<span class="pan-cell-sub">' + esc(jiangOfZhi(z, d) || '—') + '</span></div>';
    }).join('');
    var chuanCells = (d.chuanJiang || []).map(function (c, i) {
      return '<div class="pan-cell"><span class="pan-cell-title">' + CHUAN_NAMES[i] + '</span>' +
        '<span class="pan-cell-main">' + esc(c.chuan || '—') + '</span>' +
        '<span class="pan-cell-sub">' + esc(c.jiang || '—') + '</span></div>';
    }).join('');
    html += '<div class="deep-sec"><h4>四课 · 三传</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">四课</span><span>干寄宫 ' + esc(d.ganJi || '—') + '</span></div>' +
      '<div class="pan-grid cols-4">' + keCells + '</div></div>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">三传</span><span>' + esc(d.chuanMethod || '—') + '</span></div>' +
      '<div class="pan-grid cols-3">' + chuanCells + '</div></div></div>';

    // 天地盘（十二位）
    var tpCells = ZI.map(function (z, i) {
      return '<div class="pan-cell"><span class="pan-cell-title">' + z + '</span>' +
        '<span class="pan-cell-main"><span class="gz">' + esc((d.tianpan || {})[String(i)] || '—') + '</span></span>' +
        '<span class="pan-cell-sub">' + esc((d.tianJiang || {})[String(i)] || '—') + '</span></div>';
    }).join('');
    html += '<div class="deep-sec"><h4>天地盘（十二位）</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">地盘 · 天盘 · 天将</span>' +
      '<span>' + esc((d.jiang || '—') + '将加' + (d.hourGZ || '—') + '时') + '</span></div>' +
      '<div class="pan-grid cols-6">' + tpCells + '</div></div></div>';

    // 十二天将布宫
    var tjCells = ZI.map(function (z, i) {
      return '<div class="pan-cell"><span class="pan-cell-title">' + z + '</span>' +
        '<span class="pan-cell-main">' + esc((d.tianJiang || {})[String(i)] || '—') + '</span>' +
        '<span class="pan-cell-sub">天盘 ' + esc((d.tianpan || {})[String(i)] || '—') + '</span></div>';
    }).join('');
    html += '<div class="deep-sec"><h4>十二天将布宫</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">天将</span><span>' +
      esc(d.isDay ? '昼贵' : '夜贵') + ' · 贵人' + esc(d.guiRen || '—') + '</span></div>' +
      '<div class="pan-grid cols-6">' + tjCells + '</div></div></div>';

    // 课体与说明
    html += '<div class="deep-sec"><h4>课体与说明</h4>' +
      '<p><span class="badge is-key">' + esc(d.keti || '—') + '</span> ' + esc(d.ketiNote || '') + '</p>' +
      '<p><span class="badge">发用</span> ' + esc((d.chuanMethod || '—') + '：' + (d.chuanNote || '')) + '</p></div>';

    // 断语
    html += '<div class="deep-sec"><h4>断语（古籍引证）</h4>' +
      '<p style="white-space:pre-wrap;line-height:1.9">' + esc(chart.duanyu || '本课暂无命中规则库的现成断语。') + '</p></div>';

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
      artId: 'liuren',
      id: state.chart ? state.chart.id : undefined,
      question: state.question || undefined,
      category: state.category,
      resultRaw: state.chart ? state.chart.resultRaw : undefined
    };
  }

  async function loadDeep(body) {
    if (!state.chart) throw new Error('没有可展示的课盘');
    var res = await DS.post('/api/prompt', aiPayload());
    body.innerHTML = deepHTML(state.chart, res.prompt);
    DS.wireAi(body, aiPayload());
  }

  function renderResult(chart) {
    var result = $('#result');
    result.innerHTML =
      '<hr class="rule">' +
      '<h2 class="step">STEP 03 · 简要盘面</h2>' +
      '<div class="result-meta">记录 <span class="mono">' + esc(chart.id) + '</span> · 大六壬</div>' +
      briefHTML(chart) +
      '<details class="deep-panel" data-result="1">' +
      '<summary class="deep-sum"><span class="sum-txt">⌄ 深度解读（天地盘 · 天将 · 课体 · 提示词 · AI）</span></summary>' +
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
      DS.showToast(e.message || '请检查起课时刻');
      return;
    }
    state.question = ($('#question').value || '').trim();
    state.category = $('#category').value;

    btn.disabled = true;
    btn.textContent = '起课…';
    try {
      var chart = await DS.post('/api/chart', {
        artId: 'liuren',
        question: state.question || undefined,
        category: state.category,
        inputs: datetime ? { datetime: datetime } : {}
      });
      state.chart = chart;
      renderResult(chart);
    } catch (e) {
      DS.showToast((e && e.message) || '起课失败');
    } finally {
      btn.disabled = false;
      btn.textContent = '起 课';
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
