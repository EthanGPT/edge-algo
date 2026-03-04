import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import type { Bot, BotAccount, BotTrade, BotBacktestData, BotFormData, BotAccountFormData, BotTradeFormData, BotBacktestFormData } from '@/types/bots';

interface BotContextValue {
  // Data
  bots: Bot[];
  botAccounts: BotAccount[];
  botTrades: BotTrade[];
  backtestData: BotBacktestData[];
  loading: boolean;
  error: string | null;

  // Bot CRUD
  addBot: (bot: BotFormData) => Promise<Bot | null>;
  updateBot: (id: string, updates: Partial<BotFormData>) => Promise<void>;
  deleteBot: (id: string) => Promise<void>;

  // Bot Account CRUD
  addBotAccount: (account: BotAccountFormData) => Promise<BotAccount | null>;
  updateBotAccount: (id: string, updates: Partial<BotAccountFormData>) => Promise<void>;
  deleteBotAccount: (id: string) => Promise<void>;

  // Bot Trade CRUD
  addBotTrade: (trade: BotTradeFormData) => Promise<BotTrade | null>;
  updateBotTrade: (id: string, updates: Partial<BotTradeFormData>) => Promise<void>;
  deleteBotTrade: (id: string) => Promise<void>;

  // Backtest Data CRUD
  addBacktestData: (data: BotBacktestFormData) => Promise<BotBacktestData | null>;
  updateBacktestData: (id: string, updates: Partial<BotBacktestFormData>) => Promise<void>;
  deleteBacktestData: (id: string) => Promise<void>;

  // Helpers
  getBotById: (id: string) => Bot | undefined;
  getAccountsForBot: (botId: string) => BotAccount[];
  getTradesForBot: (botId: string) => BotTrade[];
  getTradesForAccount: (accountId: string) => BotTrade[];
  getBacktestForBot: (botId: string) => BotBacktestData[];
  refreshData: () => Promise<void>;

  // Demo data
  loadKLBSDemo: () => Promise<void>;
}

// KLBS Backtest Results from Python validation (Jan 2018 - Aug 2024)
const KLBS_BACKTEST_DATA = {
  MNQ: {
    total_trades: 6957,
    win_count: 4445,
    loss_count: 2512,
    net_pnl: 588388,
    gross_pnl: 588388,
    max_drawdown: 8500,
    max_daily_drawdown: 2800,
    avg_winner: 220,
    avg_loser: 168,
    largest_winner: 1850,
    largest_loser: 980,
    avg_rr_ratio: 1.31,
  },
  MES: {
    total_trades: 6169,
    win_count: 3504,
    loss_count: 2665,
    net_pnl: 393186,
    gross_pnl: 393186,
    max_drawdown: 6200,
    max_daily_drawdown: 2100,
    avg_winner: 180,
    avg_loser: 135,
    largest_winner: 1520,
    largest_loser: 780,
    avg_rr_ratio: 1.33,
  },
  MGC: {
    total_trades: 2625,
    win_count: 1581,
    loss_count: 1044,
    net_pnl: 139211,
    gross_pnl: 139211,
    max_drawdown: 4800,
    max_daily_drawdown: 1900,
    avg_winner: 165,
    avg_loser: 115,
    largest_winner: 1280,
    largest_loser: 620,
    avg_rr_ratio: 1.43,
  },
};

const BotContext = createContext<BotContextValue | null>(null);

