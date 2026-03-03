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
}

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
    return data;
  }, []);

  const updateBotTrade = useCallback(async (id: string, updates: Partial<BotTradeFormData>) => {
    if (!supabase) return;

    const { error } = await supabase
      .from('bot_trades')
      .update(updates)
      .eq('id', id);

    if (error) {
      setError(error.message);
      return;
    }

    setBotTrades(prev => prev.map(t => t.id === id ? { ...t, ...updates } as BotTrade : t));
  }, []);

  const deleteBotTrade = useCallback(async (id: string) => {
    if (!supabase) return;

    const { error } = await supabase
      .from('bot_trades')
      .delete()
      .eq('id', id);

    if (error) {
      setError(error.message);
      return;
    }

    setBotTrades(prev => prev.filter(t => t.id !== id));
  }, []);

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
    if (!supabase) return;

    const { error } = await supabase
      .from('bot_backtest_data')
      .update(updates)
      .eq('id', id);

    if (error) {
      setError(error.message);
      return;
    }

    setBacktestData(prev => prev.map(d => d.id === id ? { ...d, ...updates } as BotBacktestData : d));
  }, []);

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
