/**
 * Convert backtest CSV files to JSON for static hosting
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(BASE_DIR, 'public');
const CSV_DIR = path.join(BASE_DIR, 'klbs-backtest', 'outputs');

const instruments = ['MNQ', 'MES', 'MGC', 'ZN', 'ZB', '6E', '6J'];
const allTrades = [];

instruments.forEach(instrument => {
  const csvPath = path.join(CSV_DIR, `klbs_${instrument}_trades.csv`);

  if (!fs.existsSync(csvPath)) {
    console.log(`Skipping ${instrument} (file not found)`);
    return;
  }

  const csv = fs.readFileSync(csvPath, 'utf-8');
  const result = Papa.parse(csv, { header: true, skipEmptyLines: true });

  let count = 0;
  result.data.forEach(row => {
    if (!row.date || !row.outcome) return;

    allTrades.push({
      trade_date: row.date,
      instrument: instrument,
      level: row.level,
      direction: row.direction,
      outcome: row.outcome,
      pnl_usd: parseFloat(row.pnl_usd) || 0,
      pnl_pts: parseFloat(row.pnl_pts) || 0,
      session: row.session,
      year: parseInt(row.year),
      month: parseInt(row.month),
      contracts: parseInt(row.contracts) || 1,
    });
    count++;
  });

  console.log(`${instrument}: ${count} trades`);
});

console.log(`Total: ${allTrades.length} trades`);

// Write JSON file
const outputPath = path.join(OUTPUT_DIR, 'klbs_backtest_trades.json');
fs.writeFileSync(outputPath, JSON.stringify(allTrades));
console.log(`Written to ${outputPath}`);

// Also log file size
const stats = fs.statSync(outputPath);
console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
