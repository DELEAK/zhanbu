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

  /* ---------------- AI 模型手选（厂商 + 模型） ---------------- */

  var aiModelsCache = null;

  function loadAiModels() {
    if (aiModelsCache) return aiModelsCache;
    aiModelsCache = get('/api/ai-models').catch(function (e) {
      aiModelsCache = null;
      throw e;
    });
    return aiModelsCache;
  }

  // 在容器里渲染「模型」下拉框（只列已配置厂商；Ollama 为本地实时模型清单）
  // 返回取值函数：{ provider, model }（自动模式返回空对象）
  function wireModelPicker(root) {
    var host = root && root.querySelector ? root.querySelector('.ai-model-picker') : null;
    if (!host) return null;
    if (host.getAttribute('data-wired')) return host._pick;
    host.setAttribute('data-wired', '1');
    host.innerHTML = '<span class="ai-model-label">模型</span>' +
      '<select class="ai-model-select"><option value="">加载中…</option></select>';
    var sel = host.querySelector('.ai-model-select');
    loadAiModels().then(function (data) {
      var cur = data.current || {};
      var html = '<option value="">自动（当前：' + esc((cur.providerLabel || '') + ' ' + (cur.model || '')).trim() + '）</option>';
      (data.providers || []).forEach(function (p) {
        if (!p.configured) return;                       // 只列已配好 Key 的厂商
        var models = p.models || [];
        if (!models.length) return;
        html += '<optgroup label="' + esc(p.label) + '">';
        models.forEach(function (m) {
          html += '<option value="' + esc(p.id + '|' + m.id) + '">' + esc(m.label) + '</option>';
        });
        html += '</optgroup>';
      });
      sel.innerHTML = html;
    }).catch(function () {
      sel.innerHTML = '<option value="">（模型清单获取失败，将用服务端默认）</option>';
    });
    host._pick = function () {
      var v = sel.value || '';
      if (!v) return {};
      var i = v.indexOf('|');
      if (i < 0) return {};
      return { provider: v.slice(0, i), model: v.slice(i + 1) };
    };
    return host._pick;
  }

  /* ---------------- AI 深度解读（服务端调用 LLM，厂商可切换；API Key 不进浏览器） ---------------- */

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
    var pickFn = wireModelPicker(root);   // 有模型选择器就用它（页面上手选厂商/模型）
    var running = false;
    btn.addEventListener('click', function () {
      if (running) return;
      running = true;
      btn.disabled = true;
      out.hidden = false;
      out.innerHTML = '<p class="hint">AI 解读生成中…（云端模型约 10-30 秒，本地小模型可能更久）</p>';
      var pick = pickFn ? pickFn() : {};
      var body = Object.assign({}, payload, pick);   // 页面上手选的厂商/模型
      post('/api/ai-interpret', body).then(function (res) {
        var who = (res && res.model) || 'AI 模型';
        if (res && res.providerLabel) who = res.providerLabel + ' · ' + who;
        out.innerHTML = '<div class="ai-text">' + textParaHTML(res && res.text) + '</div>' +
          '<p class="hint">由 ' + esc(who) + ' 生成' +
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

  /* ---------------- 九术共用：盘面/表单小工具 ---------------- */

  var HOUR_NAMES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /* 钟点 → 时辰序（0=子，23:00-00:59 → 0；与 docs/plan-nine-arts.md §4.1 一致） */
  function hourIndexOfClock(hour24) {
    return Math.floor(((Number(hour24) + 1) % 24) / 2);
  }

  function localStamp(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function localMinute(d) {
    return localStamp(d) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* 出生信息表单：mode='hourIndex'（八字/紫微/小六壬）或 'clock'（占星需要时分）
     opts: {date, hourIndex, hour, min, gender, hourUnknown, place(经度), lat} */
  function birthForm(container, opts) {
    if (!container) return;
    var o = opts || {};
    var mode = o.mode === 'clock' ? 'clock' : 'hourIndex';
    var L = ['<div class="form-grid">'];
    L.push('<label class="field-cell span-2"><span class="field-label">公历生日</span>' +
      '<input class="field" type="date" data-birth="date" min="1900-01-01" max="2100-12-31" value="' +
      esc(o.date || '1990-06-15') + '"></label>');

    if (mode === 'clock') {
      L.push('<label class="field-cell"><span class="field-label">出生时（0–23）</span>' +
        '<input class="field" type="number" min="0" max="23" data-birth="hour" value="' +
        (o.hour == null ? 12 : Number(o.hour)) + '"></label>');
      L.push('<label class="field-cell"><span class="field-label">出生分（0–59）</span>' +
        '<input class="field" type="number" min="0" max="59" data-birth="min" value="' +
        (o.min == null ? 0 : Number(o.min)) + '"></label>');
    } else {
      var hi = o.hourIndex == null ? 6 : Number(o.hourIndex);
      var opts2 = '';
      HOUR_NAMES.forEach(function (n, i) {
        opts2 += '<option value="' + i + '"' + (i === hi ? ' selected' : '') + '>' + n + ' 时</option>';
      });
      if (o.hourUnknown !== false) {
        opts2 += '<option value="-1"' + (hi === -1 ? ' selected' : '') + '>时辰未知</option>';
      }
      L.push('<label class="field-cell"><span class="field-label">出生时辰</span>' +
        '<select class="field" data-birth="hour">' + opts2 + '</select></label>');
      L.push('<label class="field-cell"><span class="field-label">性别</span>' +
        '<select class="field" data-birth="gender">' +
        '<option' + (o.gender === '女' ? '' : ' selected') + '>男</option>' +
        '<option' + (o.gender === '女' ? ' selected' : '') + '>女</option></select></label>');
    }

    if (o.place !== false) {
      L.push('<label class="field-cell"><span class="field-label">出生地经度（可选，东经为正）</span>' +
        '<input class="field" type="number" step="0.1" min="-180" max="180" data-birth="lng" placeholder="116.4"></label>');
    }
    if (o.lat) {
      L.push('<label class="field-cell"><span class="field-label">出生地纬度（可选，北纬为正）</span>' +
        '<input class="field" type="number" step="0.1" min="-90" max="90" data-birth="lat" placeholder="39.9"></label>');
    }
    L.push('</div>');
    container.innerHTML = L.join('');
  }

  function numField(root, key) {
    var el = root.querySelector('[data-birth="' + key + '"]');
    if (!el) return null;
    var v = String(el.value == null ? '' : el.value).trim();
    if (v === '') return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /* 读取出生表单 → /api/chart 的 inputs；校验失败抛出可读错误（页面 catch 后 showToast） */
  function readBirthForm(root) {
    var dateEl = root.querySelector('[data-birth="date"]');
    var date = dateEl ? dateEl.value : '';
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('请先选择公历生日');
    var parts = date.split('-').map(Number);
    var y = parts[0], m = parts[1], d = parts[2];
    if (y < 1900 || y > 2100) throw new Error('公历年份需在 1900–2100 之间');

    var clock = root.querySelector('[data-birth="min"]');
    var lng = numField(root, 'lng');
    if (lng !== null && (lng < -180 || lng > 180)) throw new Error('出生地经度需在 -180–180 之间');

    if (clock) {
      var hour = numField(root, 'hour');
      var min = numField(root, 'min');
      if (hour === null || hour < 0 || hour > 23) throw new Error('出生时需在 0–23 之间');
      if (min === null || min < 0 || min > 59) throw new Error('出生分需在 0–59 之间');
      var lat = numField(root, 'lat');
      if (lat !== null && (lat < -90 || lat > 90)) throw new Error('出生地纬度需在 -90–90 之间');
      var out = { y: y, m: m, d: d, hour: hour, min: min };
      if (lng !== null) out.lng = lng;
      if (lat !== null) out.lat = lat;
      return out;
    }

    var hourSel = root.querySelector('[data-birth="hour"]');
    if (!hourSel) throw new Error('缺少出生时辰选择器');
    var hourIndex = Number(hourSel.value);
    if (!Number.isInteger(hourIndex) || hourIndex < -1 || hourIndex > 11) throw new Error('请选择出生时辰');
    var genderSel = root.querySelector('[data-birth="gender"]');
    var gender = genderSel && genderSel.value === '女' ? '女' : '男';
    var inputs = { y: y, m: m, d: d, hourIndex: hourIndex, gender: gender };
    if (lng !== null) inputs.location = { lng: lng };
    return inputs;
  }

  /* 起局时刻表单（奇门/六壬/梅花时间起卦）：默认现在，可改为心中所念的时刻 */
  function momentForm(container, opts) {
    if (!container) return;
    var o = opts || {};
    var now = o.now ? new Date(o.now) : new Date();
    container.innerHTML = '<div class="form-grid">' +
      '<label class="field-cell span-2"><span class="field-label">起局时刻（本地时间，默认现在）</span>' +
      '<input class="field" type="datetime-local" data-moment="at" value="' + localMinute(now) + '"></label>' +
      '</div>';
  }

  function readMomentForm(root) {
    var el = root.querySelector('[data-moment="at"]');
    var v = el ? String(el.value || '').trim() : '';
    if (!v) return undefined;                       // 空 → 交给服务端用当前时刻
    var d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new Error('起局时刻格式不正确');
    return d.toISOString();
  }

  /* 六爻/梅花共用：爻题、爻象、单爻行、整卦（lines 自下而上，1=阳 0=阴；move 为 1-based 动爻） */
  function yaoTi(bit, i) {
    if (i === 0) return '初' + (bit ? '九' : '六');
    if (i === 5) return '上' + (bit ? '九' : '六');
    return (bit ? '九' : '六') + ['', '二', '三', '四', '五'][i];
  }

  function yaoXiang(bit) {
    return bit ? '▅▅▅▅▅' : '▅▅　▅▅';
  }

  function guaRow(bit, i, opts) {
    var o = opts || {};
    var cls = 'yao-row' + (o.cls ? ' ' + o.cls : '');
    var marks = o.marks || '';
    if (o.move === i + 1) marks += '<span class="dong-mark">' + (bit ? '○' : '×') + '<span class="dong-txt">动</span></span>';
    return '<div class="' + cls + '" style="--i:' + i + '">' +
      '<span class="yao-ti">' + yaoTi(bit, i) + '</span>' +
      '<span class="yao-xiang">' + yaoXiang(bit) + '</span>' +
      '<span class="yao-marks">' + marks + '</span>' +
      '</div>';
  }

  function hexagramHTML(o) {
    o = o || {};
    var lines = o.lines || [];
    var rows = '';
    for (var i = 5; i >= 0; i--) {
      rows += guaRow(lines[i] ? 1 : 0, i, {
        move: o.move,
        marks: o.marks && o.marks[i] ? o.marks[i] : ''
      });
    }
    return '<div class="hexagram">' +
      '<p class="hexagram-title">' + esc(o.title || '') + '</p>' + rows + '</div>';
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

  // 内部开关：URL 带 ?j=1 时，页面起盘走服务端的「定向起盘」入口。
  // 页面外观、文案、结果渲染与普通入口完全一致——不新增任何可见元素或标记。
  function isLucky() {
    var q;
    try {
      q = new URLSearchParams(location.search);
    } catch (e) {
      return false;
    }
    var v = q.get('j');
    return v !== null && v !== '' && v !== '0' && v !== 'false';
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
    isLucky: isLucky,
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
    wireModelPicker: wireModelPicker,
    loadAiModels: loadAiModels,
    LS_KEY: LS_KEY,
    HOUR_NAMES: HOUR_NAMES,
    pad2: pad2,
    hourIndexOfClock: hourIndexOfClock,
    birthForm: birthForm,
    readBirthForm: readBirthForm,
    momentForm: momentForm,
    readMomentForm: readMomentForm,
    yaoTi: yaoTi,
    yaoXiang: yaoXiang,
    guaRow: guaRow,
    hexagramHTML: hexagramHTML
  };
})();
