import { createClient } from '@supabase/supabase-js';
import type { Bot, BotAccount, BotTrade, BotBacktestData } from '@/types/bots';

// Database types for Supabase
export interface Database {
  public: {
    Tables: {
      bots: {
        Row: Bot;
        Insert: Omit<Bot, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Bot, 'id' | 'created_at'>>;
      };
      bot_accounts: {
        Row: BotAccount;
        Insert: Omit<BotAccount, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<BotAccount, 'id' | 'created_at'>>;
      };
      bot_trades: {
        Row: BotTrade;
        Insert: Omit<BotTrade, 'id' | 'created_at'>;
        Update: Partial<Omit<BotTrade, 'id' | 'created_at'>>;
      };
      bot_backtest_data: {
        Row: BotBacktestData;
        Insert: Omit<BotBacktestData, 'id' | 'created_at'>;
        Update: Partial<Omit<BotBacktestData, 'id' | 'created_at'>>;
      };
    };
  };
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Debug: log what we got (show actual values to debug)
console.log('[Supabase] URL:', supabaseUrl);
console.log('[Supabase] Key (first 20 chars):', supabaseAnonKey?.substring(0, 20));

// Check if Supabase is configured
export function isSupabaseConfigured(): boolean {
  const configured = Boolean(supabaseUrl?.trim() && supabaseAnonKey?.trim());
  console.log('[Supabase] isConfigured:', configured);
  return configured;
}

// Create client only if configured
export const supabase = isSupabaseConfigured()
  ? createClient<Database>(supabaseUrl!, supabaseAnonKey!)
  : null;

// Helper to get typed supabase client (throws if not configured)
export function getSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
}

// Expose to window for console imports
if (typeof window !== 'undefined' && supabase) {
  (window as any).supabase = supabase;
}
