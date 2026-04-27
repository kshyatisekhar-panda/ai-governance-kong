import Database from "better-sqlite3";

export function seedDatabase(db: Database.Database): void {
  const count = db.prepare("SELECT COUNT(*) as c FROM request_logs").get() as { c: number };
  if (count.c > 0) return;

  console.log("[seed] Loading initial data...");

  const insert = db.prepare(`
    INSERT INTO request_logs
      (timestamp, team, app, model, prompt_length, input_tokens, output_tokens,
       cost_usd, latency_ms, status, block_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seed = db.transaction(() => {
    const rows = [
      // Day 1: normal usage across teams
      ["2026-04-25 09:15:00", "Compressor Technique", "Service Assistant", "small", 45, 12, 35, 0.000041, 280, "passed", ""],
      ["2026-04-25 09:22:00", "Compressor Technique", "Service Assistant", "large", 320, 85, 210, 0.004275, 650, "passed", ""],
      ["2026-04-25 09:45:00", "Vacuum Technique", "Product Explorer", "large", 280, 72, 180, 0.003060, 720, "passed", ""],
      ["2026-04-25 10:00:00", "Vacuum Technique", "Product Explorer", "small", 60, 15, 40, 0.000048, 190, "passed", ""],
      ["2026-04-25 10:15:00", "Power Technique", "Sales Copilot", "small", 38, 10, 28, 0.000033, 210, "passed", ""],
      ["2026-04-25 10:30:00", "Power Technique", "Sales Copilot", "small", 52, 14, 45, 0.000052, 240, "passed", ""],
      ["2026-04-25 11:00:00", "Compressor Technique", "Atlas Chat", "small", 22, 6, 18, 0.000021, 180, "passed", ""],

      // PII blocked requests
      ["2026-04-25 11:15:00", "Compressor Technique", "Service Assistant", 0, 55, 0, 0, 0, 2, "blocked", "ssn"],
      ["2026-04-25 11:30:00", "Power Technique", "Sales Copilot", "", 48, 0, 0, 0, 1, "blocked", "credit_card"],
      ["2026-04-25 12:00:00", "Vacuum Technique", "Product Explorer", "", 62, 0, 0, 0, 1, "blocked", "blocked_keyword"],

      // PII masked requests
      ["2026-04-25 12:15:00", "Compressor Technique", "Atlas Chat", "small", 80, 22, 50, 0.000061, 290, "masked", "email"],
      ["2026-04-25 12:30:00", "Vacuum Technique", "Product Explorer", "small", 65, 18, 42, 0.000051, 220, "masked", "phone"],

      // Afternoon usage
      ["2026-04-25 13:00:00", "Compressor Technique", "Service Assistant", "large", 450, 120, 280, 0.005400, 820, "passed", ""],
      ["2026-04-25 13:30:00", "Vacuum Technique", "Product Explorer", "large", 380, 95, 240, 0.004075, 780, "passed", ""],
      ["2026-04-25 14:00:00", "Power Technique", "Sales Copilot", "small", 42, 11, 32, 0.000038, 200, "passed", ""],
      ["2026-04-25 14:15:00", "Compressor Technique", "Atlas Chat", "small", 35, 9, 25, 0.000030, 170, "passed", ""],
      ["2026-04-25 14:45:00", "Vacuum Technique", "Product Explorer", "small", 55, 14, 38, 0.000045, 190, "passed", ""],
      ["2026-04-25 15:00:00", "Compressor Technique", "Service Assistant", "large", 500, 130, 310, 0.005800, 900, "passed", ""],
      ["2026-04-25 15:30:00", "Power Technique", "Sales Copilot", "small", 48, 13, 35, 0.000042, 230, "passed", ""],

      // Day 2
      ["2026-04-26 08:30:00", "Compressor Technique", "Service Assistant", "small", 40, 10, 30, 0.000035, 190, "passed", ""],
      ["2026-04-26 08:45:00", "Vacuum Technique", "Product Explorer", "large", 350, 90, 220, 0.003750, 750, "passed", ""],
      ["2026-04-26 09:00:00", "Power Technique", "Sales Copilot", "small", 55, 15, 40, 0.000048, 210, "passed", ""],
      ["2026-04-26 09:15:00", "Compressor Technique", "Atlas Chat", "small", 28, 7, 20, 0.000024, 160, "passed", ""],
      ["2026-04-26 09:30:00", "Vacuum Technique", "Product Explorer", "small", 48, 12, 35, 0.000041, 200, "passed", ""],
      ["2026-04-26 10:00:00", "Compressor Technique", "Service Assistant", "large", 420, 110, 260, 0.004950, 850, "passed", ""],
      ["2026-04-26 10:30:00", "Power Technique", "Sales Copilot", "", 70, 0, 0, 0, 1, "blocked", "ssn"],
      ["2026-04-26 11:00:00", "Vacuum Technique", "Product Explorer", "large", 300, 78, 195, 0.003315, 680, "passed", ""],
      ["2026-04-26 11:15:00", "Compressor Technique", "Service Assistant", "small", 38, 10, 28, 0.000033, 180, "masked", "email,phone"],
      ["2026-04-26 11:30:00", "Vacuum Technique", "Product Explorer", "small", 52, 14, 38, 0.000045, 190, "passed", ""],
      ["2026-04-26 12:00:00", "Compressor Technique", "Atlas Chat", "large", 280, 72, 180, 0.003060, 700, "passed", ""],

      // Day 3 (today-ish)
      ["2026-04-27 08:00:00", "Compressor Technique", "Service Assistant", "small", 42, 11, 30, 0.000036, 200, "passed", ""],
      ["2026-04-27 08:15:00", "Vacuum Technique", "Product Explorer", "large", 400, 105, 250, 0.004500, 800, "passed", ""],
      ["2026-04-27 08:30:00", "Power Technique", "Sales Copilot", "small", 35, 9, 25, 0.000030, 175, "passed", ""],
      ["2026-04-27 09:00:00", "Compressor Technique", "Atlas Chat", "small", 30, 8, 22, 0.000026, 165, "passed", ""],
      ["2026-04-27 09:15:00", "Compressor Technique", "Service Assistant", "", 60, 0, 0, 0, 1, "blocked", "credit_card"],
      ["2026-04-27 09:30:00", "Vacuum Technique", "Product Explorer", "small", 50, 13, 36, 0.000043, 195, "masked", "email"],
    ];

    for (const row of rows) {
      insert.run(...row);
    }
  });

  seed();
  console.log("[seed] Loaded 36 sample requests across 3 days.");
}
