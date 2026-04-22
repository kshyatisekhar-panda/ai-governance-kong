import type { Request, Response, NextFunction } from "express";
import { API_KEYS } from "../config.js";
import type { ClientIdentity } from "../types.js";

declare global {
  namespace Express {
    interface Request {
      client?: ClientIdentity;
    }
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const apiKey = req.headers["x-api-key"];

  if (typeof apiKey !== "string" || !API_KEYS[apiKey]) {
    res.status(401).json({
      error: "unauthorized",
      message: "Invalid or missing API key",
    });
    return;
  }

  req.client = API_KEYS[apiKey];
  next();
}
