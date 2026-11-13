/* 小六壬页：六神掌诀横排（命中项强调）+ 吉凶/五行/方位/主数 + 断语诗；
   深度给三步推算过程、六神全表与断语。盘面事实全部来自 /api/chart。 */
(function () {
  'use strict';

  var DS = window.DS;
  var esc = DS.esc;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var state = { chart: null, question: '', category: '综合' };

  var XLR_ORDER = ['大安', '留连', '速喜', '赤口', '小吉', '空亡'];
  // 六神基础资料（与 vendor data/xiaoliuren 一致，仅作未命中格的显示；断语诗用服务端 detail）
  var XLR = {
    '大安': { ji: '吉', wx: '木', num: '一五七', dir: '东方' },
    '留连': { ji: '凶', wx: '水', num: '二八十', dir: '南方' },
    '速喜': { ji: '吉', wx: '火', num: '三六九', dir: '南方' },
    '赤口': { ji: '凶', wx: '金', num: '四七十', dir: '西方' },
    '小吉': { ji: '吉', wx: '木', num: '一五七', dir: '东方' },
    '空亡': { ji: '凶', wx: '土', num: '三六九', dir: '中央' }
  };

  function mod(n, m) { return ((n % m) + m) % m; }

  function briefHTML(chart) {
    var d = chart.resultRaw || {};
    var hit = d.name || '';
    var detail = d.detail || {};

    var cells = XLR_ORDER.map(function (name, i) {
      var isHit = name === hit;
      var info = XLR[name] || {};
      return '<div class="pan-cell' + (isHit ? ' is-key' : '') + '" style="--i:' + i + '">' +
        '<span class="pan-cell-title">' + esc(name) + '</span>' +
        '<span class="pan-cell-main"><span class="gz">' + esc(info.ji || '') + '</span> ' +
        '<span class="wx">' + esc(info.wx || '') + '</span></span>' +
        '<span class="pan-cell-sub">' + (isHit ? '<span class="badge is-key">命中</span>' : esc(info.dir || '')) + '</span></div>';
    }).join('');

    var meta = '落 ' + esc(hit || '—') + ' · 月 ' + esc(String(d.a || '—')) + ' 日 ' + esc(String(d.b || '—')) +
      ' 时 ' + esc(String(d.c || '—'));

    return '<div class="chart-brief">' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">六神掌诀</span>' +
      '<span>' + esc(meta) + '</span></div>' +
      '<div class="pan-grid cols-6">' + cells + '</div></div>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">' + esc(hit || '—') + '</span>' +
      '<span>' + esc(d.mode === 'num' ? '报数起课' : '时辰起课') + '</span></div>' +
      '<div class="pan-grid cols-4">' +
      '<div class="pan-cell is-key"><span class="pan-cell-title">吉凶</span>' +
      '<span class="pan-cell-main">' + esc(detail.ji || '—') + '</span></div>' +
      '<div class="pan-cell"><span class="pan-cell-title">五行</span>' +
      '<span class="pan-cell-main"><span class="wx">' + esc(detail.wx || '—') + '</span></span></div>' +
      '<div class="pan-cell"><span class="pan-cell-title">主数</span>' +
      '<span class="pan-cell-main">' + esc(detail.num || '—') + '</span></div>' +
      '<div class="pan-cell"><span class="pan-cell-title">方位</span>' +
      '<span class="pan-cell-main">' + esc(detail.dir || '—') + '</span></div>' +
      '</div></div>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">断语诗</span><span>掌诀诀辞</span></div>' +
      '<div class="pan-cell"><span class="pan-cell-main mono">' + esc(detail.poem || '—') + '</span></div></div>' +
      '</div>';
  }

  function stepCells(d) {
    var a = Number(d.a || 1), b = Number(d.b || 1), c = Number(d.c || 1);
    var p1 = mod(a - 1, 6);
    var p2 = mod(p1 + (b - 1), 6);
    var p3 = mod(p2 + (c - 1), 6);
    var steps = [
      { label: '起月', at: a, pos: p1, note: '自大安起，数至本月' },
      { label: '起日', at: b, pos: p2, note: '自月落处起，数至本日' },
      { label: '起时', at: c, pos: p3, note: '自日落处起，数至本时辰' }
    ];
    return steps.map(function (s) {
      return '<div class="pan-cell' + (s.pos === d.idx ? ' is-key' : '') + '">' +
        '<span class="pan-cell-title">' + s.label + ' · ' + esc(String(s.at)) + '</span>' +
        '<span class="pan-cell-main"><span class="gz">' + esc(XLR_ORDER[s.pos]) + '</span></span>' +
        '<span class="pan-cell-sub">' + esc(s.note) + '</span></div>';
    }).join('');
  }

  function deepHTML(chart, promptText) {
    var d = chart.resultRaw || {};
    var html = '';

    html += '<div class="deep-sec"><h4>三步推算</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">大安起月 → 月上起日 → 日上起时</span>' +
      '<span>落 ' + esc(d.name || '—') + '</span></div>' +
      '<div class="pan-grid cols-3">' + stepCells(d) + '</div></div></div>';

    html += '<div class="deep-sec"><h4>六神全表</h4>' +
      '<div class="pan"><div class="pan-head"><span class="pan-title">掌诀 · 吉凶 · 五行 · 主数 · 方位</span>' +
      '<span>命中项见简要盘</span></div>' +
      '<div class="pan-grid cols-3">' +
      XLR_ORDER.map(function (name) {
        var info = XLR[name] || {};
        return '<div class="pan-cell' + (name === d.name ? ' is-key' : '') + '">' +
          '<span class="pan-cell-title">' + esc(name) + '</span>' +
          '<span class="pan-cell-main">' + esc(info.ji || '—') + ' · ' + esc(info.wx || '—') + '</span>' +
          '<span class="pan-cell-sub">' + esc((info.num || '') + ' · ' + (info.dir || '')) + '</span></div>';
      }).join('') +
      '</div></div></div>';

    var detail = d.detail || {};
    html += '<div class="deep-sec"><h4>' + esc(d.name || '') + ' · 诀辞</h4>' +
      '<p class="mono" style="line-height:1.9">' + esc(detail.poem || '—') + '</p>' +
      '<p>' + esc(detail.text || '') + '</p></div>';

    html += '<div class="deep-sec"><h4>断语（古籍引证）</h4>' +
      '<p style="white-space:pre-wrap;line-height:1.9">' + esc(chart.duanyu || '本课暂无命中规则库的现成断语。') + '</p></div>';

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
      artId: 'xiaoliuren',
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
      '<div class="result-meta">记录 <span class="mono">' + esc(chart.id) + '</span> · 小六壬</div>' +
      briefHTML(chart) +
      '<details class="deep-panel" data-result="1">' +
      '<summary class="deep-sum"><span class="sum-txt">⌄ 深度解读（三步推算 · 六神全表 · 断语 · 提示词 · AI）</span></summary>' +
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
      var got;
      try {
        got = DS.readBirthForm($('#birthForm'));
      } catch (e) {
        DS.showToast(e.message || '请检查月日时辰');
        return;
      }
      inputs.y = got.y; inputs.m = got.m; inputs.d = got.d; inputs.hourIndex = got.hourIndex;
    }

    state.question = ($('#question').value || '').trim();
    state.category = $('#category').value;

    btn.disabled = true;
    btn.textContent = '起课…';
    try {
      var chart = await DS.post('/api/chart', {
        artId: 'xiaoliuren',
        question: state.question || undefined,
        category: state.category,
        inputs: inputs
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

  function syncMode() {
    var mode = $('#mode').value;
    $('#timeFields').hidden = mode !== 'time';
    $('#numFields').hidden = mode !== 'number';
  }

  function init() {
    DS.birthForm($('#birthForm'), { hourUnknown: false, place: false, gender: '男' });
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
