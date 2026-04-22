export interface SalesRecord {
  month: string;
  businessArea: string;
  category: string;
  product: string;
  brand: string;
  unitsSold: number;
  revenue: number;
  region: string;
}

const SALES_DATA: SalesRecord[] = [
  // COMPRESSOR TECHNIQUE
  { month: "Oct 2025", businessArea: "Compressor Technique", category: "Rotary Screw Compressors", product: "GA 37+ VSD", brand: "Atlas Copco", unitsSold: 120, revenue: 2_400_000, region: "Europe" },
  { month: "Oct 2025", businessArea: "Compressor Technique", category: "Rotary Screw Compressors", product: "GA 55 VSD+", brand: "Atlas Copco", unitsSold: 85, revenue: 2_125_000, region: "Asia" },
  { month: "Oct 2025", businessArea: "Compressor Technique", category: "Oil-Free Compressors", product: "ZR 90 VSD+", brand: "Atlas Copco", unitsSold: 45, revenue: 2_700_000, region: "Europe" },
  { month: "Oct 2025", businessArea: "Compressor Technique", category: "Piston Compressors", product: "LE/LT Series", brand: "Atlas Copco", unitsSold: 310, revenue: 1_860_000, region: "Americas" },
  { month: "Oct 2025", businessArea: "Compressor Technique", category: "Nitrogen Generators", product: "NGP 25+", brand: "Atlas Copco", unitsSold: 90, revenue: 1_350_000, region: "Europe" },
  { month: "Oct 2025", businessArea: "Compressor Technique", category: "Air Dryers", product: "FD 300 VSD", brand: "Atlas Copco", unitsSold: 200, revenue: 1_200_000, region: "Asia" },
  { month: "Nov 2025", businessArea: "Compressor Technique", category: "Rotary Screw Compressors", product: "GA 37+ VSD", brand: "Atlas Copco", unitsSold: 130, revenue: 2_600_000, region: "Europe" },
  { month: "Nov 2025", businessArea: "Compressor Technique", category: "Rotary Screw Compressors", product: "GA 90 VSD+", brand: "Atlas Copco", unitsSold: 60, revenue: 2_400_000, region: "Asia" },
  { month: "Nov 2025", businessArea: "Compressor Technique", category: "Oil-Free Compressors", product: "ZT 55 VSD", brand: "Atlas Copco", unitsSold: 50, revenue: 2_250_000, region: "Americas" },
  { month: "Nov 2025", businessArea: "Compressor Technique", category: "Nitrogen Generators", product: "NGP 25+", brand: "Atlas Copco", unitsSold: 95, revenue: 1_425_000, region: "Europe" },
  { month: "Dec 2025", businessArea: "Compressor Technique", category: "Rotary Screw Compressors", product: "GA 37+ VSD", brand: "Atlas Copco", unitsSold: 100, revenue: 2_000_000, region: "Europe" },
  { month: "Dec 2025", businessArea: "Compressor Technique", category: "Rotary Screw Compressors", product: "GA 55 VSD+", brand: "Atlas Copco", unitsSold: 75, revenue: 1_875_000, region: "Asia" },
  { month: "Dec 2025", businessArea: "Compressor Technique", category: "Air Dryers", product: "FD 300 VSD", brand: "Atlas Copco", unitsSold: 180, revenue: 1_080_000, region: "Europe" },
  { month: "Jan 2026", businessArea: "Compressor Technique", category: "Rotary Screw Compressors", product: "GA 37+ VSD", brand: "Atlas Copco", unitsSold: 145, revenue: 2_900_000, region: "Europe" },
  { month: "Jan 2026", businessArea: "Compressor Technique", category: "Rotary Screw Compressors", product: "GA 90 VSD+", brand: "Atlas Copco", unitsSold: 70, revenue: 2_800_000, region: "Americas" },
  { month: "Jan 2026", businessArea: "Compressor Technique", category: "Oil-Free Compressors", product: "ZR 160 VSD+", brand: "Atlas Copco", unitsSold: 30, revenue: 3_000_000, region: "Europe" },
  { month: "Feb 2026", businessArea: "Compressor Technique", category: "Rotary Screw Compressors", product: "GA 37+ VSD", brand: "Atlas Copco", unitsSold: 155, revenue: 3_100_000, region: "Europe" },
  { month: "Feb 2026", businessArea: "Compressor Technique", category: "Rotary Screw Compressors", product: "GA 55 VSD+", brand: "Atlas Copco", unitsSold: 100, revenue: 2_500_000, region: "Asia" },
  { month: "Mar 2026", businessArea: "Compressor Technique", category: "Rotary Screw Compressors", product: "GA 37+ VSD", brand: "Atlas Copco", unitsSold: 165, revenue: 3_300_000, region: "Europe" },
  { month: "Mar 2026", businessArea: "Compressor Technique", category: "Oil-Free Compressors", product: "ZR 90 VSD+", brand: "Atlas Copco", unitsSold: 55, revenue: 3_300_000, region: "Americas" },
  { month: "Mar 2026", businessArea: "Compressor Technique", category: "Nitrogen Generators", product: "NGP 50+", brand: "Atlas Copco", unitsSold: 110, revenue: 2_200_000, region: "Asia" },

  // VACUUM TECHNIQUE
  { month: "Oct 2025", businessArea: "Vacuum Technique", category: "Vacuum Pumps", product: "GHS 1300 VSD+", brand: "Atlas Copco", unitsSold: 180, revenue: 3_600_000, region: "Europe" },
  { month: "Oct 2025", businessArea: "Vacuum Technique", category: "Vacuum Pumps", product: "Edwards nXDS", brand: "Edwards", unitsSold: 250, revenue: 1_500_000, region: "Asia" },
  { month: "Nov 2025", businessArea: "Vacuum Technique", category: "Vacuum Pumps", product: "GHS 900 VSD+", brand: "Atlas Copco", unitsSold: 170, revenue: 2_550_000, region: "Europe" },
  { month: "Nov 2025", businessArea: "Vacuum Technique", category: "Leak Detection", product: "Leybold PHOENIX", brand: "Leybold", unitsSold: 320, revenue: 1_920_000, region: "Americas" },
  { month: "Dec 2025", businessArea: "Vacuum Technique", category: "Vacuum Pumps", product: "GHS 1300 VSD+", brand: "Atlas Copco", unitsSold: 195, revenue: 3_900_000, region: "Americas" },
  { month: "Jan 2026", businessArea: "Vacuum Technique", category: "Vacuum Pumps", product: "GHS 1300 VSD+", brand: "Atlas Copco", unitsSold: 210, revenue: 4_200_000, region: "Europe" },
  { month: "Jan 2026", businessArea: "Vacuum Technique", category: "Vacuum Pumps", product: "Edwards nXDS", brand: "Edwards", unitsSold: 280, revenue: 1_680_000, region: "Asia" },
  { month: "Feb 2026", businessArea: "Vacuum Technique", category: "Vacuum Pumps", product: "GHS 900 VSD+", brand: "Atlas Copco", unitsSold: 240, revenue: 3_600_000, region: "Asia" },
  { month: "Mar 2026", businessArea: "Vacuum Technique", category: "Vacuum Pumps", product: "GHS 1300 VSD+", brand: "Atlas Copco", unitsSold: 230, revenue: 4_600_000, region: "Europe" },
  { month: "Mar 2026", businessArea: "Vacuum Technique", category: "Leak Detection", product: "Leybold PHOENIX", brand: "Leybold", unitsSold: 350, revenue: 2_100_000, region: "Americas" },

  // POWER TECHNIQUE
  { month: "Oct 2025", businessArea: "Power Technique", category: "Portable Compressors", product: "XAS 188", brand: "Atlas Copco", unitsSold: 200, revenue: 3_000_000, region: "Americas" },
  { month: "Oct 2025", businessArea: "Power Technique", category: "Generators", product: "QAS 150", brand: "Atlas Copco", unitsSold: 80, revenue: 1_600_000, region: "Europe" },
  { month: "Oct 2025", businessArea: "Power Technique", category: "Light Towers", product: "HiLight V5+", brand: "Atlas Copco", unitsSold: 150, revenue: 900_000, region: "Americas" },
  { month: "Nov 2025", businessArea: "Power Technique", category: "Portable Compressors", product: "XAS 188", brand: "Atlas Copco", unitsSold: 220, revenue: 3_300_000, region: "Americas" },
  { month: "Nov 2025", businessArea: "Power Technique", category: "Portable Compressors", product: "XATS 350", brand: "Atlas Copco", unitsSold: 65, revenue: 1_950_000, region: "Europe" },
  { month: "Nov 2025", businessArea: "Power Technique", category: "Pumps", product: "PAS 100", brand: "Atlas Copco", unitsSold: 130, revenue: 780_000, region: "Asia" },
  { month: "Dec 2025", businessArea: "Power Technique", category: "Portable Compressors", product: "XAS 188", brand: "Atlas Copco", unitsSold: 180, revenue: 2_700_000, region: "Americas" },
  { month: "Dec 2025", businessArea: "Power Technique", category: "Generators", product: "QAS 250", brand: "Atlas Copco", unitsSold: 60, revenue: 1_500_000, region: "Europe" },
  { month: "Jan 2026", businessArea: "Power Technique", category: "Portable Compressors", product: "XAS 188", brand: "Atlas Copco", unitsSold: 240, revenue: 3_600_000, region: "Americas" },
  { month: "Jan 2026", businessArea: "Power Technique", category: "Generators", product: "QAS 150", brand: "Atlas Copco", unitsSold: 95, revenue: 1_900_000, region: "Asia" },
  { month: "Feb 2026", businessArea: "Power Technique", category: "Portable Compressors", product: "XAS 188", brand: "Atlas Copco", unitsSold: 250, revenue: 3_750_000, region: "Americas" },
  { month: "Feb 2026", businessArea: "Power Technique", category: "Light Towers", product: "HiLight V5+", brand: "Atlas Copco", unitsSold: 180, revenue: 1_080_000, region: "Europe" },
  { month: "Mar 2026", businessArea: "Power Technique", category: "Portable Compressors", product: "XAS 188", brand: "Atlas Copco", unitsSold: 260, revenue: 3_900_000, region: "Americas" },
  { month: "Mar 2026", businessArea: "Power Technique", category: "Portable Compressors", product: "XATS 350", brand: "Atlas Copco", unitsSold: 75, revenue: 2_250_000, region: "Europe" },

  // INDUSTRIAL TECHNIQUE
  { month: "Oct 2025", businessArea: "Industrial Technique", category: "Assembly Tools", product: "Tensor ST61", brand: "Atlas Copco", unitsSold: 450, revenue: 1_800_000, region: "Europe" },
  { month: "Oct 2025", businessArea: "Industrial Technique", category: "Assembly Tools", product: "Tensor S7", brand: "Atlas Copco", unitsSold: 300, revenue: 2_100_000, region: "Asia" },
  { month: "Oct 2025", businessArea: "Industrial Technique", category: "Impact Wrenches", product: "PRO W-Series", brand: "Chicago Pneumatic", unitsSold: 800, revenue: 1_280_000, region: "Americas" },
  { month: "Oct 2025", businessArea: "Industrial Technique", category: "Nutrunners", product: "Desoutter ERS", brand: "Desoutter", unitsSold: 350, revenue: 1_750_000, region: "Europe" },
  { month: "Nov 2025", businessArea: "Industrial Technique", category: "Assembly Tools", product: "Tensor ST61", brand: "Atlas Copco", unitsSold: 480, revenue: 1_920_000, region: "Europe" },
  { month: "Nov 2025", businessArea: "Industrial Technique", category: "Impact Wrenches", product: "PRO W-Series", brand: "Chicago Pneumatic", unitsSold: 850, revenue: 1_360_000, region: "Asia" },
  { month: "Nov 2025", businessArea: "Industrial Technique", category: "Machine Vision", product: "ISRA VISION", brand: "ISRA VISION", unitsSold: 120, revenue: 2_400_000, region: "Europe" },
  { month: "Dec 2025", businessArea: "Industrial Technique", category: "Assembly Tools", product: "Tensor ST61", brand: "Atlas Copco", unitsSold: 420, revenue: 1_680_000, region: "Europe" },
  { month: "Dec 2025", businessArea: "Industrial Technique", category: "Nutrunners", product: "Desoutter ERS", brand: "Desoutter", unitsSold: 380, revenue: 1_900_000, region: "Americas" },
  { month: "Jan 2026", businessArea: "Industrial Technique", category: "Assembly Tools", product: "Tensor S7", brand: "Atlas Copco", unitsSold: 340, revenue: 2_380_000, region: "Asia" },
  { month: "Jan 2026", businessArea: "Industrial Technique", category: "Impact Wrenches", product: "PRO W-Series", brand: "Chicago Pneumatic", unitsSold: 900, revenue: 1_440_000, region: "Americas" },
  { month: "Feb 2026", businessArea: "Industrial Technique", category: "Assembly Tools", product: "Tensor ST61", brand: "Atlas Copco", unitsSold: 550, revenue: 2_200_000, region: "Asia" },
  { month: "Feb 2026", businessArea: "Industrial Technique", category: "Machine Vision", product: "ISRA VISION", brand: "ISRA VISION", unitsSold: 140, revenue: 2_800_000, region: "Europe" },
  { month: "Mar 2026", businessArea: "Industrial Technique", category: "Assembly Tools", product: "Tensor ST61", brand: "Atlas Copco", unitsSold: 580, revenue: 2_320_000, region: "Americas" },
  { month: "Mar 2026", businessArea: "Industrial Technique", category: "Impact Wrenches", product: "PRO W-Series", brand: "Chicago Pneumatic", unitsSold: 950, revenue: 1_520_000, region: "Europe" },
  { month: "Mar 2026", businessArea: "Industrial Technique", category: "Nutrunners", product: "Desoutter ERS", brand: "Desoutter", unitsSold: 400, revenue: 2_000_000, region: "Asia" },
];

