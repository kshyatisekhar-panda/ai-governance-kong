(function (): void {
  function buildUrl(path: string, query?: Record<string, unknown>): string {
    const base = window.APP_CONFIG.API_BASE_URL.replace(/\/$/, '');
    let url = base + (path.startsWith('/') ? path : '/' + path);
    if (query && typeof query === 'object') {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([k, v]) => {
        if (v === undefined || v === null || v === '') return;
        params.append(k, String(v));
      });
      const qs = params.toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }
    return url;
  }

  class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
  }

  async function apiFetch(path: string, options?: ApiFetchOptions): Promise<unknown> {
    options = options || {};
    const url = buildUrl(path, options.query as Record<string, unknown>);
    const headers: Record<string, string> = Object.assign(
      {
        'Content-Type': 'application/json',
        'x-api-key': window.APP_CONFIG.DEMO_API_KEY,
      },
      options.headers || {}
    );
    let res: Response;
    try {
      res = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (networkErr) {
      throw new ApiError(
        'Could not reach the gateway at ' +
          window.APP_CONFIG.API_BASE_URL +
          '. Is it running?',
        0,
        { networkError: true, details: String(networkErr) }
      );
    }

    let body: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }
    }

    if (!res.ok) {
      const b = body as Record<string, unknown> | null;
      const message =
        (b && ((b.error as string) || (b.message as string))) ||
        'Request failed with status ' + res.status;
      throw new ApiError(message, res.status, body);
    }
    return body;
  }

  const api: ApiClient = {
    fetch: apiFetch,
    ApiError: ApiError as unknown as ApiClient['ApiError'],

    getHealth: () => apiFetch('/health'),
    getGovernanceStats: () => apiFetch('/api/governance/stats'),
    getGovernanceLogs: (filters) =>
      apiFetch('/api/governance/logs', { query: filters }),

    sendCustomerChat: (message, opts) =>
      apiFetch('/api/customer-chat', {
        method: 'POST',
        body: Object.assign(
          { message, team: 'customer-service', sourceApp: 'customer-chat' },
          opts || {}
        ),
      }),

    createServiceCase: (payload) =>
      apiFetch('/api/service-cases', { method: 'POST', body: payload }),

    getServiceCases: (filters) =>
      apiFetch('/api/service-cases', { query: filters }),

    getServiceCase: (id) =>
      apiFetch('/api/service-cases/' + encodeURIComponent(id)),

    runTriage: (id) =>
      apiFetch('/api/service-cases/' + encodeURIComponent(id) + '/triage', {
        method: 'POST',
        body: {},
      }),

    draftReply: (id) =>
      apiFetch('/api/service-cases/' + encodeURIComponent(id) + '/draft-reply', {
        method: 'POST',
        body: {},
      }),

    getProducts: (filters) => apiFetch('/api/products', { query: filters }),

    getFilters: () => apiFetch('/api/filters'),

    askProductQuestion: (question, filters) =>
      apiFetch('/api/products/ask', {
        method: 'POST',
        body: { question, filters: filters || {} },
      }),
  };

  window.api = api;
})();
