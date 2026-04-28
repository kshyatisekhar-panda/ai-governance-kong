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

  // Generate timestamps relative to now so charts always have data
  const now = new Date();
  const h = (hoursAgo: number): string => {
    const d = new Date(now.getTime() - hoursAgo * 3600_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const seed = db.transaction(() => {
    const rows = [
      // Recent activity (last few hours)
      [h(0.5), "Compressor Technique", "Service Assistant", "small", 45, 12, 35, 0.000041, 280, "passed", ""],
      [h(0.8), "Compressor Technique", "Service Assistant", "large", 320, 85, 210, 0.004275, 650, "passed", ""],
      [h(1.0), "Vacuum Technique", "Product Explorer", "large", 280, 72, 180, 0.003060, 720, "passed", ""],
      [h(1.2), "Vacuum Technique", "Product Explorer", "small", 60, 15, 40, 0.000048, 190, "passed", ""],
      [h(1.5), "Power Technique", "Sales Copilot", "small", 38, 10, 28, 0.000033, 210, "passed", ""],
      [h(1.8), "Power Technique", "Sales Copilot", "small", 52, 14, 45, 0.000052, 240, "passed", ""],
      [h(2.0), "Industrial Technique", "Atlas Chat", "small", 22, 6, 18, 0.000021, 180, "passed", ""],

      // PII blocked requests
      [h(2.5), "Compressor Technique", "Service Assistant", "", 55, 0, 0, 0, 2, "blocked", "ssn"],
      [h(3.0), "Power Technique", "Sales Copilot", "", 48, 0, 0, 0, 1, "blocked", "credit_card"],
      [h(3.5), "Vacuum Technique", "Product Explorer", "", 62, 0, 0, 0, 1, "blocked", "blocked_keyword"],

      // PII masked requests
      [h(4.0), "Compressor Technique", "Service Assistant", "small", 80, 22, 50, 0.000061, 290, "masked", "email"],
      [h(4.5), "Vacuum Technique", "Product Explorer", "small", 65, 18, 42, 0.000051, 220, "masked", "phone"],

      // Older activity
      [h(5.0), "Compressor Technique", "Service Assistant", "large", 450, 120, 280, 0.005400, 820, "passed", ""],
      [h(5.5), "Vacuum Technique", "Product Explorer", "large", 380, 95, 240, 0.004075, 780, "passed", ""],
      [h(6.0), "Power Technique", "Sales Copilot", "small", 42, 11, 32, 0.000038, 200, "passed", ""],
      [h(6.5), "Industrial Technique", "Atlas Chat", "small", 35, 9, 25, 0.000030, 170, "passed", ""],
      [h(7.0), "Vacuum Technique", "Product Explorer", "small", 55, 14, 38, 0.000045, 190, "passed", ""],
      [h(7.5), "Compressor Technique", "Service Assistant", "large", 500, 130, 310, 0.005800, 900, "passed", ""],
      [h(8.0), "Power Technique", "Sales Copilot", "small", 48, 13, 35, 0.000042, 230, "passed", ""],

      // Yesterday
      [h(16.0), "Compressor Technique", "Service Assistant", "small", 40, 10, 30, 0.000035, 190, "passed", ""],
      [h(16.5), "Vacuum Technique", "Product Explorer", "large", 350, 90, 220, 0.003750, 750, "passed", ""],
      [h(17.0), "Power Technique", "Sales Copilot", "small", 55, 15, 40, 0.000048, 210, "passed", ""],
      [h(17.5), "Industrial Technique", "Atlas Chat", "small", 28, 7, 20, 0.000024, 160, "passed", ""],
      [h(18.0), "Vacuum Technique", "Product Explorer", "small", 48, 12, 35, 0.000041, 200, "passed", ""],
      [h(18.5), "Compressor Technique", "Service Assistant", "large", 420, 110, 260, 0.004950, 850, "passed", ""],
      [h(19.0), "Power Technique", "Sales Copilot", "", 70, 0, 0, 0, 1, "blocked", "ssn"],
      [h(19.5), "Vacuum Technique", "Product Explorer", "large", 300, 78, 195, 0.003315, 680, "passed", ""],
      [h(20.0), "Compressor Technique", "Service Assistant", "small", 38, 10, 28, 0.000033, 180, "masked", "email,phone"],
      [h(20.5), "Vacuum Technique", "Product Explorer", "small", 52, 14, 38, 0.000045, 190, "passed", ""],
      [h(21.0), "Industrial Technique", "Atlas Chat", "large", 280, 72, 180, 0.003060, 700, "passed", ""],

      // Two days ago
      [h(40.0), "Compressor Technique", "Service Assistant", "small", 42, 11, 30, 0.000036, 200, "passed", ""],
      [h(40.5), "Vacuum Technique", "Product Explorer", "large", 400, 105, 250, 0.004500, 800, "passed", ""],
      [h(41.0), "Power Technique", "Sales Copilot", "small", 35, 9, 25, 0.000030, 175, "passed", ""],
      [h(41.5), "Industrial Technique", "Atlas Chat", "small", 30, 8, 22, 0.000026, 165, "passed", ""],
      [h(42.0), "Compressor Technique", "Service Assistant", "", 60, 0, 0, 0, 1, "blocked", "credit_card"],
      [h(42.5), "Vacuum Technique", "Product Explorer", "small", 50, 13, 36, 0.000043, 195, "masked", "email"],
    ];

    for (const row of rows) {
      insert.run(...row);
    }
  });

  seed();
  console.log("[seed] Loaded 36 sample requests across 3 days.");
}
