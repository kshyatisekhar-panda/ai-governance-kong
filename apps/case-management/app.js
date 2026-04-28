(function () {
  // Kong gateway when running locally; production single-container hits same origin.
  const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(location.hostname);
  const GATEWAY = isLocal ? 'http://localhost:8000' : '';
  const API_KEY = 'case-key-2024';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  async function request(path, options) {
    options = options || {};
    const headers = Object.assign(
      { 'x-api-key': API_KEY },
      options.body ? { 'Content-Type': 'application/json' } : {},
      options.headers || {}
    );
    const res = await fetch(GATEWAY + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const err = new Error((data && (data.message || data.error)) || ('HTTP ' + res.status));
      err.status = res.status;
      err.data = data;
      err.kong = {
        latency: res.headers.get('x-kong-proxy-latency'),
        upstreamLatency: res.headers.get('x-kong-upstream-latency'),
        rateRemaining: res.headers.get('ratelimit-remaining'),
        rateLimit: res.headers.get('ratelimit-limit'),
      };
      throw err;
    }
    return {
      data: data,
      kong: {
        latency: res.headers.get('x-kong-proxy-latency'),
        upstreamLatency: res.headers.get('x-kong-upstream-latency'),
        rateRemaining: res.headers.get('ratelimit-remaining'),
        rateLimit: res.headers.get('ratelimit-limit'),
        via: res.headers.get('via'),
      },
    };
  }

  function decisionBadge(decision) {
    const d = String(decision || '').toLowerCase();
    if (d === 'blocked') return '<span class="badge blocked">Blocked</span>';
    if (d === 'masked') return '<span class="badge masked">Masked</span>';
    return '<span class="badge allowed">Allowed</span>';
  }

  function priorityBadge(priority) {
    const p = String(priority || 'Medium');
    return '<span class="badge priority-' + p.toLowerCase() + '">' + escapeHtml(p) + '</span>';
  }

  function governancePanel(g) {
    if (!g) return '';
    const items = [
      ['Decision', decisionBadge(g.decision)],
      ['Model', escapeHtml(g.model || '—')],
      ['Cost', '$' + Number(g.costUsd || 0).toFixed(5)],
      ['Latency', (g.latencyMs || 0) + ' ms'],
      ['Masked PII', g.maskedTypes && g.maskedTypes.length ? escapeHtml(g.maskedTypes.join(', ')) : '—'],
      ['Block reason', g.blockReason ? escapeHtml(g.blockReason) : '—'],
    ];
    return '<div class="gov-grid">' + items.map(function (kv) {
      return '<div class="gov-item"><div class="k">' + kv[0] + '</div><div class="v">' + kv[1] + '</div></div>';
    }).join('') + '</div>';
  }

  function buildSidebar(activeKey) {
    const items = [
      { key: 'home', label: 'Overview', href: 'index.html' },
      { key: 'create-case', label: 'Create Case', href: 'create-case.html' },
      { key: 'inbox', label: 'Case Inbox', href: 'inbox.html' },
    ];
    const links = items.map(function (it) {
      const cls = it.key === activeKey ? 'active' : '';
      return '<a class="' + cls + '" href="' + it.href + '">' + escapeHtml(it.label) + '</a>';
    }).join('');
    return [
      '<aside class="sidebar">',
        '<a class="back" href="/">&larr; Applications</a>',
        '<div class="brand">Case Management</div>',
        '<div class="brand-sub">Atlas Copco Service</div>',
        '<nav>', links, '</nav>',
        '<div class="footer" id="gw-status">Gateway: checking…</div>',
      '</aside>',
    ].join('');
  }

  async function checkHealth() {
    try {
      await request('/health');
      const el = document.getElementById('gw-status');
      if (el) el.innerHTML = 'Gateway: <span style="color:#047857;font-weight:600">online</span>';
    } catch (e) {
      const el = document.getElementById('gw-status');
      if (el) el.innerHTML = 'Gateway: <span style="color:#b91c1c;font-weight:600">offline</span>';
    }
  }

  function mountSidebar(activeKey) {
    const shell = document.getElementById('shell');
    if (!shell) return;
    shell.insertAdjacentHTML('afterbegin', buildSidebar(activeKey));
    checkHealth();
  }

  window.cm = {
    GATEWAY: GATEWAY,
    API_KEY: API_KEY,
    request: request,
    escapeHtml: escapeHtml,
    decisionBadge: decisionBadge,
    priorityBadge: priorityBadge,
    governancePanel: governancePanel,
    mountSidebar: mountSidebar,
  };
})();
