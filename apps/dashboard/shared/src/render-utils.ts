(function (): void {
  function escapeHtml(s: unknown): string {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtCurrency(n: unknown): string {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '$0.00';
    const v = Number(n);
    if (v < 0.01) return '$' + v.toFixed(4);
    return '$' + v.toFixed(2);
  }

  function fmtMs(n: unknown): string {
    if (n === null || n === undefined) return '\u2014';
    return Math.round(Number(n)) + ' ms';
  }

  // SQLite's datetime('now') returns "YYYY-MM-DD HH:MM:SS" with no timezone
  // marker, but the value is UTC. Browsers parse that ambiguously (often as
  // local time), which would skip the UTC->local conversion. Add a T and Z
  // so new Date() parses it as UTC and toLocaleString converts to local.
  function parseTs(iso: unknown): Date | null {
    if (!iso) return null;
    let s = String(iso).trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) s = s.replace(' ', 'T') + 'Z';
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function fmtTimestamp(iso: unknown): string {
    const d = parseTs(iso);
    return d ? d.toLocaleString() : (iso ? String(iso) : '\u2014');
  }

  function fmtTime(iso: unknown): string {
    const d = parseTs(iso);
    return d ? d.toLocaleTimeString() : (iso ? String(iso) : '\u2014');
  }

  function decisionBadgeClass(decision: unknown): string {
    switch (String(decision || '').toUpperCase()) {
      case 'ALLOWED':
        return 'bg-green-100 text-green-800 border border-green-300';
      case 'MASKED':
        return 'bg-amber-100 text-amber-900 border border-amber-300';
      case 'BLOCKED':
        return 'bg-red-100 text-red-900 border border-red-300';
      default:
        return 'bg-surface-variant text-on-surface-variant border border-outline-variant';
    }
  }

  function budgetBadgeClass(status: unknown): string {
    switch (String(status || '').toUpperCase()) {
      case 'BUDGET_OK':
        return 'bg-green-100 text-green-800 border border-green-300';
      case 'BUDGET_WARNING':
        return 'bg-orange-100 text-orange-900 border border-orange-300';
      case 'BUDGET_EXCEEDED':
        return 'bg-red-100 text-red-900 border border-red-300';
      default:
        return 'bg-surface-variant text-on-surface-variant border border-outline-variant';
    }
  }

  function piiBadge(types: unknown): string {
    if (!Array.isArray(types) || types.length === 0) return '\u2014';
    return types
      .map(
        (t: string) =>
          '<span class="inline-block bg-surface-variant text-xs px-1.5 py-0.5 rounded mr-1 border border-outline-variant">' +
          escapeHtml(t) +
          '</span>'
      )
      .join('');
  }

  interface PiiPattern {
    name: string;
    re: RegExp;
  }

  const RAW_PII_PATTERNS: PiiPattern[] = [
    { name: 'EMAIL', re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i },
    { name: 'PHONE_INTL', re: /\+\d[\d\s\-().]{6,}\d/ },
    { name: 'SWEDISH_PNR', re: /\b(?:19|20)?\d{6}-\d{4}\b/ },
    { name: 'US_SSN', re: /\b\d{3}-\d{2}-\d{4}\b/ },
    { name: 'CREDIT_CARD', re: /\b(?:\d[ -]?){13,19}\b/ },
  ];

  function checkForRawPii(text: string | null | undefined, context?: string): string[] {
    if (!text) return [];
    const hits: string[] = [];
    for (const p of RAW_PII_PATTERNS) {
      if (p.re.test(text)) hits.push(p.name);
    }
    if (hits.length > 0) {
      console.warn(
        '[redaction-safety] Potential raw PII surfaced in',
        context || '(unknown context)',
        '\u2014 types:',
        hits.join(', ')
      );
    }
    return hits;
  }

  function renderError(targetEl: HTMLElement | null, err: unknown): void {
    if (!targetEl) return;
    const e = err as { status?: number; body?: { governance?: unknown }; message?: string };
    const status = e.status || 0;
    const body = e.body || null;
    const isGovernance = body && (body as Record<string, unknown>).governance;
    const message = e.message || String(err);
    targetEl.innerHTML =
      '<div class="bg-error-container text-on-error-container border border-error rounded-lg p-4">' +
      '<div class="font-h2 text-h2">' +
      escapeHtml(isGovernance ? 'Request blocked by governance' : 'Request failed') +
      '</div>' +
      '<p class="font-body-md text-body-md mt-2">' +
      escapeHtml(message) +
      '</p>' +
      (status
        ? '<p class="font-caption text-caption mt-1 text-on-surface-variant">HTTP ' +
          status +
          '</p>'
        : '') +
      (isGovernance
        ? '<pre class="bg-surface-container-low text-on-surface text-xs p-2 mt-2 rounded overflow-auto">' +
          escapeHtml(JSON.stringify((body as Record<string, unknown>).governance, null, 2)) +
          '</pre>'
        : '') +
      '</div>';
  }

  function setText(el: HTMLElement | null, value: unknown): void {
    if (!el) return;
    el.textContent = value === null || value === undefined || value === '' ? '\u2014' : String(value);
  }

  function governancePanelHtml(g: unknown): string {
    if (!g) return '<p class="text-on-surface-variant">No governance metadata.</p>';
    const gObj = g as Record<string, unknown>;
    const safe = (v: unknown): string =>
      v === null || v === undefined ? '\u2014' : String(v);
    const rows: [string, string][] = [
      [
        'Decision',
        '<span class="font-label-sm text-label-sm px-2 py-0.5 rounded ' +
          decisionBadgeClass(gObj.decision) +
          '">' +
          escapeHtml(safe(gObj.decision)) +
          '</span>',
      ],
      ['Policy', escapeHtml(safe(gObj.policy))],
      ['PII detected', gObj.piiDetected ? 'Yes' : 'No'],
      ['PII types', piiBadge(gObj.piiTypes)],
      ['PII action', escapeHtml(safe(gObj.piiAction))],
      ['Sensitive PII', gObj.sensitivePiiDetected ? 'Yes' : 'No'],
      ['Bulk PII request', gObj.bulkPiiRequest ? 'Yes' : 'No'],
      ['Block reason', escapeHtml(safe(gObj.blockReason))],
      ['Model', escapeHtml(safe(gObj.model))],
      ['Route reason', escapeHtml(safe(gObj.routeReason))],
      [
        'Budget',
        '<span class="font-label-sm text-label-sm px-2 py-0.5 rounded ' +
          budgetBadgeClass(gObj.budgetStatus) +
          '">' +
          escapeHtml(safe(gObj.budgetStatus)) +
          '</span>',
      ],
      ['Estimated cost', fmtCurrency(gObj.estimatedCostUsd)],
      ['Latency', fmtMs(gObj.latencyMs)],
      ['Audit logged', gObj.auditLogged ? 'Yes' : 'No'],
      [
        'Request ID',
        '<code class="text-xs">' + escapeHtml(safe(gObj.requestId)) + '</code>',
      ],
    ];
    return (
      '<dl class="grid grid-cols-1 gap-y-2">' +
      rows
        .map(
          (r) =>
            '<div class="flex justify-between items-start gap-2 border-b border-outline-variant pb-1">' +
            '<dt class="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">' +
            escapeHtml(r[0]) +
            '</dt>' +
            '<dd class="font-body-md text-body-md text-on-surface text-right break-all">' +
            r[1] +
            '</dd>' +
            '</div>'
        )
        .join('') +
      '</dl>'
    );
  }

  window.renderUtils = {
    escapeHtml,
    fmtCurrency,
    fmtMs,
    fmtTimestamp,
    fmtTime,
    decisionBadgeClass,
    budgetBadgeClass,
    piiBadge,
    checkForRawPii,
    renderError,
    setText,
    governancePanelHtml,
  };
})();
