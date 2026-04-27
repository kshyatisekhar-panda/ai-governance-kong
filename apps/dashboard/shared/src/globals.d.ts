interface AppConfig {
  API_BASE_URL: string;
  DEMO_API_KEY: string;
}

interface ApiError extends Error {
  status: number;
  body: unknown;
}

interface ApiFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

interface ApiClient {
  fetch: (path: string, options?: ApiFetchOptions) => Promise<unknown>;
  ApiError: new (message: string, status: number, body: unknown) => ApiError;
  getHealth: () => Promise<unknown>;
  getGovernanceStats: () => Promise<unknown>;
  getGovernanceLogs: (filters?: Record<string, string | number | undefined>) => Promise<unknown>;
  sendCustomerChat: (message: string, opts?: Record<string, unknown>) => Promise<unknown>;
  createServiceCase: (payload: unknown) => Promise<unknown>;
  getServiceCases: (filters?: Record<string, string | undefined>) => Promise<unknown>;
  getServiceCase: (id: string) => Promise<unknown>;
  runTriage: (id: string) => Promise<unknown>;
  draftReply: (id: string) => Promise<unknown>;
  getProducts: (filters?: Record<string, string | undefined>) => Promise<unknown>;
  getFilters: () => Promise<unknown>;
  askProductQuestion: (question: string, filters?: Record<string, unknown>) => Promise<unknown>;
}

interface RenderUtils {
  escapeHtml: (s: unknown) => string;
  fmtCurrency: (n: unknown) => string;
  fmtMs: (n: unknown) => string;
  fmtTimestamp: (iso: unknown) => string;
  fmtTime: (iso: unknown) => string;
  decisionBadgeClass: (decision: unknown) => string;
  budgetBadgeClass: (status: unknown) => string;
  piiBadge: (types: unknown) => string;
  checkForRawPii: (text: string | null | undefined, context?: string) => string[];
  renderError: (targetEl: HTMLElement | null, err: unknown) => void;
  setText: (el: HTMLElement | null, value: unknown) => void;
  governancePanelHtml: (g: unknown) => string;
}

interface NavigationModule {
  PAGES: Record<string, string>;
  linkTo: (key: string, params?: Record<string, string>) => string;
  bindSideNav: (currentKey: string) => void;
}

interface PageInfo {
  key: string;
  title: string;
  subtitle?: string;
}

interface Window {
  APP_CONFIG: AppConfig;
  api: ApiClient;
  renderUtils: RenderUtils;
  navigation: NavigationModule;
  PAGE_INFO?: PageInfo;
}
