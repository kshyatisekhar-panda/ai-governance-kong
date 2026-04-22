import { Router } from "express";
import {
  getSalesData,
  getSalesReport,
  getFilterOptions,
  getMachineCategories,
  getInventoryStatus,
} from "../services/business-apis.js";

export const businessRouter = Router();

// Sales with filters: /api/sales?businessArea=Compressor Technique&category=Rotary Screw Compressors&region=Europe
businessRouter.get("/sales", (req, res) => {
  const { businessArea, category, product, brand, region, month } = req.query as Record<string, string>;
  const data = getSalesData({ businessArea, category, product, brand, region, month });

  const totalRevenue = data.reduce((sum, r) => sum + r.revenue, 0);
  const totalUnits = data.reduce((sum, r) => sum + r.unitsSold, 0);

  res.json({ data, total: data.length, totalRevenue, totalUnits });
});

businessRouter.get("/sales/report", (_req, res) => {
  res.json(getSalesReport());
});

businessRouter.get("/filters", (_req, res) => {
  res.json(getFilterOptions());
});

businessRouter.get("/machines/categories", (_req, res) => {
  res.json(getMachineCategories());
});

businessRouter.get("/inventory/status", (_req, res) => {
  res.json(getInventoryStatus());
});
