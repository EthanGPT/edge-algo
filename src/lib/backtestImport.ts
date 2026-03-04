/**
 * Backtest CSV Import Utility
 *
 * Parses KLBS backtest trade CSV files and imports them to Supabase.
 */

import Papa from 'papaparse';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BotBacktestTradeFormData,
  LevelType,
  BacktestDirection,
  BacktestOutcome,
  TradingSession,
} from '@/types/bots';

// CSV row structure from klbs_backtest.py output
interface CSVRow {
  date: string;
  level: string;
  direction: string;
  entry: string;
  tp: string;
  sl: string;
  bar_idx: string;
  session: string;
  day_of_week: string;
  hour: string;
  level_price: string;
  year: string;
  month: string;
  outcome: string;
  exit_price: string;
  exit_time: string;
  pnl_pts: string;
  pnl_usd_gross: string;
  fees_usd: string;
  pnl_usd: string;
  bars_held: string;
  max_favorable_excursion: string;
  max_adverse_excursion: string;
  trailing_active: string;
  contracts: string;
}

/**
 * Parse a CSV string into backtest trade records
 */
export function parseBacktestCSV(
  csvContent: string,
  botId: string,
  instrument: string,
  sourceFile: string
): BotBacktestTradeFormData[] {
  const result = Papa.parse<CSVRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (result.errors.length > 0) {
    console.warn('[BacktestImport] CSV parse warnings:', result.errors);
  }

  return result.data
    .filter(row => row.date && row.outcome) // Skip empty rows
    .map(row => ({
      bot_id: botId,
      trade_date: row.date,
      exit_time: row.exit_time || undefined,
      instrument,
      level: (row.level?.toUpperCase() || 'PMH') as LevelType,
      direction: (row.direction?.toUpperCase() || 'LONG') as BacktestDirection,
      entry_price: parseFloat(row.entry) || 0,
      exit_price: row.exit_price ? parseFloat(row.exit_price) : undefined,
      tp_price: row.tp ? parseFloat(row.tp) : undefined,
      sl_price: row.sl ? parseFloat(row.sl) : undefined,
      contracts: parseInt(row.contracts) || 1,
      outcome: (row.outcome?.toUpperCase() || 'LOSS') as BacktestOutcome,
      pnl_pts: row.pnl_pts ? parseFloat(row.pnl_pts) : undefined,
      pnl_usd_gross: row.pnl_usd_gross ? parseFloat(row.pnl_usd_gross) : undefined,
      fees_usd: row.fees_usd ? parseFloat(row.fees_usd) : undefined,
      pnl_usd: row.pnl_usd ? parseFloat(row.pnl_usd) : undefined,
      session: (row.session || 'London') as TradingSession,
      day_of_week: row.day_of_week,
      hour: row.hour ? parseInt(row.hour) : undefined,
      year: parseInt(row.year) || new Date().getFullYear(),
      month: parseInt(row.month) || 1,
      bars_held: row.bars_held ? parseInt(row.bars_held) : undefined,
      max_favorable_excursion: row.max_favorable_excursion
        ? parseFloat(row.max_favorable_excursion)
        : undefined,
      max_adverse_excursion: row.max_adverse_excursion
        ? parseFloat(row.max_adverse_excursion)
        : undefined,
      trailing_active: row.trailing_active === 'True' || row.trailing_active === 'true',
      source_file: sourceFile,
    }));
}

/**
 * Import trades to Supabase in batches
 */
export async function importTradesToSupabase(
  supabase: SupabaseClient,
  trades: BotBacktestTradeFormData[],
  onProgress?: (current: number, total: number) => void,
  chunkSize: number = 500
): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;

  const totalChunks = Math.ceil(trades.length / chunkSize);

  for (let i = 0; i < trades.length; i += chunkSize) {
    const chunk = trades.slice(i, i + chunkSize);
    const chunkNum = Math.floor(i / chunkSize) + 1;

    try {
      const { error, count } = await supabase
        .from('bot_backtest_trades')
        .insert(chunk)
        .select();

      if (error) {
        errors.push(`Chunk ${chunkNum}/${totalChunks}: ${error.message}`);
      } else {
        inserted += chunk.length;
      }
    } catch (e) {
      errors.push(`Chunk ${chunkNum}/${totalChunks}: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    // Report progress
    if (onProgress) {
      onProgress(Math.min(i + chunkSize, trades.length), trades.length);
    }
  }

  return { inserted, errors };
}

/**
 * Delete all backtest trades for a specific bot
 */
export async function deleteBacktestTradesForBot(
  supabase: SupabaseClient,
  botId: string
): Promise<{ deleted: number; error: string | null }> {
  try {
    const { count, error } = await supabase
      .from('bot_backtest_trades')
      .delete()
      .eq('bot_id', botId)
      .select();

    if (error) {
      return { deleted: 0, error: error.message };
    }

    return { deleted: count || 0, error: null };
  } catch (e) {
    return { deleted: 0, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

/**
 * Get summary stats for imported backtest trades
 */
export async function getBacktestTradeStats(
  supabase: SupabaseClient,
  botId: string
): Promise<{
  total: number;
  wins: number;
  losses: number;
  net_pnl: number;
  months_covered: number[];
  years_covered: number[];
} | null> {
  try {
    const { data, error } = await supabase
      .from('bot_backtest_trades')
      .select('outcome, pnl_usd, month, year')
      .eq('bot_id', botId);

    if (error || !data) return null;

    const wins = data.filter(t => t.outcome === 'WIN').length;
    const losses = data.filter(t => t.outcome === 'LOSS').length;
    const net_pnl = data.reduce((s, t) => s + (t.pnl_usd || 0), 0);
    const months_covered = [...new Set(data.map(t => t.month))].sort((a, b) => a - b);
    const years_covered = [...new Set(data.map(t => t.year))].sort((a, b) => a - b);

    return {
      total: data.length,
      wins,
      losses,
      net_pnl,
      months_covered,
      years_covered,
    };
  } catch {
    return null;
  }
}

/**
 * Read a File object and return its content as string
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Extract instrument from filename (e.g., "klbs_MNQ_trades.csv" -> "MNQ")
 */
export function extractInstrumentFromFilename(filename: string): string | null {
  // Match patterns like "klbs_MNQ_trades.csv" or "MNQ_backtest.csv"
  const match = filename.match(/(?:klbs_)?([A-Z0-9]{2,4})(?:_trades|_backtest)?\.csv/i);
  return match ? match[1].toUpperCase() : null;
}
