/* =========================================================
   观微卜影 · 共享脚本（纯静态，无框架、无构建）
   职责：data-perf 双性能模式切换（根元素属性 + localStorage 持久化
   + 不刷新页面）、fetch 封装、复制按钮与 Toast、图片档位加载器、
   深度面板（details）懒注入与开合编排。
   ========================================================= */
(function () {
  'use strict';

  var LS_KEY = 'divination.perf';

  /* ---------------- 工具 ---------------- */

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function get(url) {
    var res = await fetch(url, { method: 'GET' });
    var json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    if (!res.ok) throw new Error((json && json.message) || ('请求失败（HTTP ' + res.status + '）'));
    return json;
  }

  async function post(url, data) {
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {})
    });
    var json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    if (!res.ok) throw new Error((json && json.message) || ('请求失败（HTTP ' + res.status + '）'));
    return json;
  }

  /* ---------------- Toast ---------------- */

  var toastTimer = null;

  function showToast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('is-show');
      toastTimer = null;
    }, 1800);
  }

  /* ---------------- 复制 ---------------- */

  async function copyText(text, btn) {
    var ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (e) {
      ok = false;
    }
    if (!ok) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e2) {
        ok = false;
      }
    }
    if (ok) {
      if (btn) {
        var old = btn.textContent;
        btn.textContent = '已复制 ✓';
        setTimeout(function () { btn.textContent = old; }, 1500);
      }
      showToast('提示词已复制');
    } else {
      showToast('复制失败，请手动选择文本复制');
    }
    return ok;
  }

  /* ---------------- 性能模式 ---------------- */

  function getPerf() {
    return document.documentElement.dataset.perf === 'high' ? 'high' : 'low';
  }

  function prefersReduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function scrollBehavior() {
    return getPerf() === 'high' && !prefersReduced() ? 'smooth' : 'auto';
  }

  var perfCallbacks = [];

  function onPerfChange(fn) {
    if (typeof fn === 'function') perfCallbacks.push(fn);
  }

  function updateToggleUI() {
    var mode = getPerf();
    Array.prototype.forEach.call(document.querySelectorAll('.perf-toggle'), function (btn) {
      btn.setAttribute('aria-checked', mode === 'high' ? 'true' : 'false');
      var st = btn.querySelector('.perf-state');
      if (st) st.textContent = mode === 'high' ? '精致' : '流畅';
    });
  }

  /* 图片档位重写：high 补 1200 AVIF/WebP source，low 只留 480 WebP img（design §3.3-4） */
  function applyImgMode(scope) {
    var mode = getPerf();
    Array.prototype.forEach.call((scope || document).querySelectorAll('picture[data-low]'), function (p) {
      if (p.getAttribute('data-mode') === mode) return;
      p.setAttribute('data-mode', mode);
      Array.prototype.forEach.call(p.querySelectorAll('source'), function (s) { s.parentNode.removeChild(s); });
      var img = p.querySelector('img');
      if (img) img.setAttribute('src', p.getAttribute('data-low') || '');
      if (mode === 'high') {
        var hiA = p.getAttribute('data-hi-avif') || '';
        var hiW = p.getAttribute('data-hi-webp') || '';
        if (hiA) {
          var s1 = document.createElement('source');
          s1.setAttribute('type', 'image/avif');
          s1.setAttribute('srcset', hiA);
          p.insertBefore(s1, img);
        }
        if (hiW) {
          var s2 = document.createElement('source');
          s2.setAttribute('type', 'image/webp');
          s2.setAttribute('srcset', (p.getAttribute('data-low') || '') + ' 480w, ' + hiW + ' 1200w');
          s2.setAttribute('sizes', '(max-width: 640px) 108px, 130px');
          p.insertBefore(s2, img);
        }
      }
    });
  }

  /* 终结入场动效状态：切换模式后不给已显示内容补动画（design §3.3-3） */
  function markEntered(scope) {
    Array.prototype.forEach.call(
      (scope || document).querySelectorAll('.card-slot, .hexagram .yao-row'),
      function (el) { el.classList.add('is-entered'); }
    );
  }

  function setPerf(mode) {
    if (mode !== 'low' && mode !== 'high') return;
    var root = document.documentElement;
    if (root.getAttribute('data-perf') === mode) { updateToggleUI(); return; }

    // 1) 先终结进行中的动效状态（入场/翻牌编排），避免切换后补播
    markEntered(document);

    // 2) 已展开的深度面板直接给终态（内联 max-height:none），防止 high 侧补播展开过渡
    Array.prototype.forEach.call(document.querySelectorAll('.deep-panel[open]'), function (d) {
      d.classList.add('is-open');
      var b = d.querySelector('.deep-body');
      if (b) b.style.maxHeight = 'none';
    });

    // 3) 切到 high 的瞬间禁止一切 transition（值就地落定，不产生补播动画）
    if (mode === 'high') root.classList.add('perf-switching');

    // 4) 只改根元素属性 + localStorage：不刷新页面、不重建 DOM
    root.setAttribute('data-perf', mode);
    try { localStorage.setItem(LS_KEY, mode); } catch (e) { /* 隐私模式忽略 */ }

    updateToggleUI();
    applyImgMode(document);

    // 5) 页面各自的收尾（如冲掉未完成的翻牌定时器）
    for (var i = 0; i < perfCallbacks.length; i++) {
      try { perfCallbacks[i](mode); } catch (e) { /* 单个回调失败不影响切换 */ }
    }

    if (mode === 'high') {
      setTimeout(function () { root.classList.remove('perf-switching'); }, 80);
    }
  }

  /* ---------------- 图片（牌面）---------------- */

  function pictureHTML(c) {
    var name = (c && c.name) ? c.name : '塔罗牌面';
    var low = (c && c.imgLow) ? c.imgLow : '';
    if (!low) {
      return '<span class="card-pic card-pic-fallback" aria-hidden="true">◇</span>';
    }
    var mode = getPerf();
    // API 字段为 imgHiWebP（大写 P），兼容旧拼写 imgHiWebp
    var hiW = (c.imgHiWebP || c.imgHiWebp || '');
    var hiA = (c.imgHiAvif || '');
    var html = '<picture data-low="' + esc(low) + '" data-hi-webp="' + esc(hiW) +
      '" data-hi-avif="' + esc(hiA) + '" data-mode="' + mode + '">';
    if (mode === 'high') {
      if (hiA) html += '<source type="image/avif" srcset="' + esc(hiA) + '">';
      if (hiW) {
        html += '<source type="image/webp" srcset="' + esc(low) + ' 480w, ' + esc(hiW) +
          ' 1200w" sizes="(max-width: 640px) 108px, 130px">';
      }
    }
    html += '<img src="' + esc(low) + '" width="130" height="200" loading="lazy" decoding="async" alt="' +
      esc(name) + '">';
    html += '</picture>';
    return html;
  }

  /* ---------------- 深度面板（details 懒注入）---------------- */

  function openDeep(details) {
    var body = details.querySelector('.deep-body');
    if (!body) return Promise.resolve();
    var loader = details._loader;

    var chain = Promise.resolve();
    if (loader && !details.getAttribute('data-loaded')) {
      details.setAttribute('data-loaded', '1');
      body.innerHTML = '<p class="deep-loading">深度内容生成中…</p>';
      chain = Promise.resolve()
        .then(function () { return loader(body, details); })
        .catch(function (err) {
          details.removeAttribute('data-loaded'); // 失败后允许收起再展开重试
          body.innerHTML = '<p class="deep-err">深度内容生成失败：' +
            esc(err && err.message ? err.message : err) + '</p>';
        });
    }

    return chain.then(function () {
      if (!details.open) return;
      setTimeout(function () {
        if (!details.open) return;
        details.classList.add('is-open');
        setTimeout(function () {
          if (details.open) body.style.maxHeight = 'none';
        }, 560);
      }, 30);
    });
  }

  /* 分类等输入变化后重建已展开的深度内容（保持与表单一致） */
  function refreshDeep(details) {
    if (!details || !details.open || !details.getAttribute('data-loaded')) return;
    var body = details.querySelector('.deep-body');
    var loader = details._loader;
    if (!body || !loader) return;
    body.style.maxHeight = '';
    body.innerHTML = '<p class="deep-loading">深度内容生成中…</p>';
    Promise.resolve()
      .then(function () { return loader(body, details); })
      .catch(function (err) {
        body.innerHTML = '<p class="deep-err">深度内容生成失败：' +
          esc(err && err.message ? err.message : err) + '</p>';
      })
      .then(function () {
        if (!details.open) return;
        setTimeout(function () {
          if (!details.open) return;
          details.classList.add('is-open');
          setTimeout(function () {
            if (details.open) body.style.maxHeight = 'none';
          }, 560);
        }, 30);
      });
  }

  function wireDeepPanel(details, loader) {
    if (!details || details.getAttribute('data-wired')) return;
    details.setAttribute('data-wired', '1');
    details._loader = loader || null;

    var sumTxt = details.querySelector('.sum-txt');
    var sumBase = sumTxt ? sumTxt.textContent.replace(/^[⌄⌃]\s*/, '') : '';

    details.addEventListener('toggle', function () {
      if (details.open) {
        if (sumTxt) sumTxt.textContent = '⌃ ' + sumBase;
        openDeep(details);
      } else {
        if (sumTxt) sumTxt.textContent = '⌄ ' + sumBase;
        details.classList.remove('is-open');
        var b = details.querySelector('.deep-body');
        if (b) b.style.maxHeight = '';
      }
    });

    // 复制按钮事件委托（深度内容重建后仍然有效）
    details.addEventListener('click', function (e) {
      var el = e.target;
      if (!el || !el.closest) return;
      var btn = el.closest('.btn-copy');
      if (!btn) return;
      var sec = btn.closest('.deep-sec') || details;
      var ta = sec.querySelector('.prompt-box');
      if (ta) copyText(ta.value || ta.textContent || '', btn);
    });
  }

  /* ---------------- AI 深度解读（服务端调用 MiMo；API Key 不进浏览器） ---------------- */

  function textParaHTML(text) {
    return String(text || '').split(/\n{2,}/).map(function (p) {
      return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  // root：深度面板容器（须含 .btn-ai 与 .ai-out）；payload：与 /api/prompt 相同的请求体
  function wireAi(root, payload) {
    var btn = root.querySelector('.btn-ai');
    var out = root.querySelector('.ai-out');
    if (!btn || !out) return;
    var running = false;
    btn.addEventListener('click', function () {
      if (running) return;
      running = true;
      btn.disabled = true;
      out.hidden = false;
      out.innerHTML = '<p class="hint">AI 解读生成中…（约 10-30 秒）</p>';
      post('/api/ai-interpret', payload).then(function (res) {
        out.innerHTML = '<div class="ai-text">' + textParaHTML(res && res.text) + '</div>' +
          '<p class="hint">由 ' + esc((res && res.model) || 'MiMo') + ' 生成' +
          (res && res.cached ? '（同盘缓存）' : '') + '，仅供参考。</p>';
      }).catch(function (e) {
        out.innerHTML = '<p class="hint">AI 解读暂不可用：' + esc((e && e.message) || '未知错误') +
          '。可复制下方提示词粘贴到任意 AI 工具。</p>';
      }).then(function () {
        running = false;
        btn.disabled = false;
      });
    });
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    updateToggleUI();

    Array.prototype.forEach.call(document.querySelectorAll('.perf-toggle'), function (btn) {
      btn.addEventListener('click', function () {
        setPerf(getPerf() === 'high' ? 'low' : 'high');
      });
    });

    // 静态内容的深度面板（首页说明等）走同一套开合逻辑，无加载器
    Array.prototype.forEach.call(document.querySelectorAll('details.deep-panel'), function (d) {
      if (d.hasAttribute('data-result')) return; // 结果区面板由页面脚本按需注入
      wireDeepPanel(d, null);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DS = {
    esc: esc,
    get: get,
    post: post,
    showToast: showToast,
    copyText: copyText,
    getPerf: getPerf,
    setPerf: setPerf,
    onPerfChange: onPerfChange,
    prefersReduced: prefersReduced,
    scrollBehavior: scrollBehavior,
    pictureHTML: pictureHTML,
    applyImgMode: applyImgMode,
    markEntered: markEntered,
    wireDeepPanel: wireDeepPanel,
    refreshDeep: refreshDeep,
    wireAi: wireAi,
    LS_KEY: LS_KEY
  };
})();
