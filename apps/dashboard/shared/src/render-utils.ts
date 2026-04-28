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

  function fmtTimestamp(iso: unknown): string {
    if (!iso) return '\u2014';
    try {
      const d = new Date(iso as string);
      return d.toLocaleString();
    } catch {
      return String(iso);
    }
  }

  function fmtTime(iso: unknown): string {
    if (!iso) return '\u2014';
    try {
      const d = new Date(iso as string);
      return d.toLocaleTimeString();
    } catch {
      return String(iso);
    }
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

  // ------------------------------------------------------------------
  // Layer-evidence helpers. Three honesty levels:
  //   "observed"   = confirmed from a header / response field / log entry
  //   "configured" = read from kong.yml / app config (we know it should run)
  //   "unknown"    = not visible to the app
  // ------------------------------------------------------------------
  type Honesty = 'observed' | 'configured' | 'unknown';

  function honestyBadge(level: Honesty): string {
    const map: Record<Honesty, string> = {
      observed: 'bg-green-100 text-green-800 border border-green-300',
      configured: 'bg-blue-100 text-blue-800 border border-blue-300',
      unknown: 'bg-gray-100 text-gray-700 border border-gray-300',
    };
    return (
      '<span class="inline-block text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ' +
      map[level] +
      '">' +
      level +
      '</span>'
    );
  }

  function lifecycleSection(title: string, icon: string, body: string): string {
    return (
      '<section class="border border-outline-variant rounded-lg overflow-hidden">' +
      '<header class="bg-surface-container-low px-3 py-2 border-b border-outline-variant flex items-center gap-2">' +
      '<span class="material-symbols-outlined text-[18px] text-on-surface-variant">' +
      escapeHtml(icon) +
      '</span>' +
      '<h4 class="font-h2 text-h2 text-on-surface text-[14px] m-0">' +
      escapeHtml(title) +
      '</h4>' +
      '</header>' +
      '<div class="p-3 text-[12px]">' +
      body +
      '</div>' +
      '</section>'
    );
  }

  function kvRow(label: string, value: string, badge?: Honesty): string {
    return (
      '<div class="flex justify-between items-start gap-2 py-1 border-b last:border-b-0 border-outline-variant/40">' +
      '<dt class="text-on-surface-variant">' +
      escapeHtml(label) +
      (badge ? ' ' + honestyBadge(badge) : '') +
      '</dt>' +
      '<dd class="text-on-surface text-right break-all">' +
      value +
      '</dd>' +
      '</div>'
    );
  }

  interface LifecyclePanelInput {
    log: Record<string, unknown>;
    lifecycle?: Record<string, unknown>;
  }

  function lifecyclePanelHtml(input: LifecyclePanelInput): string {
    const log = input.log || {};
    const lc = (input.lifecycle || (log.lifecycle as Record<string, unknown>) || {}) as Record<
      string,
      unknown
    >;
    const decision = String(log.decision || '').toUpperCase();
    const blocked = decision === 'BLOCKED';
    const llmCalled = Boolean(lc.llmCalled !== undefined ? lc.llmCalled : !blocked);
    const decisionLayer = String(lc.decisionLayer || (blocked ? 'express' : 'llm'));
    const kongRoute = String(lc.kongRoute || log.endpoint || '/ai/chat');
    const kongProcessed = String(lc.kongProcessed || 'unknown') as Honesty;
    const llmPathMode = String(lc.llmPathMode || 'direct-provider');
    const dataSource = lc.dataSource ? String(lc.dataSource) : null;
    const policy = String(lc.policyApplied || log.policy || '');
    const piiTypes: string[] = Array.isArray(lc.piiMaskedTypes)
      ? (lc.piiMaskedTypes as string[])
      : Array.isArray(log.piiTypes)
      ? (log.piiTypes as string[])
      : [];
    const expectedPlugins: string[] = Array.isArray(lc.kongPluginsExpected)
      ? (lc.kongPluginsExpected as string[])
      : [];

    const callOutClass = llmCalled
      ? 'bg-green-50 border border-green-300 text-green-900'
      : 'bg-red-50 border border-red-300 text-red-900';
    const callOutText = llmCalled
      ? 'LLM was called after Kong and app governance checks.'
      : 'LLM was NOT called. The request was blocked before reaching the model.';

    // 1. Ingress: Kong
    const kongBody =
      '<dl class="grid grid-cols-1 gap-y-0">' +
      kvRow('Kong route', '<code>' + escapeHtml(kongRoute) + '</code>', 'configured') +
      kvRow(
        'Processed by Kong',
        kongProcessed === 'observed'
          ? '<span class="font-bold text-green-700">Yes</span>'
          : '<span class="text-on-surface-variant">unknown to app</span>',
        kongProcessed === 'observed' ? 'observed' : 'unknown'
      ) +
      kvRow(
        'Kong consumer',
        log.team ? escapeHtml(String(log.team)) : '<span class="text-on-surface-variant">unknown</span>',
        'configured'
      ) +
      kvRow(
        'Plugins expected on this route',
        expectedPlugins.length
          ? expectedPlugins
              .map(
                (p) =>
                  '<span class="inline-block bg-surface-variant px-1.5 py-0.5 rounded mr-1 mb-1 text-[11px]">' +
                  escapeHtml(p) +
                  '</span>'
              )
              .join('')
          : '<span class="text-on-surface-variant">—</span>',
        'configured'
      ) +
      '</dl>' +
      (decisionLayer === 'kong'
        ? '<p class="mt-2 text-[11px] text-error">Kong rejected this request before it reached the app.</p>'
        : '');

    // 2. App Governance: Express
    const expressBody =
      '<dl class="grid grid-cols-1 gap-y-0">' +
      kvRow('Express route', '<code>' + escapeHtml(String(log.endpoint || '/ai/chat')) + '</code>', 'observed') +
      kvRow('App', escapeHtml(String(log.sourceApp || '')), 'observed') +
      kvRow('Policy applied', escapeHtml(policy || '—'), 'observed') +
      kvRow(
        'PII action',
        decision === 'MASKED'
          ? '<span class="font-bold text-amber-700">MASK</span>'
          : decision === 'BLOCKED'
          ? '<span class="font-bold text-red-700">BLOCK</span>'
          : 'NONE',
        'observed'
      ) +
      kvRow(
        'PII types',
        piiTypes.length
          ? piiTypes
              .map(
                (t) =>
                  '<span class="inline-block bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded mr-1 text-[11px]">' +
                  escapeHtml(t) +
                  '</span>'
              )
              .join('')
          : '—',
        'observed'
      ) +
      kvRow('Block reason', escapeHtml(String(log.blockReason || '—')), 'observed') +
      kvRow(
        'Business data injected',
        dataSource ? 'Yes — <code>' + escapeHtml(dataSource) + '</code>' : 'No',
        'observed'
      ) +
      '</dl>' +
      (decisionLayer === 'express'
        ? '<p class="mt-2 text-[11px] text-error">App governance blocked this request before the LLM was called.</p>'
        : '');

    // 3. LLM
    const llmBody =
      '<dl class="grid grid-cols-1 gap-y-0">' +
      kvRow(
        'LLM called',
        llmCalled
          ? '<span class="font-bold text-green-700">Yes</span>'
          : '<span class="font-bold text-red-700">No</span>',
        'observed'
      ) +
      kvRow('LLM path mode', '<code>' + escapeHtml(llmPathMode) + '</code>', 'configured') +
      kvRow('Selected model', log.model ? escapeHtml(String(log.model)) : '—', 'observed') +
      kvRow(
        'Tokens (in / out)',
        (log.inputTokens !== undefined ? String(log.inputTokens) : '—') +
          ' / ' +
          (log.outputTokens !== undefined ? String(log.outputTokens) : '—'),
        'observed'
      ) +
      kvRow(
        'Cost',
        fmtCurrency(log.cost ?? log.estimatedCostUsd ?? 0),
        'observed'
      ) +
      '</dl>' +
      (!llmCalled
        ? '<p class="mt-2 text-[11px] text-on-surface-variant">No tokens were sent to the provider.</p>'
        : '');

    // 4. Audit
    const auditBody =
      '<dl class="grid grid-cols-1 gap-y-0">' +
      kvRow('Persisted in SQLite', 'Yes — <code>request_logs</code>', 'observed') +
      kvRow('Decision layer', '<code>' + escapeHtml(decisionLayer) + '</code>', 'observed') +
      kvRow('Latency', fmtMs(log.latencyMs), 'observed') +
      kvRow('Status', escapeHtml(decision), 'observed') +
      kvRow('Timestamp', escapeHtml(fmtTimestamp(log.timestamp)), 'observed') +
      '</dl>';

    return (
      '<div class="space-y-4">' +
      '<div class="' +
      callOutClass +
      ' rounded-lg p-3 text-[13px] font-medium flex items-start gap-2">' +
      '<span class="material-symbols-outlined text-[18px]">' +
      (llmCalled ? 'check_circle' : 'block') +
      '</span>' +
      '<span>' +
      escapeHtml(callOutText) +
      '</span>' +
      '</div>' +
      '<div class="grid gap-3 md:grid-cols-2">' +
      lifecycleSection('1. Ingress: Kong layer', 'shield', kongBody) +
      lifecycleSection('2. App governance: Express', 'gavel', expressBody) +
      lifecycleSection('3. LLM provider', 'smart_toy', llmBody) +
      lifecycleSection('4. Audit layer (SQLite)', 'history_edu', auditBody) +
      '</div>' +
      '</div>'
    );
  }

  // ------------------------------------------------------------------
  // Backend Governance Trace (developer view).
  // 8-step timeline. Each step has a badge.
  // Never renders raw PII, raw API keys, prompts, or provider secrets.
  // ------------------------------------------------------------------
  type TraceBadge =
    | 'PASSED'
    | 'BLOCKED'
    | 'MASKED'
    | 'NOT CALLED'
    | 'LOGGED'
    | 'UNKNOWN'
    | 'CONFIGURED';

  function traceBadge(label: TraceBadge): string {
    const cls =
      label === 'PASSED' ? 'trace-badge--passed' :
      label === 'BLOCKED' ? 'trace-badge--blocked' :
      label === 'MASKED' ? 'trace-badge--masked' :
      label === 'NOT CALLED' ? 'trace-badge--notcalled' :
      label === 'LOGGED' ? 'trace-badge--logged' :
      label === 'CONFIGURED' ? 'trace-badge--configured' :
      'trace-badge--unknown';
    return '<span class="trace-badge ' + cls + '">' + escapeHtml(label) + '</span>';
  }

  function step(
    n: number,
    title: string,
    body: string,
    badge: TraceBadge,
    tone: 'passed' | 'blocked' | 'masked' | 'unknown'
  ): string {
    return (
      '<li class="trace-step trace-step--' + tone + '">' +
      '<div class="trace-step__dot">' + n + '</div>' +
      '<div class="trace-step__head">' + escapeHtml(title) + ' ' + traceBadge(badge) + '</div>' +
      '<div class="trace-step__body">' + body + '</div>' +
      '</li>'
    );
  }

  function traceTimelineHtml(input: {
    log: Record<string, unknown>;
    lifecycle?: Record<string, unknown>;
  }): string {
    const log = input.log || {};
    const lc = (input.lifecycle || (log.lifecycle as Record<string, unknown>) || {}) as Record<
      string,
      unknown
    >;
    const decision = String(log.decision || '').toUpperCase();
    const blocked = decision === 'BLOCKED';
    const masked = decision === 'MASKED';
    const llmCalled = Boolean(lc.llmCalled !== undefined ? lc.llmCalled : !blocked);
    const decisionLayer = String(lc.decisionLayer || (blocked ? 'express' : 'llm'));
    const blockReason = String(log.blockReason || '');
    const piiTypes: string[] = Array.isArray(lc.piiMaskedTypes)
      ? (lc.piiMaskedTypes as string[])
      : Array.isArray(log.piiTypes)
      ? (log.piiTypes as string[])
      : [];
    const kongRoute = String(lc.kongRoute || log.endpoint || '/ai/chat');
    const kongProcessed = String(lc.kongProcessed || 'unknown');
    const expectedPlugins: string[] = Array.isArray(lc.kongPluginsExpected)
      ? (lc.kongPluginsExpected as string[])
      : [];
    const llmPathMode = String(lc.llmPathMode || 'direct-provider');
    const dataSource = lc.dataSource ? String(lc.dataSource) : null;
    const policyApplied = String(lc.policyApplied || log.policy || '');
    const provider = llmPathMode === 'mock' ? 'mock' : 'OpenRouter';
    const requestId = String(log.requestId || '—');

    const steps: string[] = [];

    steps.push(
      step(
        1,
        'Request received',
        `<code>${escapeHtml(String((log.method as string) || 'POST'))} ${escapeHtml(kongRoute)}</code> · requestId <code>${escapeHtml(requestId)}</code> · <span>${escapeHtml(fmtTimestamp(log.timestamp))}</span>`,
        'LOGGED',
        'passed'
      )
    );

    steps.push(
      step(
        2,
        'Auth context resolved',
        `Team <strong>${escapeHtml(String(log.team || '—'))}</strong> · App <strong>${escapeHtml(String(log.sourceApp || '—'))}</strong> · API key label only (raw key never rendered)`,
        'PASSED',
        'passed'
      )
    );

    const kongDetail =
      `Processed by Kong: <strong>${escapeHtml(kongProcessed)}</strong>. Route <code>${escapeHtml(kongRoute)}</code>.<br/>` +
      `Expected plugins: ${
        expectedPlugins.length
          ? expectedPlugins.map((p) => '<code>' + escapeHtml(p) + '</code>').join(', ')
          : '—'
      }`;
    steps.push(
      step(
        3,
        'Kong layer evidence',
        kongDetail,
        kongProcessed === 'observed' ? 'PASSED' : 'CONFIGURED',
        kongProcessed === 'observed' ? 'passed' : 'unknown'
      )
    );

    const piiAction =
      decision === 'MASKED' ? 'MASKED' :
      decision === 'BLOCKED' && decisionLayer === 'express' ? 'BLOCKED' :
      'PASSED';
    const piiTone =
      piiAction === 'BLOCKED' ? 'blocked' : piiAction === 'MASKED' ? 'masked' : 'passed';
    const piiBody =
      `Policy <code>${escapeHtml(policyApplied || '—')}</code>. ` +
      (piiAction === 'BLOCKED'
        ? `Sensitive PII detected — block reason: <code>${escapeHtml(blockReason || '—')}</code>.`
        : piiAction === 'MASKED'
        ? `PII masked: ${
            piiTypes.length
              ? piiTypes.map((t) => '<code>' + escapeHtml(t) + '</code>').join(', ')
              : '—'
          }`
        : 'No PII detected. Prompt forwarded as-is.');
    steps.push(step(4, 'App policy evaluation', piiBody, piiAction as TraceBadge, piiTone as 'passed' | 'blocked' | 'masked'));

    const budgetStatus = String((log.budgetStatus as string) || 'BUDGET_OK');
    const overBudget = budgetStatus === 'BUDGET_EXCEEDED';
    steps.push(
      step(
        5,
        'Budget / cost check',
        `Status <code>${escapeHtml(budgetStatus)}</code> · Cost ${fmtCurrency(log.cost ?? log.estimatedCostUsd ?? 0)} · Over budget: <strong>${overBudget ? 'yes' : 'no'}</strong>`,
        overBudget ? 'BLOCKED' : 'PASSED',
        overBudget ? 'blocked' : 'passed'
      )
    );

    const model = String(log.model || '');
    const modelTier = model.toLowerCase().includes('mini') || model === 'small' ? 'small' : 'large';
    const routeReason = String((log.modelRouteReason as string) || (modelTier === 'large' ? 'complex prompt' : 'simple prompt'));
    steps.push(
      step(
        6,
        'Model routing',
        model
          ? `Selected <code>${escapeHtml(model)}</code> · reason: ${escapeHtml(routeReason)}`
          : `Skipped — request blocked before model selection.`,
        model ? 'PASSED' : 'NOT CALLED',
        model ? 'passed' : 'blocked'
      )
    );

    const llmBody = llmCalled
      ? `Provider <strong>${escapeHtml(provider)}</strong> · path mode <code>${escapeHtml(llmPathMode)}</code> · tokens ${escapeHtml(String((log.inputTokens as number) ?? '—'))} in / ${escapeHtml(String((log.outputTokens as number) ?? '—'))} out · latency ${fmtMs(log.latencyMs)}` +
        (dataSource ? ` · business data injected: <code>${escapeHtml(dataSource)}</code>` : '')
      : `LLM not called. Reason: <strong>${escapeHtml(blockReason || (decisionLayer === 'kong' ? 'Kong layer rejected before Express' : 'app governance rejected'))}</strong>.`;
    steps.push(step(7, 'LLM call', llmBody, llmCalled ? 'PASSED' : 'NOT CALLED', llmCalled ? 'passed' : 'blocked'));

    steps.push(
      step(
        8,
        'Audit persistence',
        `Row written to SQLite <code>request_logs</code>. Raw PII: <strong>not stored</strong>. Redacted preview only.`,
        'LOGGED',
        'passed'
      )
    );

    return (
      '<div class="space-y-2">' +
      '<h4 class="font-h2 text-h2 text-on-surface mb-1">Backend Governance Trace</h4>' +
      '<p class="text-[12px] text-on-surface-variant mb-2">' +
      'Step-by-step timeline of what each layer did for this request. Badges follow ' +
      'the legend below. Raw PII, raw API keys, and provider secrets are never shown.' +
      '</p>' +
      '<ol class="trace-timeline">' + steps.join('') + '</ol>' +
      '<div class="text-[11px] text-on-surface-variant mt-2">' +
      'Legend: ' +
      traceBadge('PASSED') + ' ' + traceBadge('BLOCKED') + ' ' + traceBadge('MASKED') +
      ' ' + traceBadge('NOT CALLED') + ' ' + traceBadge('LOGGED') +
      ' ' + traceBadge('CONFIGURED') + ' ' + traceBadge('UNKNOWN') +
      '</div>' +
      '</div>'
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
    lifecyclePanelHtml,
    traceTimelineHtml,
  };
})();
