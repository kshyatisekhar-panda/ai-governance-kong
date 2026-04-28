(function (): void {
  interface NavItem {
    key: string;
    label: string;
    icon: string;
  }

  const NAV_ITEMS: NavItem[] = [
    { key: 'overview', label: 'Overview', icon: 'dashboard' },
    { key: 'governance-audit', label: 'Governance Audit', icon: 'gavel' },
    { key: 'app-policies', label: 'App Policies', icon: 'policy' },
    { key: 'product-data', label: 'Product Data', icon: 'inventory_2' },
    { key: 'gateway-flow', label: 'Gateway Flow', icon: 'account_tree' },
  ];

  function init(): void {
    const info = window.PAGE_INFO || { key: '', title: '' };
    const currentKey = info.key || '';
    const pageTitle = info.title || 'AI-Governed Customer Service Hub';
    const pageSubtitle = info.subtitle || '';

    let sidebar: HTMLElement | null = null;
    document.querySelectorAll('nav').forEach((n) => {
      const links = n.querySelectorAll('a').length;
      if (links >= 4 && (!sidebar || links > sidebar.querySelectorAll('a').length)) {
        sidebar = n;
      }
    });
    if (sidebar) (sidebar as HTMLElement).setAttribute('data-app-strip', 'old-sidebar');

    const header =
      document.querySelector('body > header') ||
      document.querySelector('body header') ||
      (() => {
        const headers = Array.from(document.querySelectorAll('header'));
        return headers.find((h) => !h.closest('aside') && !h.closest('section')) || null;
      })();
    if (header) header.setAttribute('data-app-strip', 'old-topbar');

    const mainEl =
      document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      (() => {
        const candidates = Array.from(document.body.children) as HTMLElement[];
        return (
          candidates.find(
            (el) =>
              el.tagName !== 'NAV' &&
              el.tagName !== 'HEADER' &&
              !el.matches('script,style,link,meta')
          ) || null
        );
      })();
    if (!mainEl) {
      console.warn('[layout] could not find main element; chrome not injected.');
      return;
    }

    mainEl.classList.add('app-page-content');

    const sidebarEl = document.createElement('aside');
    sidebarEl.className = 'app-sidebar';
    sidebarEl.innerHTML = `
      <div class="app-sidebar__brand">
        <div class="app-sidebar__brand-icon">
          <span class="material-symbols-outlined">precision_manufacturing</span>
        </div>
        <div>
          <div class="app-sidebar__brand-name">CRM Service Governance</div>
          <div class="app-sidebar__brand-sub">AI-Governed Hub</div>
        </div>
      </div>
      <nav class="app-sidebar__nav" aria-label="Main navigation">
        ${NAV_ITEMS.map(
          (item) => `
          <a class="app-sidebar__link" data-key="${item.key}" href="${window.navigation.linkTo(item.key)}"${item.key === currentKey ? ' aria-current="page"' : ''}>
            <span class="material-symbols-outlined">${item.icon}</span>
            <span>${item.label}</span>
          </a>
        `
        ).join('')}
      </nav>
      <div class="app-sidebar__footer" id="app-sidebar-status">
        <span class="app-sidebar__status-dot" id="app-status-dot"></span>
        <span id="app-status-text">Gateway: checking\u2026</span>
      </div>
    `;

    const topbar = document.createElement('header');
    topbar.className = 'app-topbar';
    topbar.innerHTML = `
      <div class="flex items-center min-w-0">
        <span class="app-topbar__title">${escapeStr(pageTitle)}</span>
        ${pageSubtitle ? `<span class="app-topbar__sub">${escapeStr(pageSubtitle)}</span>` : ''}
      </div>
      <div class="app-topbar__pill" id="app-status-pill" title="Gateway status">
        <span class="dot"></span>
        <span id="app-status-pill-text">Gateway</span>
      </div>
    `;

    const shell = document.createElement('div');
    shell.className = 'app-shell';

    const mainColumn = document.createElement('div');
    mainColumn.className = 'app-main';

    const pageWrap = document.createElement('div');
    pageWrap.className = 'app-page';

    ['ml-64', 'md:ml-64', 'ml-margin', 'md:ml-margin', 'fixed', 'h-screen', 'overflow-hidden'].forEach((c) =>
      mainEl.classList.remove(c)
    );
    (mainEl as HTMLElement).style.marginLeft = '';

    pageWrap.appendChild(mainEl);
    mainColumn.appendChild(topbar);
    mainColumn.appendChild(pageWrap);
    shell.appendChild(sidebarEl);
    shell.appendChild(mainColumn);

    Array.from(document.body.children).forEach((node) => {
      if (node === shell) return;
      if (['SCRIPT', 'STYLE', 'LINK', 'META'].includes(node.tagName)) return;
      (node as HTMLElement).setAttribute('data-app-strip', 'orphan');
    });

    document.body.appendChild(shell);

    [
      'flex',
      'flex-col',
      'flex-row',
      'md:flex-row',
      'md:flex-col',
      'overflow-hidden',
      'overflow-y-hidden',
      'overflow-x-hidden',
      'min-h-screen',
      'h-screen',
      'h-full',
      'antialiased',
    ].forEach((c) => document.body.classList.remove(c));
    document.body.style.margin = '0';
    document.body.style.height = 'auto';
    document.body.style.overflow = 'auto';

    if (window.api && window.api.getHealth) {
      window.api
        .getHealth()
        .then(() => updateStatus(true))
        .catch(() => updateStatus(false));
    }

    stripDeadControls(mainEl as HTMLElement);
  }

  const DEAD_BUTTON_LABELS = [
    'export',
    'export data',
    'download',
    'advanced filters',
    'more filters',
    'filter',
    'sort',
    'columns',
  ];

  function stripDeadControls(root: HTMLElement): void {
    root.querySelectorAll('button, a').forEach((el) => {
      const label = visibleText(el as HTMLElement);
      if (DEAD_BUTTON_LABELS.includes(label)) el.remove();
    });

    root.querySelectorAll('input[placeholder]').forEach((el) => {
      if ((el as HTMLElement).id) return;
      const ph = ((el as HTMLInputElement).getAttribute('placeholder') || '').toLowerCase();
      if (/^search\b/.test(ph)) {
        const wrapper = el.closest('div');
        if (wrapper) wrapper.remove();
      }
    });
  }

  function visibleText(el: HTMLElement): string {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[class*="material-symbols"]').forEach((n) => n.remove());
    return (clone.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function updateStatus(online: boolean): void {
    const dot = document.getElementById('app-status-dot');
    const text = document.getElementById('app-status-text');
    const pill = document.getElementById('app-status-pill');
    const pillText = document.getElementById('app-status-pill-text');
    const cls = online ? 'is-online' : 'is-offline';
    if (dot) {
      dot.classList.remove('is-online', 'is-offline');
      dot.classList.add(cls);
    }
    if (pill) {
      pill.classList.remove('is-online', 'is-offline');
      pill.classList.add(cls);
    }
    if (text) text.textContent = online ? 'Gateway: Online' : 'Gateway: Offline';
    if (pillText) pillText.textContent = online ? 'Gateway online' : 'Gateway offline';
  }

  function escapeStr(s: unknown): string {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
