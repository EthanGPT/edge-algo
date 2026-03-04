#!/usr/bin/env node
/**
 * Import Backtest Trades to Supabase
 *
 * This script imports backtest trade CSV files from klbs-backtest/outputs
 * into the bot_backtest_trades table in Supabase.
 *
 * Usage:
 *   node scripts/import-backtest-trades.js
 *
 * Environment variables required:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY for full access)
 *
 * The script will:
 * 1. List all bots in the database
 * 2. Match CSV files to bots by instrument
 * 3. Import trades in batches of 500
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: Missing Supabase credentials');
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// CSV files to import (optimized versions have the best params)
const OUTPUT_DIR = resolve(__dirname, '../klbs-backtest/outputs');
const CSV_FILES = [
  { file: 'klbs_MNQ_trades_optimized.csv', instrument: 'MNQ' },
  { file: 'klbs_MES_trades_optimized.csv', instrument: 'MES' },
  { file: 'klbs_MGC_trades_optimized.csv', instrument: 'MGC' },
  { file: 'klbs_ZN_trades_optimized.csv', instrument: 'ZN' },
  { file: 'klbs_ZB_trades_optimized.csv', instrument: 'ZB' },
  { file: 'klbs_6E_trades_optimized.csv', instrument: '6E' },
  { file: 'klbs_6J_trades_optimized.csv', instrument: '6J' },
];

// Batch size for inserts
const BATCH_SIZE = 500;

/**
 * Parse CSV content into trade records
 */
function parseCSV(content, botId, instrument, sourceFile) {
  const result = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const records = result.data;

  return records
    .filter(row => row.date && row.outcome)
    .map(row => ({
      bot_id: botId,
      trade_date: row.date,
      exit_time: row.exit_time || null,
      instrument,
      level: (row.level || 'PMH').toUpperCase(),
      direction: (row.direction || 'LONG').toUpperCase(),
      entry_price: parseFloat(row.entry) || 0,
      exit_price: row.exit_price ? parseFloat(row.exit_price) : null,
      tp_price: row.tp ? parseFloat(row.tp) : null,
      sl_price: row.sl ? parseFloat(row.sl) : null,
      contracts: parseInt(row.contracts) || 1,
      outcome: (row.outcome || 'LOSS').toUpperCase(),
      pnl_pts: row.pnl_pts ? parseFloat(row.pnl_pts) : null,
      pnl_usd_gross: row.pnl_usd_gross ? parseFloat(row.pnl_usd_gross) : null,
      fees_usd: row.fees_usd ? parseFloat(row.fees_usd) : null,
      pnl_usd: row.pnl_usd ? parseFloat(row.pnl_usd) : null,
      session: row.session || 'London',
      day_of_week: row.day_of_week || null,
      hour: row.hour ? parseInt(row.hour) : null,
      year: parseInt(row.year) || new Date().getFullYear(),
      month: parseInt(row.month) || 1,
      bars_held: row.bars_held ? parseInt(row.bars_held) : null,
      max_favorable_excursion: row.max_favorable_excursion ? parseFloat(row.max_favorable_excursion) : null,
      max_adverse_excursion: row.max_adverse_excursion ? parseFloat(row.max_adverse_excursion) : null,
      trailing_active: row.trailing_active === 'True' || row.trailing_active === 'true',
      source_file: sourceFile,
    }));
}

/**
 * Import trades to Supabase in batches
 */
async function importTrades(trades) {
  let inserted = 0;
  const errors = [];

  for (let i = 0; i < trades.length; i += BATCH_SIZE) {
    const batch = trades.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(trades.length / BATCH_SIZE);

    try {
      const { error } = await supabase
        .from('bot_backtest_trades')
        .insert(batch);

      if (error) {
        errors.push(`Batch ${batchNum}/${totalBatches}: ${error.message}`);
        console.error(`  Batch ${batchNum}/${totalBatches} failed: ${error.message}`);
      } else {
        inserted += batch.length;
        process.stdout.write(`\r  Imported ${inserted}/${trades.length} trades`);
      }
    } catch (e) {
      errors.push(`Batch ${batchNum}/${totalBatches}: ${e.message}`);
    }
  }

  console.log(''); // newline after progress
  return { inserted, errors };
}

/**
 * Delete existing backtest trades for a bot
 */
async function deleteExistingTrades(botId) {
  const { error, count } = await supabase
    .from('bot_backtest_trades')
    .delete()
    .eq('bot_id', botId);

  if (error) {
    console.error(`  Error deleting existing trades: ${error.message}`);
    return 0;
  }
  return count || 0;
}

/**
 * Main import function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('KLBS Backtest Trade Importer');
  console.log('='.repeat(60));
  console.log();

  // 1. Fetch all bots
  console.log('Fetching bots from Supabase...');
  const { data: bots, error: botsError } = await supabase
    .from('bots')
    .select('id, name, instrument');

  if (botsError) {
    console.error('Error fetching bots:', botsError.message);
    process.exit(1);
  }

  if (!bots || bots.length === 0) {
    console.log('\nNo bots found in database.');
    console.log('Create bots first before importing backtest data.');
    console.log('\nTo create a bot, go to the Bots page in the app.');
    process.exit(0);
  }

  console.log(`Found ${bots.length} bot(s):`);
  bots.forEach(b => console.log(`  - ${b.name} (${b.instrument})`));
  console.log();

  // 2. Process each CSV file
  let totalImported = 0;
  let filesProcessed = 0;

  for (const { file, instrument } of CSV_FILES) {
    const filePath = resolve(OUTPUT_DIR, file);

    // Check if file exists
    if (!existsSync(filePath)) {
      console.log(`Skipping ${file} (file not found)`);
      continue;
    }

    // Find matching bot
    const bot = bots.find(b => b.instrument === instrument);
    if (!bot) {
      console.log(`Skipping ${file} (no bot for ${instrument})`);
      continue;
    }

    console.log(`\nProcessing ${file}...`);
    console.log(`  Bot: ${bot.name} (${bot.id})`);

    // Read and parse CSV
    const content = readFileSync(filePath, 'utf-8');
    const trades = parseCSV(content, bot.id, instrument, file);
    console.log(`  Parsed ${trades.length} trades`);

    if (trades.length === 0) {
      console.log('  No trades to import');
      continue;
    }

    // Delete existing trades for this bot (optional - comment out to append)
    console.log('  Clearing existing backtest trades...');
    const deleted = await deleteExistingTrades(bot.id);
    if (deleted > 0) {
      console.log(`  Deleted ${deleted} existing trades`);
    }

    // Import new trades
    const { inserted, errors } = await importTrades(trades);

    if (errors.length > 0) {
      console.log(`  Completed with ${errors.length} error(s)`);
    }

    totalImported += inserted;
    filesProcessed++;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Import Complete');
  console.log('='.repeat(60));
  console.log(`Files processed: ${filesProcessed}`);
  console.log(`Total trades imported: ${totalImported.toLocaleString()}`);
  console.log();
}

// Run
main().catch(console.error);