export function getSalesData(filters?: {
  businessArea?: string;
  category?: string;
  product?: string;
  brand?: string;
  region?: string;
  month?: string;
}): SalesRecord[] {
  let data = SALES_DATA;

  if (filters?.businessArea) {
    data = data.filter((r) => r.businessArea.toLowerCase() === filters.businessArea!.toLowerCase());
  }
  if (filters?.category) {
    data = data.filter((r) => r.category.toLowerCase() === filters.category!.toLowerCase());
  }
  if (filters?.product) {
    data = data.filter((r) => r.product.toLowerCase().includes(filters.product!.toLowerCase()));
  }
  if (filters?.brand) {
    data = data.filter((r) => r.brand.toLowerCase() === filters.brand!.toLowerCase());
  }
  if (filters?.region) {
    data = data.filter((r) => r.region.toLowerCase() === filters.region!.toLowerCase());
  }
  if (filters?.month) {
    data = data.filter((r) => r.month.toLowerCase().includes(filters.month!.toLowerCase()));
  }

  return data;
}

export function getFilterOptions() {
  return {
    businessAreas: [...new Set(SALES_DATA.map((r) => r.businessArea))],
    categories: [...new Set(SALES_DATA.map((r) => r.category))],
    products: [...new Set(SALES_DATA.map((r) => r.product))],
    brands: [...new Set(SALES_DATA.map((r) => r.brand))],
    regions: [...new Set(SALES_DATA.map((r) => r.region))],
    months: [...new Set(SALES_DATA.map((r) => r.month))],
  };
}

