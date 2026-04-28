(function (): void {
  const PAGES: Record<string, string> = {
    home: '/',
    overview: '/dashboard/executive-overview/',
    'governance-audit': '/dashboard/governance-audit-dashboard/',
    'app-policies': '/dashboard/app-policies/',
    'product-data': '/dashboard/product-service-data-explorer/',
    'gateway-flow': '/dashboard/gateway-flow-architecture/',
    chat: '/chat/',
    'sales-explorer': '/product-explorer/',
  };

  function linkTo(key: string, params?: Record<string, string>): string {
    const target = PAGES[key];
    if (!target) return '#';
    let href = target;
    if (params && typeof params === 'object') {
      const p = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') p.append(k, String(v));
      });
      const qs = p.toString();
      if (qs) href += '?' + qs;
    }
    return href;
  }

  const LABEL_TO_KEY: Record<string, string | null> = {
    overview: 'overview',
    home: 'home',
    'governance audit': 'governance-audit',
    'app policies': 'app-policies',
    'product data': 'product-data',
    'gateway flow': 'gateway-flow',
    'gateway flow architecture': 'gateway-flow',
    chat: 'chat',
    'ai assistant': 'chat',
    'sales explorer': 'sales-explorer',
    settings: 'app-policies',
    support: null,
  };

  function visibleLabel(a: HTMLElement): string {
    const clone = a.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[class*="material-symbols"]').forEach((n) => n.remove());
    return (clone.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function bindSideNav(currentKey: string): void {
    const links = document.querySelectorAll('nav a') as NodeListOf<HTMLAnchorElement>;
    const toRemove: HTMLAnchorElement[] = [];

    links.forEach((a) => {
      const label = visibleLabel(a);
      const key = LABEL_TO_KEY[label];

      if (['customer chat', 'create case', 'case inbox', 'case detail', 'monitor', 'data grid'].includes(label)) {
        toRemove.push(a);
        return;
      }

      if (key) {
        a.setAttribute('href', linkTo(key));
        if (key === currentKey) {
          a.classList.add('bg-secondary-container', 'text-on-secondary-container');
          a.classList.remove('hover:bg-surface-variant', 'text-on-surface');
        }
      } else if (a.getAttribute('href') === '#') {
        a.setAttribute('href', '#');
        a.style.opacity = '0.6';
      }
    });

    toRemove.forEach((a) => a.remove());
  }

  window.navigation = { PAGES, linkTo, bindSideNav };
})();
