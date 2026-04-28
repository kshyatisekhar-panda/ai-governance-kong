import {
  getSalesReport,
  getMachineCategories,
  getInventoryStatus,
} from "../services/business-apis.js";

interface DetectedAPI {
  name: string;
  data: object;
  systemPrompt: string;
}

const API_KEYWORDS: Record<string, readonly string[]> = {
  sales: ["sales", "revenue", "report", "deal", "customer", "quarterly", "financial", "growth", "pipeline", "forecast"],
  machines: ["machine", "compressor", "equipment", "category", "categories", "model", "product", "drill", "vacuum", "tool"],
  inventory: ["inventory", "stock", "supply", "warehouse", "in-stock", "low stock", "reorder", "storage"],
};

export function detectAPI(promptText: string): DetectedAPI | null {
  const lower = promptText.toLowerCase();

  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const [api, keywords] of Object.entries(API_KEYWORDS)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = api;
    }
  }

  if (bestScore === 0 || !bestMatch) return null;

  switch (bestMatch) {
    case "sales":
      return {
        name: "sales",
        data: getSalesReport(),
        systemPrompt:
          "You are an Atlas Copco business analyst AI assistant. " +
          "Use the following sales data to answer the user's question. " +
          "Be specific with numbers, mention trends, and provide actionable insights. " +
          "Format currency values clearly. " +
          "When showing breakdowns, comparisons, or multiple data points, use Markdown tables. " +
          "Use Markdown headings (##) for sections and bullet lists for key takeaways.",
      };

    case "machines":
      return {
        name: "machines",
        data: getMachineCategories(),
        systemPrompt:
          "You are an Atlas Copco product specialist AI assistant. " +
          "Use the following machine and product category data to answer the user's question. " +
          "Include rankings, units sold, and growth percentages where relevant. " +
          "When showing rankings or comparisons, use Markdown tables. Use Markdown headings (##) for sections.",
      };

    case "inventory":
      return {
        name: "inventory",
        data: getInventoryStatus(),
        systemPrompt:
          "You are an Atlas Copco supply chain AI assistant. " +
          "Use the following inventory data to answer the user's question. " +
          "Highlight critical stock alerts and recommend actions for low stock items. " +
          "When listing stock status, use Markdown tables with columns for product, current stock, status, and recommended action.",
      };

    default:
      return null;
  }
}
