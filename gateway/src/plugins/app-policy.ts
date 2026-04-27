import type { ModelTier } from "../types.js";

export interface AppPolicy {
  pii: {
    blockSensitive: boolean;      // SSN, credit card, personnummer
    blockEmail: boolean;
    blockPhone: boolean;
    blockKeywords: boolean;
    allowMasking: boolean;         // if true, mask and forward. if false, block entirely
  };
  budget: {
    monthlyLimitUsd: number;
    warnAtPercent: number;
  };
  model: {
    allowSmall: boolean;
    allowLarge: boolean;
    defaultModel: ModelTier;
    maxPromptLength: number;
  };
}

const APP_POLICIES: Record<string, AppPolicy> = {
  // Atlas Chat: strict PII, moderate budget, small model only
  "Atlas Chat": {
    pii: {
      blockSensitive: true,
      blockEmail: true,
      blockPhone: true,
      blockKeywords: true,
      allowMasking: false,         // block everything, no masking
    },
    budget: {
      monthlyLimitUsd: 50,
      warnAtPercent: 70,
    },
    model: {
      allowSmall: true,
      allowLarge: false,           // chat only gets small model
      defaultModel: "small",
      maxPromptLength: 500,
    },
  },

  // Product Explorer: relaxed PII (allows emails masked), higher budget, both models
  "Product Explorer": {
    pii: {
      blockSensitive: true,
      blockEmail: false,           // emails allowed (masked)
      blockPhone: false,           // phones allowed (masked)
      blockKeywords: true,
      allowMasking: true,
    },
    budget: {
      monthlyLimitUsd: 100,
      warnAtPercent: 80,
    },
    model: {
      allowSmall: true,
      allowLarge: true,            // can use both models
      defaultModel: "small",
      maxPromptLength: 2000,
    },
  },

  // Service Assistant: moderate PII, high budget, large model access
  "Service Assistant": {
    pii: {
      blockSensitive: true,
      blockEmail: false,
      blockPhone: false,
      blockKeywords: true,
      allowMasking: true,
    },
    budget: {
      monthlyLimitUsd: 150,
      warnAtPercent: 80,
    },
    model: {
      allowSmall: true,
      allowLarge: true,
      defaultModel: "large",       // defaults to large model
      maxPromptLength: 5000,
    },
  },

  // Sales Copilot: strict PII, low budget, small model only
  "Sales Copilot": {
    pii: {
      blockSensitive: true,
      blockEmail: true,
      blockPhone: true,
      blockKeywords: true,
      allowMasking: false,
    },
    budget: {
      monthlyLimitUsd: 30,
      warnAtPercent: 60,
    },
    model: {
      allowSmall: true,
      allowLarge: false,
      defaultModel: "small",
      maxPromptLength: 1000,
    },
  },

  // Report Scheduler: no PII expected, moderate budget, large model
  "Report Scheduler": {
    pii: {
      blockSensitive: true,
      blockEmail: false,
      blockPhone: false,
      blockKeywords: true,
      allowMasking: true,
    },
    budget: {
      monthlyLimitUsd: 80,
      warnAtPercent: 75,
    },
    model: {
      allowSmall: true,
      allowLarge: true,
      defaultModel: "large",
      maxPromptLength: 10000,
    },
  },
};

const DEFAULT_POLICY: AppPolicy = {
  pii: {
    blockSensitive: true,
    blockEmail: true,
    blockPhone: true,
    blockKeywords: true,
    allowMasking: true,
  },
  budget: {
    monthlyLimitUsd: 50,
    warnAtPercent: 70,
  },
  model: {
    allowSmall: true,
    allowLarge: false,
    defaultModel: "small",
    maxPromptLength: 1000,
  },
};

export function getAppPolicy(appName: string): AppPolicy {
  return APP_POLICIES[appName] ?? DEFAULT_POLICY;
}

export function getAllPolicies(): Record<string, AppPolicy> {
  return APP_POLICIES;
}
