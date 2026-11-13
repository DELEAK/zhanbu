/* =========================================================
   观微卜影 · 塔罗页
   状态链：S0 选牌阵 → S1 提问(可选) → S2 服务端定稿抽牌 →
   S3 错峰入场 → S4 交错翻牌 → S5 简要结果(scrollIntoView) →
   S6 深度懒展开 → S7 复制提示词 → S8 重置
   简要/深度分层与性能模式正交；深度内容默认不入 DOM。
   ========================================================= */
(function () {
  'use strict';

  var CAT2EN = {
    '综合': 'general',
    '感情': 'love',
    '事业': 'career',
    '财运': 'wealth',
    '学业': 'study',
    '健康': 'health',
    '人际': 'friendship'
  };

  var state = {
    spreads: [],
    cardsById: {},
    cardsReady: false,
    selected: null,
    draw: null,
    readingId: null,
    question: '',
    timers: [],
    busy: false
  };

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function findPos(spread, pid) {
    var ps = (spread && spread.positions) || [];
    for (var i = 0; i < ps.length; i++) {
      if (ps[i].id === pid) return ps[i];
    }
    return null;
  }

  /* ---------------- 牌阵选择 ---------------- */

  async function loadSpreads() {
    var hint = $('#spreadHint');
    try {
      var r = await DS.get('/api/tarot/spreads');
      state.spreads = (r && r.spreads) || [];
      renderSpreads();
      hint.textContent = '共 ' + state.spreads.length + ' 个牌阵，选择其一后即可抽牌。';
    } catch (e) {
      hint.textContent = '牌阵载入失败：' + e.message;
    }
  }

  function renderSpreads() {
    var grid = $('#spreadGrid');
    grid.innerHTML = state.spreads.map(function (s, i) {
      return '<button class="spread-card" type="button" data-id="' + DS.esc(s.id) + '" aria-pressed="false">' +
        '<span class="eyebrow">' + pad2(i + 1) + '</span>' +
        '<span class="spread-name">' + DS.esc(s.name) + '</span>' +
        '<span class="spread-desc">' + DS.esc(s.description || '') + '</span>' +
        '</button>';
    }).join('');
  }

  function onSelectSpread(e) {
    var el = e.target;
    if (!el || !el.closest) return;
    var btn = el.closest('.spread-card');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    var spread = null;
    for (var i = 0; i < state.spreads.length; i++) {
      if (state.spreads[i].id === id) { spread = state.spreads[i]; break; }
    }
    if (!spread) return;
    state.selected = spread;
    Array.prototype.forEach.call(document.querySelectorAll('.spread-card'), function (b) {
      var on = b === btn;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('#drawBtn').disabled = false;
  }

  /* ---------------- 输入 ---------------- */

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

  function readQuestion() {
    return $('#question').value.trim();
  }

  /* ---------------- 抽牌 ---------------- */

  function ensureCards() {
    if (state.cardsReady) return Promise.resolve();
    return DS.get('/api/tarot/cards').then(function (r) {
      var list = (r && r.cards) || [];
      list.forEach(function (c) { state.cardsById[c.id] = c; });
      state.cardsReady = true;
    });
  }

  async function onDraw() {
    if (state.busy) return;
    if (!state.selected) {
      DS.showToast('请先选择一个牌阵');
      return;
    }
    var q = readQuestion();
    if (q.length > 300) {
      DS.showToast('问题请控制在 300 字以内');
      return;
    }

    state.busy = true;
    var btn = $('#drawBtn');
    var oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '抽 牌 中 …';

    try {
      var res = await Promise.all([
        // /api/tarot/session = 服务端定稿抽牌 + 记录入库（含所问之事与来源）
        DS.post('/api/tarot/session', {
          spreadId: state.selected.id,
          question: q || undefined,
          category: CAT2EN[$('#category').value] || 'general'
        }),
        ensureCards()
      ]);
      state.draw = res[0];
      state.readingId = (res[0] && res[0].id) || null;
      state.question = q;
      renderResult();
      scrollToResult();
    } catch (e) {
      DS.showToast(e.message || '抽牌失败');
    } finally {
      state.busy = false;
      btn.disabled = !state.selected;
      btn.textContent = oldText;
    }
  }

  /* ---------------- 一句摘要（design §4.4 模板，≤40 字） ---------------- */

  function makeSummary(posName, kws, reversed) {
    if (!kws || !kws.length) {
      return posName + '位：宜稳守本心，' + (reversed ? '先内观再行动。' : '顺势而为。');
    }
    var k1 = kws[0];
    var mid = kws[1] ? (k1 + '与' + kws[1]) : k1;
    var tail = reversed ? '先内观再行动' : '顺势而为';
    return posName + '位：' + mid + '在此位上提示「' + tail + '」。';
  }

  /* ---------------- 简要结果渲染 ---------------- */

  function cardSlotHTML(d, i, spread) {
    var info = state.cardsById[d.cardId] || { name: '牌 ' + d.cardId, nameEn: '', keywords: [] };
    var pos = findPos(spread, d.positionId);
    var posName = pos ? pos.name : '牌位';
    var kws = (info.keywords || []).slice(0, 2).join(' · ');
    var summary = makeSummary(posName, info.keywords || [], d.isReversed);
    var low = DS.getPerf() === 'low';

    var slotCls = 'card-slot' + (low ? ' is-entered' : '') + (d.isReversed ? ' is-reversed' : '');
    var innerCls = 'card-inner' + (low ? ' is-flipped' : '');

    return '<div class="' + slotCls + '" style="--i:' + i + '">' +
      '<div class="pos-row">' +
        '<span class="pos-badge"><span>' + pad2(i + 1) + '</span></span>' +
        '<span class="pos-name">' + DS.esc(posName) + '</span>' +
      '</div>' +
      '<div class="' + innerCls + '">' +
        '<div class="card-face card-face--back"><span class="back-mark" aria-hidden="true">◇</span></div>' +
        '<div class="card-face card-face--front">' +
          DS.pictureHTML(info) +
          '<div class="card-info">' +
            '<div class="card-name">' + DS.esc(info.name) + '</div>' +
            '<div class="card-name-en">' + DS.esc(info.nameEn || '') + '</div>' +
            '<span class="orient-badge">' + (d.isReversed ? '逆位' : '正位') + '</span>' +
            '<div class="card-kw">关键词：' + DS.esc(kws) + '</div>' +
            '<div class="card-summary">' + DS.esc(summary) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '</div>';
  }

  function renderResult() {
    clearTimers();
    var result = $('#result');
    var draw = state.draw;
    var spread = draw.spread;
    var cards = draw.cards || [];

    var slots = cards.map(function (d, i) { return cardSlotHTML(d, i, spread); }).join('');

    var meta = '<div class="result-meta">' +
      (state.question ? '<span>所问：<b>' + DS.esc(state.question) + '</b></span>' : '') +
      '<span>牌阵：<b>' + DS.esc(spread.name) + '</b></span>' +
      '<span>共 <b>' + cards.length + '</b> 张 · 抽牌与正逆位由服务端定稿</span>' +
      '</div>';

    result.innerHTML =
      '<hr class="rule">' +
      '<h2 class="step">STEP 03 · 简要结果</h2>' +
      meta +
      '<div class="card-row">' + slots + '</div>' +
      '<details class="deep-panel" data-result>' +
        '<summary><span class="sum-txt">⌄ 展开深度解读</span></summary>' +
        '<div class="deep-body"></div>' +
      '</details>' +
      '<div class="form-actions">' +
        '<button class="btn btn-ghost" id="resetBtn" type="button">↺ 重新占卜</button>' +
      '</div>';

    result.hidden = false;

    DS.wireDeepPanel($('.deep-panel', result), loadTarotDeep);
    $('#resetBtn', result).addEventListener('click', onReset);

    orchestrate();
  }

  /* ---------------- 翻牌编排 ---------------- */

  function orchestrate() {
    var slots = document.querySelectorAll('#result .card-slot');
    if (!slots.length) return;
    if (DS.getPerf() !== 'high') return; // low：构建时已瞬时翻面 + is-entered

    var reduced = DS.prefersReduced();

    Array.prototype.forEach.call(slots, function (slot, i) {
      var inner = slot.querySelector('.card-inner');
      if (!inner) return;
      slot.classList.add('is-active');
      state.timers.push(setTimeout(function () {
        inner.classList.add('is-flipped');
      }, reduced ? 0 : 600 + i * 180));
    });

    var total = reduced ? 10 : 600 + slots.length * 180 + 700;
    state.timers.push(setTimeout(function () {
      Array.prototype.forEach.call(slots, function (slot) {
        slot.classList.remove('is-active');
        slot.classList.add('is-entered');
      });
      state.timers = [];
    }, total));
  }

  function clearTimers() {
    state.timers.forEach(function (t) { clearTimeout(t); });
    state.timers = [];
  }

  /* 切换性能模式：冲掉未完成编排，已显示的牌直接落终态，不补播（design §3.3-3） */
  function onPerfChange() {
    clearTimers();
    Array.prototype.forEach.call(document.querySelectorAll('#result .card-inner'), function (el) {
      el.classList.add('is-flipped');
    });
    Array.prototype.forEach.call(document.querySelectorAll('#result .card-slot'), function (el) {
      el.classList.add('is-entered');
      el.classList.remove('is-active');
    });
  }

  function scrollToResult() {
    var el = $('#result');
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ behavior: DS.scrollBehavior(), block: 'start' });
    }
  }

  /* ---------------- 深度内容（首次展开才请求） ---------------- */

  function sectionHTML(s) {
    return '<div class="deep-sec-item">' +
      (s.title ? '<p class="sec-title">' + DS.esc(s.title) + '</p>' : '') +
      paraHTML(s.content) +
      '</div>';
  }

  function paraHTML(text) {
    return String(text || '').split(/\n{2,}/).map(function (p) {
      return '<p>' + DS.esc(p).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  async function loadTarotDeep(body) {
    var draw = state.draw;
    if (!draw) throw new Error('没有可展示的结果');

    var question = state.question;
    var category = $('#category').value;
    var catEn = CAT2EN[category] || 'general';

    // 问题为可选：留空时以占位问题请求 interpret，保证深度段落结构
    //（开篇/总览/逐张牌位解读/深度与建议）与填写问题时一致（F1）
    var interpTask = DS.post('/api/tarot/interpret', {
      id: state.readingId || undefined,
      cards: draw.cards,
      spread: draw.spread,
      question: question || '（用户未填写具体问题）',
      category: catEn
    }).catch(function () { return null; });

    // /api/prompt 与 /api/ai-interpret 共用同一请求体（AI 解读与复制提示词口径一致）
    var aiPayload = {
      artId: 'tarot',
      id: state.readingId || undefined,   // 让服务端把 AI 全文存进这条记录
      question: question || undefined,
      category: category,
      cards: draw.cards,
      spread: draw.spread
    };
    var promptTask = DS.post('/api/prompt', aiPayload);

    var res = await Promise.all([interpTask, promptTask]);
    body.innerHTML = buildDeepHTML(res[0], res[1]);
    DS.wireAi(body, aiPayload);
  }

  function buildDeepHTML(interp, promptRes) {
    var draw = state.draw;
    var spread = draw.spread;
    var sections = (interp && interp.sections) || [];
    var opening = sections.filter(function (s) { return s.type === 'opening' || s.type === 'overview'; });
    var cardSecs = sections.filter(function (s) { return s.type === 'card'; });
    var tail = sections.filter(function (s) {
      return ['esoteric', 'life-action', 'warning', 'summary'].indexOf(s.type) >= 0;
    });

    var html = '';

    if (!opening.length && !cardSecs.length && !tail.length) {
      html += '<p class="hint">未获取到完整解读段落（服务端暂不可用），以下为牌面直读信息。</p>';
    }

    if (opening.length) {
      html += '<div class="deep-sec"><h4>开篇与总览</h4>' + opening.map(sectionHTML).join('') + '</div>';
    }

    html += '<div class="deep-sec"><h4>逐张牌义与牌位</h4>';
    html += (draw.cards || []).map(function (d, i) {
      var info = state.cardsById[d.cardId] || {};
      var pos = findPos(spread, d.positionId);
      var sec = cardSecs[i];
      var out = '<div class="deep-card">' +
        '<div class="deep-card-head">' +
          '<span class="dc-name">' + DS.esc(info.name || '') + '</span>' +
          '<span class="dc-en">' + DS.esc(info.nameEn || '') + '</span>' +
          '<span class="tag' + (d.isReversed ? ' tag-rev' : '') + '">' + (d.isReversed ? '逆位' : '正位') + '</span>' +
          '<span class="dc-pos">' + DS.esc(pos ? pos.name : '') + '位</span>' +
        '</div>';
      if (pos && pos.description) {
        out += '<p class="dc-posdesc">牌位：' + DS.esc(pos.description) + '</p>';
      }
      if (info.meanings) {
        out += '<p><b>正位义：</b>' + DS.esc(info.meanings.upright) + '</p>';
        out += '<p><b>逆位义：</b>' + DS.esc(info.meanings.reversed) + '</p>';
      }
      if (sec && sec.content) {
        out += '<p><b>牌位解读：</b></p>' + paraHTML(sec.content);
      }
      out += '</div>';
      return out;
    }).join('');
    html += '</div>';

    if (tail.length) {
      html += '<div class="deep-sec"><h4>深度与建议</h4>' + tail.map(sectionHTML).join('') + '</div>';
    }

    var promptText = (promptRes && promptRes.prompt) || '提示词生成失败，请收起后重新展开重试。';
    html += '<div class="deep-sec"><h4>AI 解读提示词</h4>' +
      '<p class="hint">点击「AI 深度解读」由服务端调用 AI 模型生成解读全文（未配置 API Key 时会提示）；也可复制下面的提示词（含问题、分类与本次牌面事实），粘贴到任意 AI 工具。</p>' +
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

  /* ---------------- 重置 ---------------- */

  function onReset() {
    clearTimers();
    state.draw = null;
    state.readingId = null;
    var result = $('#result');
    result.innerHTML = '';
    result.hidden = true;
    var target = $('#stepSpread');
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ behavior: DS.scrollBehavior(), block: 'start' });
    }
  }

  /* ---------------- 分类联动（F2） ---------------- */

  function onCategoryChange() {
    var deep = document.querySelector('#result .deep-panel');
    if (!deep || !deep.getAttribute('data-loaded')) return;
    if (deep.open) {
      DS.refreshDeep(deep); // 深度已展开：按新分类重取 interpret + prompt
    } else {
      // 深度已收起：失效已加载标记，下次展开按新分类重取
      deep.removeAttribute('data-loaded');
      var body = deep.querySelector('.deep-body');
      if (body) body.innerHTML = '';
    }
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    wireChips();
    $('#spreadGrid').addEventListener('click', onSelectSpread);
    $('#drawBtn').addEventListener('click', onDraw);
    $('#category').addEventListener('change', onCategoryChange);
    DS.onPerfChange(onPerfChange);
    loadSpreads();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
