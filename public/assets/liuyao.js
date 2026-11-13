/* =========================================================
   观微卜影 · 六爻页
   动线：STEP 01 所问何事(可选) → POST /api/liuyao 服务端起卦 →
   STEP 02 简要结果（本卦/变卦/世应/动爻 + 爻象线条）→
   深度懒展开（逐爻装卦/用神候选/变卦对应/卦辞象辞/AI 提示词）→ 复制 → 重置
   简要/深度分层与性能模式正交；深度内容默认不入 DOM。
   ========================================================= */
(function () {
  'use strict';

  /* 地支五行（旺衰推导用：月支五行 vs 爻支五行） */
  var ZHI_WX = {
    '子': '水', '亥': '水',
    '寅': '木', '卯': '木',
    '巳': '火', '午': '火',
    '申': '金', '酉': '金',
    '辰': '土', '戌': '土', '丑': '土', '未': '土'
  };
  var SHENG = { '木': '火', '火': '土', '土': '金', '金': '水', '水': '木' }; // key 生 value
  var KE = { '木': '土', '土': '水', '水': '火', '火': '金', '金': '木' };     // key 克 value

  var state = {
    result: null,
    question: '',
    promptText: '',
    busy: false,
    copying: false
  };

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function posName(p) {
    if (!p || p < 1 || p > 6) return '—';
    return ['初', '二', '三', '四', '五', '上'][p - 1] + '爻';
  }

  /* 爻题：初/上爻为「位置+阴阳」，中间为「阴阳+序数」 */
  function yaoTi(y, i) {
    if (i === 0) return '初' + (y ? '九' : '六');
    if (i === 5) return '上' + (y ? '九' : '六');
    return (y ? '九' : '六') + ['', '二', '三', '四', '五'][i];
  }

  function yaoXiang(y) {
    return y ? '▅▅▅▅▅' : '▅▅　▅▅';
  }

  /* 旺衰展示层推导：月支五行 vs 爻支五行 */
  function wangShuai(monthWx, zhiWx) {
    if (!monthWx || !zhiWx) return { label: '—', cls: 'ws-mid' };
    if (monthWx === zhiWx) return { label: '旺', cls: 'ws-good' };
    if (SHENG[monthWx] === zhiWx) return { label: '相', cls: 'ws-good' };
    if (SHENG[zhiWx] === monthWx) return { label: '休', cls: 'ws-mid' };
    if (KE[monthWx] === zhiWx) return { label: '囚', cls: 'ws-mid' };
    if (KE[zhiWx] === monthWx) return { label: '死', cls: 'ws-bad' };
    return { label: '—', cls: 'ws-mid' };
  }

  /* 用神候选：问题分类 → 六亲（与 server/services/yongshen.ts CATEGORY_MAP 同口径） */
  function yongTargets(category) {
    switch (category) {
      case '财运': return { liuqins: ['妻财'], useShi: false, label: '妻财' };
      case '事业': return { liuqins: ['官鬼'], useShi: false, label: '官鬼' };
      case '学业': return { liuqins: ['父母'], useShi: false, label: '父母' };
      case '健康': return { liuqins: ['官鬼'], useShi: true, label: '官鬼（忌）与世爻' };
      case '人际': return { liuqins: ['兄弟'], useShi: false, label: '兄弟' };
      default: return { liuqins: [], useShi: true, label: '世爻' }; // 综合 / 感情
    }
  }

  function badge(text) {
    return '<span class="pos-badge badge-teal"><span>' + text + '</span></span>';
  }

  function yaoRowHTML(cls, i, ti, xiang, marks) {
    return '<div class="' + cls + '" style="--i:' + i + '">' +
      '<span class="yao-ti">' + ti + '</span>' +
      '<span class="yao-xiang">' + xiang + '</span>' +
      '<span class="yao-marks">' + marks + '</span>' +
      '</div>';
  }

  /* 简要卦象：本卦六爻（DOM 上→初，--i 让初爻先入场），世应弱底色 + 动爻圆点 */
  function hexagramBriefHTML(rr) {
    var yao = rr.yao || [];
    var dong = rr.dongYao || [];
    var najia = rr.najia || {};
    var rows = '';
    for (var i = 5; i >= 0; i--) {
      var cls = 'yao-row';
      var marks = '';
      if (i + 1 === najia.shiPos) { cls += ' is-shi'; marks += badge('世'); }
      if (i + 1 === najia.yingPos) { cls += ' is-ying'; marks += badge('应'); }
      if (dong.indexOf(i + 1) >= 0) {
        var m = yao[i] ? '○' : '×';
        marks += '<span class="dong-mark">' + m + '<span class="dong-txt">动</span></span>';
      }
      rows += yaoRowHTML(cls, i, yaoTi(yao[i], i), yaoXiang(yao[i]), marks);
    }
    return '<div class="hexagram">' +
      '<p class="hexagram-title">本卦 · ' + DS.esc(rr.benGua.name) + '</p>' +
      rows + '</div>';
  }

  /* 深度·变卦对应爻：动爻位阴阳取反，原动爻标「原动」（注入内容不再播放入场动画） */
  function hexagramBianHTML(rr) {
    var yao = rr.yao || [];
    var dong = rr.dongYao || [];
    var rows = '';
    for (var i = 5; i >= 0; i--) {
      var isDong = dong.indexOf(i + 1) >= 0;
      var by = isDong ? (yao[i] ? 0 : 1) : yao[i];
      var marks = isDong ? '<span class="tag tag-teal">原动</span>' : '';
      rows += yaoRowHTML('yao-row is-entered', i, yaoTi(by, i), yaoXiang(by), marks);
    }
    return '<div class="hexagram">' +
      '<p class="hexagram-title">变卦 · ' + DS.esc(rr.bianGua.name) + '</p>' +
      rows + '</div>';
  }

  /* ---------------- 抽卦 ---------------- */

  async function onCast() {
    if (state.busy) return;
    var q = $('#question').value.trim();
    if (q.length > 300) {
      DS.showToast('问题请控制在 300 字以内');
      return;
    }
    state.busy = true;
    var btn = $('#castBtn');
    var oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '起 卦 中 …';
    try {
      var res = await DS.post('/api/liuyao', { question: q || undefined });
      state.result = res;
      state.question = q;
      state.promptText = '';
      renderResult();
      scrollToResult();
    } catch (e) {
      DS.showToast((e && e.message) || '起卦失败，请稍后再试');
    } finally {
      state.busy = false;
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }

  function renderResult() {
    var result = $('#result');
    var rr = state.result.resultRaw;
    var najia = rr.najia || {};
    var hasDong = (rr.dongYao || []).length > 0;
    var dongText = hasDong ? rr.dongYao.map(posName).join('、') : '无';

    var meta = '<div class="result-meta">' +
      (state.question ? '<span>所问：<b>' + DS.esc(state.question) + '</b></span>' : '') +
      '<span>起卦：<b>服务端定稿</b> · 纳甲装卦</span>' +
      '</div>';

    var brief = '<div class="gua-brief">' +
      '<div class="gua-line">' +
        '<span class="gua-label">本卦</span>' +
        '<span class="gua-name">' + DS.esc(rr.benGua.name) + '</span>' +
        (najia.gong ? '<span class="gua-meta">卦宫：' + DS.esc(najia.gong) + '</span>' : '') +
      '</div>' +
      '<div class="gua-line">' +
        '<span class="gua-label">变卦</span>' +
        (hasDong
          ? '<span class="gua-name">' + DS.esc(rr.bianGua.name) + '</span>'
          : '<span class="gua-unchanged">无动爻，卦不变</span>') +
      '</div>' +
      '<div class="gua-facts">' +
        '<span>世爻：<b>' + DS.esc(posName(najia.shiPos)) + '</b></span>' +
        '<span class="fact-sep">◆</span>' +
        '<span>应爻：<b>' + DS.esc(posName(najia.yingPos)) + '</b></span>' +
        '<span>动爻：<b>' + DS.esc(dongText) + '</b></span>' +
      '</div>' +
      '</div>';

    result.innerHTML =
      '<hr class="rule">' +
      '<h2 class="step">STEP 02 · 简要结果</h2>' +
      meta +
      brief +
      hexagramBriefHTML(rr) +
      '<details class="deep-panel" data-result>' +
        '<summary><span class="sum-txt">⌄ 展开深度解读</span></summary>' +
        '<div class="deep-body"></div>' +
      '</details>' +
      '<div class="form-actions">' +
        '<button class="btn" id="copyTopBtn" type="button">复制 AI 起卦提示词</button>' +
        '<button class="btn btn-ghost" id="resetBtn" type="button">↺ 重新起卦</button>' +
      '</div>';

    result.hidden = false;

    DS.wireDeepPanel($('.deep-panel', result), loadLiuyaoDeep);
    $('#resetBtn', result).addEventListener('click', onReset);
    $('#copyTopBtn', result).addEventListener('click', onCopyPrompt);
  }

  function scrollToResult() {
    var el = $('#result');
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ behavior: DS.scrollBehavior(), block: 'start' });
    }
  }

  /* ---------------- 深度：懒注入（首次展开才请求） ---------------- */

  async function loadLiuyaoDeep(body) {
    var res = state.result;
    if (!res) throw new Error('没有可展示的结果');

    var category = $('#category').value;
    // /api/prompt 与 /api/ai-interpret 共用同一请求体（AI 解读与复制提示词口径一致）
    var aiPayload = {
      artId: 'liuyao',
      id: (state.result && state.result.id) || undefined,   // 让服务端把 AI 全文存进这条记录
      question: state.question || undefined,
      category: category,
      resultRaw: res.resultRaw
    };
    var promptRes = await DS.post('/api/prompt', aiPayload);

    state.promptText = (promptRes && promptRes.prompt) || '';
    body.innerHTML = buildDeepHTML(promptRes);
    updateYongshen();
    DS.wireAi(body, aiPayload);
  }

  function buildDeepHTML(promptRes) {
    var rr = state.result.resultRaw;
    var najia = rr.najia || {};
    var lines = najia.lines || [];
    var monthWx = ZHI_WX[najia.monthZhi] || '';
    var hasDong = (rr.dongYao || []).length > 0;

    var html = '';

    /* ① 逐爻装卦（用神候选徽章 + 图例随表懒注入） */
    html += '<div class="deep-sec"><h4>逐爻装卦</h4>' +
      '<div class="yao-table-wrap"><table class="yao-table"><thead><tr>' +
      '<th>爻位</th><th>爻象</th><th>干支</th><th>六亲</th><th>六神</th><th>旺衰</th><th>世应</th><th>空破</th><th>用神</th>' +
      '</tr></thead><tbody>' +
      lines.map(function (l, idx) {
        var trCls = '';
        if (l.isShi) trCls += ' is-shi';
        if (l.isYing) trCls += ' is-ying';
        var ws = wangShuai(monthWx, l.zhiWx);
        var zhi = String(l.gz || '').charAt(1);
        var kongPo = '';
        if (l.kong) kongPo += '<span class="tag tag-dim">旬空</span> ';
        if ((najia.yuePo || []).indexOf(zhi) >= 0) kongPo += '<span class="tag tag-danger">月破</span>';
        var shiYing = l.isShi ? '<span class="tag tag-teal">世</span>'
          : l.isYing ? '<span class="tag tag-teal">应</span>' : '—';
        return '<tr class="' + trCls.trim() + '" data-liuqin="' + DS.esc(l.liuqin) + '" data-shi="' + (l.isShi ? '1' : '0') + '">' +
          '<td>' + posName(idx + 1) + '</td>' +
          '<td class="td-xiang">' + yaoXiang(rr.yao[idx]) + '</td>' +
          '<td>' + DS.esc(l.gz) + '</td>' +
          '<td>' + DS.esc(l.liuqin) + '</td>' +
          '<td>' + DS.esc(l.shen) + '</td>' +
          '<td><span class="ws ' + ws.cls + '">' + ws.label + '</span></td>' +
          '<td>' + shiYing + '</td>' +
          '<td>' + (kongPo || '—') + '</td>' +
          '<td><span class="tag tag-yong" hidden>用神</span></td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<div class="yong-legend"></div>' +
      '</div>';

    /* ② 变卦对应爻（仅动爻卦展示） */
    if (hasDong) {
      html += '<div class="deep-sec"><h4>变卦对应爻</h4>' +
        hexagramBianHTML(rr) +
        (rr.bianGua.xiang ? '<p class="hint">' + DS.esc(rr.bianGua.xiang) + '</p>' : '') +
        '</div>';
    }

    /* ③ 卦辞与象辞 */
    html += '<div class="deep-sec"><h4>卦辞与象辞</h4>' +
      '<div class="gua-couple">' +
        '<span class="couple-label">本卦 · ' + DS.esc(rr.benGua.name) + '</span>' +
        '<span class="couple-ci">' + DS.esc(rr.benGua.ci || '—') + '</span>' +
        '<span class="couple-xiang">象辞：' + DS.esc(rr.benGua.xiang || '—') + '</span>' +
      '</div>' +
      (hasDong
        ? '<div class="gua-couple">' +
            '<span class="couple-label">变卦 · ' + DS.esc(rr.bianGua.name) + '</span>' +
            '<span class="couple-ci">' + DS.esc(rr.bianGua.ci || '—') + '</span>' +
            '<span class="couple-xiang">象辞：' + DS.esc(rr.bianGua.xiang || '—') + '</span>' +
          '</div>'
        : '<div class="gua-couple"><span class="couple-xiang">无动爻，卦不变。</span></div>') +
      '</div>';

    /* ④ AI 解读提示词（服务端拼好；可由服务端 LLM 生成解读全文，也可复制提示词） */
    var promptText = (promptRes && promptRes.prompt) || '提示词生成失败，请收起后重新展开重试。';
    html += '<div class="deep-sec"><h4>AI 解读提示词</h4>' +
      '<p class="hint">点击「AI 深度解读」由服务端调用 AI 模型生成解读全文（未配置 API Key 时会提示）；也可复制下面的提示词（含问题、分类与本次卦象事实），粘贴到任意 AI 工具。</p>' +
      '<div class="ai-model-picker"></div>' +
      '<div class="prompt-block">' +
        '<textarea class="prompt-box" readonly rows="9">' + DS.esc(promptText) + '</textarea>' +
        '<div class="prompt-actions">' +
          '<button class="btn btn-ai" type="button">AI 深度解读</button>' +
          '<button class="btn btn-copy" type="button">复制 AI 解读提示词</button>' +
        '</div>' +
      '</div>' +
      '<div class="ai-out" hidden></div>' +
      '</div>';

    return html;
  }

  /* 用神候选徽章：分类 select 联动（同六亲多爻全部标注，不擅自取舍） */
  function updateYongshen() {
    var table = document.querySelector('#result .yao-table');
    var legend = document.querySelector('#result .yong-legend');
    if (!table || !legend || !state.result) return;

    var category = $('#category').value;
    var targets = yongTargets(category);
    var najia = state.result.resultRaw.najia || {};
    var lines = najia.lines || [];
    var hits = [];

    Array.prototype.forEach.call(table.querySelectorAll('tbody tr'), function (tr, idx) {
      var l = lines[idx];
      if (!l) return;
      var hit = targets.liuqins.indexOf(l.liuqin) >= 0 || (targets.useShi && l.isShi);
      var tag = tr.querySelector('.tag-yong');
      if (tag) {
        if (hit) tag.removeAttribute('hidden');
        else tag.setAttribute('hidden', '');
      }
      if (hit) hits.push(posName(idx + 1));
    });

    var html = '<b>用神候选</b>（按问题分类「' + DS.esc(category) + '」→ ' + DS.esc(targets.label) + '）：';
    if (hits.length) {
      html += DS.esc(hits.join('、'));
    } else {
      html += '<span class="yong-none">本卦六亲中未见' + DS.esc(targets.label) +
        '爻（用神不上卦，须寻伏神，勿自行补造）</span>' +
        '，按规则以世爻为候选（' + DS.esc(posName(najia.shiPos)) + '）';
    }
    html += '<br><b>世爻参考</b>：' + DS.esc(najia.shiLiQin || '—');
    legend.innerHTML = html;
  }

  /* ---------------- 复制 / 重置 ---------------- */

  async function onCopyPrompt() {
    var btn = $('#copyTopBtn');
    if (!state.result || state.copying) return;
    state.copying = true;
    btn.disabled = true;
    try {
      if (!state.promptText) {
        var promptRes = await DS.post('/api/prompt', {
          artId: 'liuyao',
          question: state.question || undefined,
          category: $('#category').value,
          resultRaw: state.result.resultRaw
        });
        state.promptText = (promptRes && promptRes.prompt) || '';
      }
      if (!state.promptText) throw new Error('提示词获取失败');
      btn.disabled = false;
      DS.copyText(state.promptText, btn);
    } catch (e) {
      DS.showToast((e && e.message) || '获取提示词失败');
    } finally {
      state.copying = false;
      btn.disabled = false;
    }
  }

  function onReset() {
    state.result = null;
    state.promptText = '';
    var result = $('#result');
    result.innerHTML = '';
    result.hidden = true;
    var step = $('#stepQuestion');
    if (step && step.scrollIntoView) {
      step.scrollIntoView({ behavior: DS.scrollBehavior(), block: 'start' });
    }
  }

  function onCategoryChange() {
    state.promptText = ''; // 分类影响用神与提示词，缓存失效
    var deep = document.querySelector('#result .deep-panel');
    if (!deep || !deep.getAttribute('data-loaded')) return;
    if (deep.open) {
      DS.refreshDeep(deep); // 深度已展开：重取提示词并重标用神徽章
    } else {
      // 深度已收起（F3）：失效已加载标记，下次展开按新分类重取
      deep.removeAttribute('data-loaded');
      var body = deep.querySelector('.deep-body');
      if (body) body.innerHTML = '';
    }
  }

  /* 切换性能模式：不重放入场动画，已显示的爻行直接标记为已入场 */
  function onPerfChange() {
    DS.markEntered(document);
  }

  function wireChips() {
    $('#chips').addEventListener('click', function (e) {
      var el = e.target;
      if (!el || !el.closest) return;
      var chip = el.closest('.chip');
      if (!chip) return;
      var q = $('#question');
      q.value = chip.textContent.trim();
      q.focus();
    });
  }

  function init() {
    wireChips();
    $('#castBtn').addEventListener('click', onCast);
    $('#category').addEventListener('change', onCategoryChange);
    DS.onPerfChange(onPerfChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