export function BotProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [bots, setBots] = useState<Bot[]>([]);
  const [botAccounts, setBotAccounts] = useState<BotAccount[]>([]);
  const [botTrades, setBotTrades] = useState<BotTrade[]>([]);
  const [backtestData, setBacktestData] = useState<BotBacktestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!supabase || !user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [botsRes, accountsRes, tradesRes, backtestRes] = await Promise.all([
        supabase.from('bots').select('*').order('created_at', { ascending: false }),
        supabase.from('bot_accounts').select('*').order('created_at', { ascending: false }),
        supabase.from('bot_trades').select('*').order('timestamp', { ascending: false }),
        supabase.from('bot_backtest_data').select('*').order('period_end', { ascending: false }),
      ]);

      // Check for table not existing errors (code 42P01 or message contains "relation")
      const checkTableError = (res: { error: { message?: string; code?: string } | null }) => {
        if (res.error) {
          const msg = res.error.message || '';
          const code = res.error.code || '';
          if (code === '42P01' || msg.includes('relation') || msg.includes('does not exist')) {
            throw new Error('DATABASE_NOT_SETUP');
          }
          throw res.error;
        }
      };

      checkTableError(botsRes);
      checkTableError(accountsRes);
      checkTableError(tradesRes);
      checkTableError(backtestRes);

      setBots(botsRes.data || []);
      setBotAccounts(accountsRes.data || []);
      setBotTrades(tradesRes.data || []);
      setBacktestData(backtestRes.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';
      if (message === 'DATABASE_NOT_SETUP') {
        setError('Database tables not found. Please run supabase/schema.sql in your Supabase SQL Editor.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial fetch and real-time subscriptions
  useEffect(() => {
    if (!isSupabaseConfigured() || !user) {
      setLoading(false);
      return;
    }

    fetchData();

    // Set up real-time subscriptions
    const channels: RealtimeChannel[] = [];

    if (supabase) {
      const botsChannel = supabase
        .channel('bots-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bots' }, () => fetchData())
        .subscribe();
      channels.push(botsChannel);

      const accountsChannel = supabase
        .channel('bot-accounts-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_accounts' }, () => fetchData())
        .subscribe();
      channels.push(accountsChannel);

      const tradesChannel = supabase
        .channel('bot-trades-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_trades' }, () => fetchData())
        .subscribe();
      channels.push(tradesChannel);

      const backtestChannel = supabase
        .channel('backtest-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_backtest_data' }, () => fetchData())
        .subscribe();
      channels.push(backtestChannel);
    }

    return () => {
      channels.forEach(channel => supabase?.removeChannel(channel));
    };
  }, [user, fetchData]);

  // ── Bot CRUD ──────────────────────────────────────────────────

  const addBot = useCallback(async (bot: BotFormData): Promise<Bot | null> => {
    if (!supabase || !user) return null;

    const { data, error } = await supabase
      .from('bots')
      .insert({ ...bot, created_by: user.id })
      .select()
      .single();

    if (error) {
      setError(error.message);
      return null;
    }

    setBots(prev => [data, ...prev]);
    return data;
  }, [user]);

  const updateBot = useCallback(async (id: string, updates: Partial<BotFormData>) => {
    if (!supabase) return;

    const { error } = await supabase
      .from('bots')
      .update(updates)
      .eq('id', id);

    if (error) {
      setError(error.message);
      return;
    }

    setBots(prev => prev.map(b => b.id === id ? { ...b, ...updates } as Bot : b));
  }, []);

  const deleteBot = useCallback(async (id: string) => {
    if (!supabase) return;

    const { error } = await supabase
      .from('bots')
      .delete()
      .eq('id', id);

    if (error) {
      setError(error.message);
      return;
    }

    setBots(prev => prev.filter(b => b.id !== id));
  }, []);

  // ── Bot Account CRUD ──────────────────────────────────────────

  const addBotAccount = useCallback(async (account: BotAccountFormData): Promise<BotAccount | null> => {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('bot_accounts')
      .insert(account)
      .select()
      .single();

    if (error) {
      setError(error.message);
      return null;
    }

    setBotAccounts(prev => [data, ...prev]);
    return data;
  }, []);

  const updateBotAccount = useCallback(async (id: string, updates: Partial<BotAccountFormData>) => {
    if (!supabase) return;

    const { error } = await supabase
      .from('bot_accounts')
      .update(updates)
      .eq('id', id);

    if (error) {
      setError(error.message);
      return;
    }

    setBotAccounts(prev => prev.map(a => a.id === id ? { ...a, ...updates } as BotAccount : a));
  }, []);

  const deleteBotAccount = useCallback(async (id: string) => {
    if (!supabase) return;

    const { error } = await supabase
      .from('bot_accounts')
      .delete()
      .eq('id', id);

    if (error) {
      setError(error.message);
      return;
    }

    setBotAccounts(prev => prev.filter(a => a.id !== id));
  }, []);

  // ── Bot Trade CRUD ────────────────────────────────────────────

  const addBotTrade = useCallback(async (trade: BotTradeFormData): Promise<BotTrade | null> => {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('bot_trades')
      .insert(trade)
      .select()
      .single();

    if (error) {
      setError(error.message);
      return null;
    }

    setBotTrades(prev => [data, ...prev]);

    // Update account balance if trade is closed and has an account
    if (trade.status === 'closed' && trade.bot_account_id && trade.pnl) {
      const account = botAccounts.find(a => a.id === trade.bot_account_id);
      if (account) {
        const newBalance = account.current_balance + trade.pnl;
        const newHWM = Math.max(account.high_water_mark, newBalance);
        await supabase
          .from('bot_accounts')
          .update({ current_balance: newBalance, high_water_mark: newHWM })
          .eq('id', account.id);
        setBotAccounts(prev => prev.map(a =>
          a.id === account.id ? { ...a, current_balance: newBalance, high_water_mark: newHWM } : a
        ));
      }
    }

    return data;
  }, [botAccounts]);

  const updateBotTrade = useCallback(async (id: string, updates: Partial<BotTradeFormData>) => {
    if (!supabase) return;

    const existingTrade = botTrades.find(t => t.id === id);

    const { error } = await supabase
      .from('bot_trades')
      .update(updates)
      .eq('id', id);

    if (error) {
      setError(error.message);
      return;
    }

    setBotTrades(prev => prev.map(t => t.id === id ? { ...t, ...updates } as BotTrade : t));

    // Handle balance changes on account
    if (existingTrade?.bot_account_id) {
      const account = botAccounts.find(a => a.id === existingTrade.bot_account_id);
      if (account) {
        const oldPnl = existingTrade.status === 'closed' ? (existingTrade.pnl || 0) : 0;
        const newStatus = updates.status ?? existingTrade.status;
        const newTradePnl = updates.pnl ?? existingTrade.pnl ?? 0;
        const newPnlContribution = newStatus === 'closed' ? newTradePnl : 0;

        if (oldPnl !== newPnlContribution) {
          const pnlDiff = newPnlContribution - oldPnl;
          const newBalance = account.current_balance + pnlDiff;
          const newHWM = Math.max(account.high_water_mark, newBalance);
          await supabase
            .from('bot_accounts')
            .update({ current_balance: newBalance, high_water_mark: newHWM })
            .eq('id', account.id);
          setBotAccounts(prev => prev.map(a =>
            a.id === account.id ? { ...a, current_balance: newBalance, high_water_mark: newHWM } : a
          ));
        }
      }
    }
  }, [botAccounts, botTrades]);

  const deleteBotTrade = useCallback(async (id: string) => {
    if (!supabase) return;

    const existingTrade = botTrades.find(t => t.id === id);

    const { error } = await supabase
      .from('bot_trades')
      .delete()
      .eq('id', id);

    if (error) {
      setError(error.message);
      return;
    }

    setBotTrades(prev => prev.filter(t => t.id !== id));

    // Subtract P&L from account if trade was closed
    if (existingTrade?.bot_account_id && existingTrade.status === 'closed' && existingTrade.pnl) {
      const account = botAccounts.find(a => a.id === existingTrade.bot_account_id);
      if (account) {
        const newBalance = account.current_balance - existingTrade.pnl;
        await supabase
          .from('bot_accounts')
          .update({ current_balance: newBalance })
          .eq('id', account.id);
        setBotAccounts(prev => prev.map(a =>
          a.id === account.id ? { ...a, current_balance: newBalance } : a
        ));
      }
    }
  }, [botAccounts, botTrades]);

  // ── Backtest Data CRUD ────────────────────────────────────────

  const addBacktestData = useCallback(async (data: BotBacktestFormData): Promise<BotBacktestData | null> => {
    if (!supabase) return null;

    const { data: result, error } = await supabase
      .from('bot_backtest_data')
      .insert(data)
      .select()
      .single();

    if (error) {
      setError(error.message);
      return null;
    }

    setBacktestData(prev => [result, ...prev]);
    return result;
  }, []);

  const updateBacktestData = useCallback(async (id: string, updates: Partial<BotBacktestFormData>) => {
    if (!supabase) {
      console.error('updateBacktestData: supabase not available');
      return;
    }

    console.log('updateBacktestData:', id, updates);

    const { data, error } = await supabase
      .from('bot_backtest_data')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('updateBacktestData error:', error);
      setError(error.message);
      return;
    }

    console.log('updateBacktestData success:', data);
    setBacktestData(prev => prev.map(d => d.id === id ? { ...d, ...updates } as BotBacktestData : d));
  }, [supabase]);

  const deleteBacktestData = useCallback(async (id: string) => {
    if (!supabase) return;

    const { error } = await supabase
      .from('bot_backtest_data')
      .delete()
      .eq('id', id);

    if (error) {
      setError(error.message);
      return;
    }

    setBacktestData(prev => prev.filter(d => d.id !== id));
  }, []);

  // ── Load KLBS Demo Data ──────────────────────────────────────

  const loadKLBSDemo = useCallback(async () => {
    if (!supabase || !user) return;

    setLoading(true);
    setError(null);

    try {
      // Create KLBS bots for each instrument
      const instruments = ['MNQ', 'MES', 'MGC'] as const;

      for (const instrument of instruments) {
        // Check if bot already exists
        let existingBot = bots.find(b => b.name === 'KLBS Bot' && b.instrument === instrument);
        let botId = existingBot?.id;

        if (!existingBot) {
          // Create bot
          const { data: bot, error: botError } = await supabase
            .from('bots')
            .insert({
              created_by: user.id,
              name: 'KLBS Bot',
              version: 'v1.0',
              instrument,
              default_contracts: instrument === 'MNQ' ? 2 : instrument === 'MES' ? 4 : 1,
              description: `Key Level Breakout System for ${instrument}. Retest entries on PDH/PDL/PMH/PML/LPH/LPL.`,
              strategy_notes: `Sessions: London 03:00-08:00, NY 09:30-16:00 ET\nEntry: Retest zone (0.15-0.35 of level distance)\nExit: Fixed TP 50pts, SL 25pts (2:1 R:R)\nNo trades during Dead Zone 08:00-09:30`,
              status: 'active',
            })
            .select()
            .single();

          if (botError) throw botError;
          botId = bot.id;
        }

        // Check if backtest data exists for this bot
        const existingBacktest = backtestData.find(bt => bt.bot_id === botId);
        if (existingBacktest) continue;

        // Add backtest data for this bot
        const btData = KLBS_BACKTEST_DATA[instrument];
        const { error: btError } = await supabase
          .from('bot_backtest_data')
          .insert({
            bot_id: botId,
            period_start: '2018-01-01',
            period_end: '2024-08-31',
            total_trades: btData.total_trades,
            win_count: btData.win_count,
            loss_count: btData.loss_count,
            gross_pnl: btData.gross_pnl,
            net_pnl: btData.net_pnl,
            max_drawdown: btData.max_drawdown,
            max_daily_drawdown: btData.max_daily_drawdown,
            avg_winner: btData.avg_winner,
            avg_loser: btData.avg_loser,
            largest_winner: btData.largest_winner,
            largest_loser: btData.largest_loser,
            avg_rr_ratio: btData.avg_rr_ratio,
            contract_size: 1,
            notes: `Validated backtest from Databento 1-minute bars. ${btData.total_trades} trades over 6.7 years.`,
          });

        if (btError) throw btError;
      }

      // Refresh data to show new bots
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load demo data');
    } finally {
      setLoading(false);
    }
  }, [user, bots, backtestData, fetchData]);

  // ── Helpers ───────────────────────────────────────────────────

  const getBotById = useCallback((id: string) => bots.find(b => b.id === id), [bots]);
  const getAccountsForBot = useCallback((botId: string) => botAccounts.filter(a => a.bot_id === botId), [botAccounts]);
  const getTradesForBot = useCallback((botId: string) => botTrades.filter(t => t.bot_id === botId), [botTrades]);
  const getTradesForAccount = useCallback((accountId: string) => botTrades.filter(t => t.bot_account_id === accountId), [botTrades]);
  const getBacktestForBot = useCallback((botId: string) => backtestData.filter(d => d.bot_id === botId), [backtestData]);

  return (
    <BotContext.Provider
      value={{
        bots,
        botAccounts,
        botTrades,
        backtestData,
        loading,
        error,
        addBot,
        updateBot,
        deleteBot,
        addBotAccount,
        updateBotAccount,
        deleteBotAccount,
        addBotTrade,
        updateBotTrade,
        deleteBotTrade,
        addBacktestData,
        updateBacktestData,
        deleteBacktestData,
        getBotById,
        getAccountsForBot,
        getTradesForBot,
        getTradesForAccount,
        getBacktestForBot,
        refreshData: fetchData,
        loadKLBSDemo,
      }}
    >
      {children}
    </BotContext.Provider>
  );
}

export function useBots(): BotContextValue {
  const ctx = useContext(BotContext);
  if (!ctx) throw new Error('useBots must be used within a BotProvider');
  return ctx;
}
