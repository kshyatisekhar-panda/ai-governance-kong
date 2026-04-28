(function (): void {
  const PAGES: Record<string, string> = {
    overview: 'executive-overview/',
    'prompt-shield-soc': 'prompt-shield-soc/',
    'kong-backend-terminal': 'kong-backend-terminal/',
    'governance-audit': 'governance-audit-dashboard/',
    'app-policies': 'app-policies/',
    'product-data': 'product-service-data-explorer/',
    'gateway-flow': 'gateway-flow-architecture/',
    'team-comparison': 'team-comparison/',
  };

  function linkTo(key: string, params?: Record<string, string>): string {
    const target = PAGES[key];
    if (!target) return '#';
    let href = '../' + target;
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
    'prompt shield soc': 'prompt-shield-soc',
    'kong backend terminal': 'kong-backend-terminal',
    'governance audit': 'governance-audit',
    'app policies': 'app-policies',
    'product data': 'product-data',
    'gateway flow': 'gateway-flow',
    'gateway flow architecture': 'gateway-flow',
    'team comparison': 'team-comparison',
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

      if (['customer chat', 'create case', 'case inbox', 'case detail'].includes(label)) {
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

  (window as any).appNav = { PAGES, linkTo, bindSideNav };
})();