export function getSalesReport() {
  return {
    period: "October 2025 to March 2026",
    currency: "USD",
    data: SALES_DATA,
    summary: {
      totalRevenue: SALES_DATA.reduce((sum, r) => sum + r.revenue, 0),
      totalUnitsSold: SALES_DATA.reduce((sum, r) => sum + r.unitsSold, 0),
      businessAreas: [...new Set(SALES_DATA.map((r) => r.businessArea))],
      brands: [...new Set(SALES_DATA.map((r) => r.brand))],
    },
  };
}

export function getMachineCategories() {
  const byCategory = new Map<string, { units: number; revenue: number; businessArea: string }>();
  for (const r of SALES_DATA) {
    const key = r.category;
    const existing = byCategory.get(key) ?? { units: 0, revenue: 0, businessArea: r.businessArea };
    existing.units += r.unitsSold;
    existing.revenue += r.revenue;
    byCategory.set(key, existing);
  }

  return {
    categories: [...byCategory.entries()]
      .map(([name, data], i) => ({
        rank: i + 1,
        name,
        businessArea: data.businessArea,
        unitsSold: data.units,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .map((item, i) => ({ ...item, rank: i + 1 })),
    period: "Last 6 months (Oct 2025 to Mar 2026)",
  };
}

export function getInventoryStatus() {
  return {
    warehouses: [
      { location: "Stockholm, Sweden (HQ)", totalUnits: 12_400, lowStock: 3 },
      { location: "Antwerp, Belgium", totalUnits: 8_900, lowStock: 1 },
      { location: "Shanghai, China", totalUnits: 15_200, lowStock: 5 },
      { location: "Rock Hill, South Carolina, USA", totalUnits: 6_800, lowStock: 2 },
      { location: "Pune, India", totalUnits: 9_100, lowStock: 4 },
    ],
    lowStockAlerts: [
      { product: "GA 37+ VSD Compressor", warehouse: "Shanghai", currentStock: 12, reorderPoint: 50, status: "CRITICAL" },
      { product: "XAS 188 Portable Compressor", warehouse: "Rock Hill", currentStock: 8, reorderPoint: 30, status: "CRITICAL" },
      { product: "Tensor ST61 Assembly Tool", warehouse: "Stockholm", currentStock: 45, reorderPoint: 100, status: "LOW" },
      { product: "GHS 1300 VSD+ Vacuum Pump", warehouse: "Pune", currentStock: 18, reorderPoint: 40, status: "LOW" },
      { product: "Edwards nXDS Scroll Pump", warehouse: "Shanghai", currentStock: 22, reorderPoint: 60, status: "LOW" },
      { product: "QAS 150 Generator", warehouse: "Antwerp", currentStock: 5, reorderPoint: 15, status: "CRITICAL" },
    ],
    summary: {
      totalUnits: 52_400,
      totalWarehouses: 5,
      criticalAlerts: 3,
      lowAlerts: 3,
    },
    lastUpdated: "2026-03-31",
  };
}
