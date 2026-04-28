(function (): void {
  const safeLocalStorage: Storage | null = (() => {
    try {
      window.localStorage.getItem('__probe__');
      return window.localStorage;
    } catch {
      return null;
    }
  })();

  function get(key: string, fallback: string): string {
    if (!safeLocalStorage) return fallback;
    const v = safeLocalStorage.getItem(key);
    return v && v.length > 0 ? v : fallback;
  }

  function defaultApiBase(): string {
    const loc = typeof window !== 'undefined' ? window.location : null;
    if (!loc || loc.protocol === 'file:' || !loc.hostname) {
      return 'http://localhost:8001';
    }
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(loc.hostname)) {
      return 'http://localhost:8001';
    }
    return '';
  }

  window.APP_CONFIG = {
    API_BASE_URL: get('API_BASE_URL', defaultApiBase()),
    DEMO_API_KEY: get('DEMO_API_KEY', 'eng-key-2024'),
  };
})();
