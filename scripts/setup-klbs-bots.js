#!/usr/bin/env node
/**
 * Setup KLBS Bots and Import Backtest Data
 *
 * Creates bots for all instruments and imports the backtest CSV data.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const OUTPUT_DIR = resolve(__dirname, '../klbs-backtest/outputs');

const BOTS_CONFIG = [
  { name: 'KLBS', version: 'v1.0', instrument: 'MNQ', default_contracts: 2, csv: 'klbs_MNQ_trades_optimized.csv' },
  { name: 'KLBS', version: 'v1.0', instrument: 'MES', default_contracts: 2, csv: 'klbs_MES_trades_optimized.csv' },
  { name: 'KLBS', version: 'v1.0', instrument: 'MGC', default_contracts: 2, csv: 'klbs_MGC_trades_optimized.csv' },
  { name: 'KLBS', version: 'v1.0', instrument: 'ZN', default_contracts: 1, csv: 'klbs_ZN_trades_optimized.csv' },
  { name: 'KLBS', version: 'v1.0', instrument: 'ZB', default_contracts: 1, csv: 'klbs_ZB_trades_optimized.csv' },
  { name: 'KLBS', version: 'v1.0', instrument: '6E', default_contracts: 1, csv: 'klbs_6E_trades_optimized.csv' },
  { name: 'KLBS', version: 'v1.0', instrument: '6J', default_contracts: 1, csv: 'klbs_6J_trades_optimized.csv' },
];

function parseCSV(content, botId, instrument, sourceFile) {
  const result = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  return result.data
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
      year: parseInt(row.year) || 2024,
      month: parseInt(row.month) || 1,
      bars_held: row.bars_held ? parseInt(row.bars_held) : null,
      max_favorable_excursion: row.max_favorable_excursion ? parseFloat(row.max_favorable_excursion) : null,
      max_adverse_excursion: row.max_adverse_excursion ? parseFloat(row.max_adverse_excursion) : null,
      trailing_active: row.trailing_active === 'True' || row.trailing_active === 'true',
      source_file: sourceFile,
    }));
}

async function importTrades(trades, instrument) {
  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < trades.length; i += BATCH_SIZE) {
    const batch = trades.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('bot_backtest_trades').insert(batch);

    if (error) {
      console.error(`    Batch error: ${error.message}`);
    } else {
      inserted += batch.length;
      process.stdout.write(`\r    Imported ${inserted}/${trades.length}`);
    }
  }
  console.log('');
  return inserted;
}

async function main() {
  console.log('='.repeat(60));
  console.log('KLBS Bot Setup & Backtest Import');
  console.log('='.repeat(60));
  console.log();

  // Need a user ID - check if we can get one from existing data or use a placeholder
  // For RLS, we need a valid user. Let's check auth state.

  let totalTrades = 0;

  for (const config of BOTS_CONFIG) {
    const csvPath = resolve(OUTPUT_DIR, config.csv);

    if (!existsSync(csvPath)) {
      console.log(`Skipping ${config.instrument} - CSV not found`);
      continue;
    }

    console.log(`\n${config.instrument}:`);

    // Check if bot already exists
    const { data: existingBot } = await supabase
      .from('bots')
      .select('id')
      .eq('instrument', config.instrument)
      .eq('name', config.name)
      .single();

    let botId;

    if (existingBot) {
      botId = existingBot.id;
      console.log(`  Bot exists: ${botId}`);

      // Clear existing backtest trades
      await supabase.from('bot_backtest_trades').delete().eq('bot_id', botId);
    } else {
      // Create bot
      const { data: newBot, error } = await supabase
        .from('bots')
        .insert({
          name: config.name,
          version: config.version,
          instrument: config.instrument,
          default_contracts: config.default_contracts,
          status: 'active',
          description: `Key Level Breakout System for ${config.instrument}`,
          created_by: '00000000-0000-0000-0000-000000000000', // placeholder
        })
        .select()
        .single();

      if (error) {
        console.log(`  Failed to create bot: ${error.message}`);
        continue;
      }

      botId = newBot.id;
      console.log(`  Created bot: ${botId}`);
    }

    // Import trades
    const content = readFileSync(csvPath, 'utf-8');
    const trades = parseCSV(content, botId, config.instrument, config.csv);
    console.log(`  Parsed ${trades.length} trades`);

    const imported = await importTrades(trades, config.instrument);
    totalTrades += imported;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Done! Imported ${totalTrades.toLocaleString()} total trades`);
  console.log('='.repeat(60));
}

main().catch(console.error);
