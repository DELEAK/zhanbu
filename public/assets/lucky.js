/* 择吉起盘页（v1）：选术数/时间窗 → 服务端在窗内取最近一个「比平好一点」的吉盘 →
   简要盘面 + 深度面板（判定理由 · 盘面事实 · 断语 · 提示词 · AI）。
   盘面一切以服务端 resultRaw 为准，前端不重算；参数由服务端记录，可复现。 */
(function () {
  'use strict';

  var DS = window.DS;
  var esc = DS.esc;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var state = { chart: null, question: '', category: '综合' };

  function pad2(n) { return String(n).padStart(2, '0'); }

  function fmt(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function localInput(iso) {
    var d = iso ? new Date(iso) : new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function aiPayload() {
    return {
      artId: state.chart ? state.chart.artId : $('#artId').value,
      id: state.chart ? state.chart.id : undefined,
      question: state.question || undefined,
      category: state.category,
      resultRaw: state.chart ? state.chart.resultRaw : undefined
    };
  }

  function deepHTML(chart, promptText) {
    var lucky = chart.lucky || {};
    var html =
      '<div class="deep-sec"><h4>择吉判定</h4>' +
      '<p>' + esc(('目标「比平好一点」；' + (lucky.reason || '按本术吉凶规则判定为吉'))) + '</p>' +
      '<p class="hint">共试 ' + esc(String(lucky.attempts == null ? '—' : lucky.attempts)) +
      ' 个候选盘，命中时刻 ' + esc(fmt(lucky.matchedAt)) + '。</p>' +
      '</div>' +
      '<div class="deep-sec"><h4>盘面事实（逐字引用）</h4>' +
      '<p class="mono" style="white-space:pre-wrap;line-height:1.9">' + esc(chart.brief || '') + '</p>' +
      '</div>';

    if (chart.duanyu) {
      html += '<div class="deep-sec"><h4>断语参考</h4>' +
        '<p style="white-space:pre-wrap;line-height:1.9">' + esc(chart.duanyu) + '</p></div>';
    }

    html +=
      '<div class="deep-sec"><h4>AI 解读提示词</h4>' +
      '<textarea class="prompt-box" readonly rows="9">' + esc(promptText || '（提示词生成失败）') + '</textarea>' +
      '<div class="prompt-actions">' +
      '<button class="btn btn-ai" type="button">AI 深度解读</button>' +
      '<button class="btn btn-copy" type="button">复制 AI 解读提示词</button>' +
      '</div></div>' +
      '<div class="ai-out" hidden></div>';

    return html;
  }

  async function loadDeep(body) {
    if (!state.chart) throw new Error('没有可展示的盘面');
    var res = await DS.post('/api/prompt', aiPayload());
    body.innerHTML = deepHTML(state.chart, res.prompt);
    DS.wireAi(body, aiPayload());
  }

  function renderResult(chart) {
    var lucky = chart.lucky || {};
    var result = $('#result');
    var label = { xiaoliuren: '小六壬', meihua: '梅花易数', qimen: '奇门遁甲', liuren: '大六壬' }[chart.artId] || chart.artId;

    result.innerHTML =
      '<hr class="rule">' +
      '<h2 class="step">STEP 03 · 择吉盘面</h2>' +
      '<div class="result-meta">吉愿模式 · 目标「比平好一点」 · 第 <span class="mono">' +
      esc(String(lucky.attempts == null ? '—' : lucky.attempts)) + '</span> 次命中 · ' +
      '<span class="mono">' + esc(fmt(lucky.matchedAt)) + '</span> · ' + esc(label) +
      ' · 记录 <span class="mono">' + esc(chart.id) + '</span></div>' +
      '<p class="hint">' + esc((lucky.reason || '') ) + '</p>' +
      '<div class="chart-brief" style="white-space:pre-wrap;line-height:1.9">' + esc(chart.brief || '') + '</div>' +
      '<div class="form-actions"><button class="btn-ghost btn-retry" id="retryBtn" type="button">换一天再试</button></div>' +
      '<details class="deep-panel" data-result="1">' +
      '<summary class="deep-sum"><span class="sum-txt">⌄ 深度解读（判定理由 · 盘面事实 · 提示词 · AI）</span></summary>' +
      '<div class="deep-body"></div>' +
      '</details>';
    result.hidden = false;

    var details = $('#result .deep-panel');
    DS.wireDeepPanel(details, loadDeep);
    DS.wireAi(details, aiPayload());

    var retry = $('#retryBtn');
    if (retry) {
      retry.addEventListener('click', function () {
        var at = lucky.matchedAt ? new Date(new Date(lucky.matchedAt).getTime() + 24 * 3600 * 1000) : undefined;
        $('#at').value = at ? localInput(at.toISOString()) : localInput();
        cast();
      });
    }

    if (result.scrollIntoView) {
      result.scrollIntoView({ behavior: DS.scrollBehavior(), block: 'start' });
    }
  }

  async function cast() {
    var btn = $('#castBtn');
    state.question = ($('#question').value || '').trim();
    state.category = $('#category').value;

    var at = ($('#at').value || '').trim();
    var payload = {
      artId: $('#artId').value,
      question: state.question || undefined,
      category: state.category,
      windowMinutes: Number($('#window').value || 720)
    };
    if (at) payload.at = at;

    btn.disabled = true;
    btn.textContent = '择吉中…';
    try {
      var chart = await DS.post('/api/chart/lucky', payload);
      state.chart = chart;
      renderResult(chart);
    } catch (e) {
      DS.showToast((e && e.message) || '择吉起盘失败');
    } finally {
      btn.disabled = false;
      btn.textContent = '为 我 择 吉';
    }
  }

  $('#castBtn').addEventListener('click', cast);
})();
