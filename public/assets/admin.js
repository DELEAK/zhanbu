/* =========================================================
   观微卜影 · 记录管理页（/admin.html）
   只读：列表（默认每页 30 条，分页）→ 点击行，右侧栏显示
   单条详情（盘面事实 / AI 解读 / 来源）→ CSV 导出。
   口令从输入框或 URL ?token= 读取，存 sessionStorage（关页即失效）。
   无动画：本页不参与性能模式切换，样式与 low 模式一致。
   ========================================================= */
(function () {
  'use strict';

  var TOKEN_KEY = 'divination.adminToken';
  var PER_PAGE = 30;
  var state = { token: '', offset: 0, artId: 'all', total: 0, currentId: null };

  function $(sel) { return document.querySelector(sel); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /** 时间统一按东八区显示（服务端存的是本地时区字符串，这里只做兜底格式化） */
  function fmtTime(v) {
    if (!v) return '';
    var s = String(v).replace('T', ' ');
    return s.length > 19 ? s.slice(0, 19) : s;
  }

  function artLabel(id) { return id === 'tarot' ? '塔罗' : id === 'liuyao' ? '六爻' : id; }

  function readToken() {
    var fromUrl = '';
    try { fromUrl = new URLSearchParams(location.search).get('token') || ''; } catch (e) { /* 忽略 */ }
    if (fromUrl) return fromUrl;
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function saveToken(t) {
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* 隐私模式忽略 */ }
  }

  function api(path) {
    return fetch(path, { headers: { 'x-admin-token': state.token, accept: 'application/json' } })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          if (!r.ok) {
            var err = new Error(body.message || ('请求失败（HTTP ' + r.status + '）'));
            err.code = body.error || 'HTTP_' + r.status;
            err.status = r.status;
            throw err;
          }
          return body;
        });
      });
  }

  function setMeta(text) { $('#meta').textContent = text; }

  var DETAIL_PLACEHOLDER = '<p class="rec-empty">点击左侧任意一条记录，在此查看盘面事实与 AI 解读。</p>';

  function showPlaceholder() {
    $('#detail').innerHTML = DETAIL_PLACEHOLDER;
    state.currentId = null;
  }

  /* ---------------- 分页 ---------------- */

  function renderPager() {
    var total = state.total;
    var pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
    var page = Math.floor(state.offset / PER_PAGE) + 1;
    var from = total ? state.offset + 1 : 0;
    var to = Math.min(state.offset + PER_PAGE, total);

    var html = '<span class="admin-meta">共 <b>' + total + '</b> 条 · 第 ' + page + '/' + pageCount +
      ' 页 · 本页显示 ' + from + '–' + to + '</span>' +
      '<span class="admin-actions">' +
        '<button class="btn btn-ghost" type="button" data-pg="first"' + (page <= 1 ? ' disabled' : '') + '>« 首页</button>' +
        '<button class="btn btn-ghost" type="button" data-pg="prev"' + (page <= 1 ? ' disabled' : '') + '>‹ 上一页</button>' +
        '<button class="btn btn-ghost" type="button" data-pg="next"' + (page >= pageCount ? ' disabled' : '') + '>下一页 ›</button>' +
        '<button class="btn btn-ghost" type="button" data-pg="last"' + (page >= pageCount ? ' disabled' : '') + '>末页 »</button>' +
      '</span>';
    $('#pager').innerHTML = html;
  }

  function gotoPage(page) {
    var pageCount = Math.max(1, Math.ceil(state.total / PER_PAGE));
    page = Math.min(Math.max(1, page), pageCount);
    state.offset = (page - 1) * PER_PAGE;
    loadList();
  }

  /* ---------------- 列表 ---------------- */

  function renderList(data) {
    state.total = data.total || 0;
    var rows = data.list || [];
    renderPager();
    if (!rows.length) {
      $('#list').innerHTML = '<p class="rec-empty">暂无记录。</p>';
      return;
    }
    var html = '<table class="rec-table"><thead><tr>' +
      '<th>时间</th><th>术数</th><th>问题</th><th>盘面摘要</th><th>解读</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr class="rec-row' + (r.id === state.currentId ? ' is-active' : '') +
        '" data-id="' + esc(r.id) + '">' +
        '<td class="mono">' + esc(fmtTime(r.createdAt)) + '</td>' +
        '<td>' + esc(artLabel(r.artId)) + '</td>' +
        '<td class="q">' + (r.question ? esc(r.question) : '<span class="rec-empty">（未填写）</span>') + '</td>' +
        '<td>' + esc(r.summary || '') + '</td>' +
        '<td>' + (r.hasReport ? '已解读' : '<span class="rec-empty">未解读</span>') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    $('#list').innerHTML = html;
  }

  function loadList() {
    if (!state.token) { setMeta('请先输入管理口令（服务端 DIVINATION_ADMIN_TOKEN）。'); return; }
    saveToken(state.token);
    setMeta('读取中…');
    var q = '/api/admin/records?limit=' + PER_PAGE + '&offset=' + state.offset +
      '&artId=' + encodeURIComponent(state.artId);
    api(q).then(function (data) {
      renderList(data);
      // 换页后原来那条可能不在本页了，右侧保留已载入的详情（不清空），
      // 但把它标成「当前选中」的行高亮；本页没有该行时不高亮即可。
      setMeta('点击左侧任意一行，解读与盘面事实显示在右侧。');
    }).catch(function (e) {
      $('#list').innerHTML = '<p class="rec-empty">' + esc(e.message) + '</p>';
      setMeta(e.code === 'ADMIN_NOT_CONFIGURED' ? '服务端未配置 DIVINATION_ADMIN_TOKEN，接口未启用。' : '读取失败：' + e.message);
    });
  }

  /* ---------------- 详情（右侧栏） ---------------- */

  function renderDetail(rec) {
    state.currentId = rec.id;
    var raw = rec.resultRaw || {};
    var report = rec.report || null;
    var spread = (raw.spread && raw.spread.name) || '';
    var head = '<div class="rec-detail">' +
      '<p class="admin-meta">' + esc(fmtTime(rec.createdAt)) + ' · ' + esc(artLabel(rec.artId)) +
        ' · <span class="mono">' + esc(rec.id) + '</span></p>' +
      '<p><b>所问</b>：' + (rec.question ? esc(rec.question) : '（未填写）') + '</p>' +
      (spread ? '<p><b>牌阵</b>：' + esc(spread) + '</p>' : '') +
      '<p class="admin-meta">来源：' + esc((rec.access && rec.access.ip) || '未记录') +
        (rec.access && rec.access.ua ? '<br>UA：' + esc(rec.access.ua) : '') + '</p>';

    // 盘面事实（由存档盘面实时算出，老记录也有）
    if (rec.facts) {
      head += '<h3 class="sec-title">盘面事实</h3><pre>' + esc(rec.facts) + '</pre>';
    }
    if (rec.duanyu) {
      head += '<details class="deep-sec"><summary>古籍引证（vendor 断语库）</summary><pre>' + esc(rec.duanyu) + '</pre></details>';
    }

    // AI 解读：有就显示，没有就现场补生成（写入该记录的 report_json）
    head += '<h3 class="sec-title">AI 解读</h3>';
    if (report && report.fullText) {
      head += '<p class="admin-meta">模型：' + esc(report.model || 'AI 模型') +
        (report.source === 'admin-backfill' ? '（记录补生成）' : '') + '</p><pre>' + esc(String(report.fullText).replace(/\*\*/g, '')) + '</pre>';
    } else {
      head += '<p class="admin-meta">这条记录当时没有存下 AI 解读全文（六爻的 AI 输出原本就不落库）。' +
        '可点下面的按钮，用存档盘面补生成一份并保存到该记录（会消耗 AI 额度，约 10-30 秒）。</p>' +
        '<div class="ai-model-picker" id="genAiModels"></div>' +
        '<div class="admin-actions"><button class="btn btn-ai" id="genAi" type="button">生成 AI 解读并保存</button></div>' +
        '<div class="ai-out" id="genOut" hidden></div>';
    }

    head += '<h3 class="sec-title">盘面原始数据</h3><pre>' + esc(JSON.stringify({ params: rec.params, resultRaw: raw }, null, 2)) + '</pre>';
    head += '<div class="admin-actions" style="margin-top:12px"><button class="btn btn-ghost" id="closeDetail" type="button">清空详情</button></div></div>';
    $('#detail').innerHTML = head;
    $('#closeDetail').addEventListener('click', function () { showPlaceholder(); renderListOnlyActive(); });

    var gen = $('#genAi');
    if (gen) {
      var pickFn = window.DS && DS.wireModelPicker ? DS.wireModelPicker($('#detail')) : null;
      gen.addEventListener('click', function () {
        gen.disabled = true;
        gen.textContent = '生成中…';
        var out = $('#genOut');
        out.hidden = false;
        out.innerHTML = '<p class="hint">正在调用 AI 模型生成解读…</p>';
        var pick = pickFn ? pickFn() : {};
        fetch('/api/admin/records/' + encodeURIComponent(rec.id) + '/interpret', {
          method: 'POST',
          headers: { 'x-admin-token': state.token, 'content-type': 'application/json' },
          body: JSON.stringify(pick)
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (b) {
            if (!r.ok) { var e = new Error(b.message || ('HTTP ' + r.status)); e.code = b.error; throw e; }
            return b;
          });
        }).then(function (b) {
          // 模型偶尔带 ** 强调标记，纯文本展示去掉它（保留内容，不引入 Markdown 渲染）
          var plain = String(b.text || '').replace(/\*\*/g, '');
          out.innerHTML = '<div class="ai-text">' + esc(plain).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</div>' +
            '<p class="hint">已保存到该记录（模型 ' + esc(b.model || 'AI 模型') + '）。</p>';
          setMeta('解读已保存。');
          loadList();
        }).catch(function (e) {
          out.innerHTML = '<p class="hint">生成失败：' + esc(e.message) + '</p>';
          gen.disabled = false;
          gen.textContent = '重新生成 AI 解读';
        });
      });
    }
  }

  /** 只刷新列表里的行高亮，不重新拉接口 */
  function renderListOnlyActive() {
    var rows = document.querySelectorAll('#list .rec-row');
    Array.prototype.forEach.call(rows, function (tr) {
      tr.classList.toggle('is-active', tr.getAttribute('data-id') === state.currentId);
    });
  }

  function loadDetail(id) {
    if (!id) return;
    if (id === state.currentId) return; // 已经在右侧显示
    setMeta('读取详情…');
    api('/api/admin/records/' + encodeURIComponent(id)).then(function (rec) {
      renderDetail(rec);
      renderListOnlyActive();
      setMeta('已载入 1 条详情（右侧）。');
    }).catch(function (e) {
      $('#detail').innerHTML = '<p class="rec-empty">' + esc(e.message) + '</p>';
      setMeta('详情读取失败：' + e.message);
    });
  }

  /* ---------------- 导出 ---------------- */

  function exportCsv() {
    if (!state.token) { setMeta('请先输入管理口令。'); return; }
    var url = '/api/admin/export.csv?token=' + encodeURIComponent(state.token) +
      '&artId=' + encodeURIComponent(state.artId);
    window.location.href = url;
  }

  /* ---------------- 事件 ---------------- */

  function init() {
    state.token = readToken();
    $('#token').value = state.token;
    if (state.token) loadList();

    $('#loadBtn').addEventListener('click', function () {
      state.token = $('#token').value.trim();
      state.offset = 0;
      loadList();
    });
    $('#token').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('#loadBtn').click();
    });
    $('#art').addEventListener('change', function () {
      state.artId = $('#art').value;
      state.offset = 0;
      if (state.token) loadList();
    });
    $('#exportBtn').addEventListener('click', exportCsv);

    // 分页（事件委托：按钮是每次重绘的）
    $('#pager').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button[data-pg]') : null;
      if (!btn || btn.disabled) return;
      var page = Math.floor(state.offset / PER_PAGE) + 1;
      var kind = btn.getAttribute('data-pg');
      var pageCount = Math.max(1, Math.ceil(state.total / PER_PAGE));
      if (kind === 'first') gotoPage(1);
      else if (kind === 'prev') gotoPage(page - 1);
      else if (kind === 'next') gotoPage(page + 1);
      else if (kind === 'last') gotoPage(pageCount);
    });

    // 点行 → 右侧详情
    $('#list').addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('.rec-row') : null;
      if (row) loadDetail(row.getAttribute('data-id'));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
