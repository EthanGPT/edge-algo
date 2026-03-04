import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import type { Payout, Expense, Account, PropFirm, DailyEntry, TradingSetup, Trade } from '@/types';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'not_configured' | 'not_authenticated';

interface JournalContextValue {
  // Data
  payouts: Payout[];
  expenses: Expense[];
  accounts: Account[];
  propFirms: PropFirm[];
  dailyEntries: DailyEntry[];
  tradingSetups: TradingSetup[];
  trades: Trade[];
  loading: boolean;
  error: string | null;
  syncStatus: SyncStatus;

  // Payouts
  addPayout: (payout: Omit<Payout, 'id'>) => Promise<void>;
  updatePayout: (payout: Payout) => Promise<void>;
  deletePayout: (id: string) => Promise<void>;

  // Expenses
  addExpense: (expense: Omit<Expense, 'id'>) => Promise<void>;
  updateExpense: (expense: Expense) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;

  // Accounts
  addAccount: (account: Omit<Account, 'id'>) => Promise<void>;
  updateAccount: (account: Account) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;

  // Prop Firms
  addPropFirm: (firm: Omit<PropFirm, 'id'>) => Promise<void>;
  updatePropFirm: (firm: PropFirm) => Promise<void>;
  deletePropFirm: (id: string) => Promise<void>;

  // Daily Entries
  upsertDailyEntry: (entry: Omit<DailyEntry, 'id'>) => Promise<void>;
  deleteDailyEntry: (id: string) => Promise<void>;

  // Trading Setups
  addTradingSetup: (setup: Omit<TradingSetup, 'id'>) => Promise<void>;
  updateTradingSetup: (setup: TradingSetup) => Promise<void>;
  deleteTradingSetup: (id: string) => Promise<void>;

  // Trades
  addTrade: (trade: Omit<Trade, 'id'>) => Promise<void>;
  updateTrade: (trade: Trade) => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;

  // Import from localStorage
  importFromLocalStorage: (data: {
    trades?: Trade[];
    accounts?: Account[];
    payouts?: Payout[];
    expenses?: Expense[];
    dailyEntries?: DailyEntry[];
    tradingSetups?: TradingSetup[];
    propFirms?: PropFirm[];
  }) => Promise<void>;

  refreshData: () => Promise<void>;
}

const JournalContext = createContext<JournalContextValue | null>(null);

// Helper to convert camelCase to snake_case for DB
function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = obj[key];
  }
  return result;
}

// Helper to convert snake_case to camelCase from DB
function toCamelCase<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result as T;
}

export function JournalProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [propFirms, setPropFirms] = useState<PropFirm[]>([]);
  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [tradingSetups, setTradingSetups] = useState<TradingSetup[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  // Fetch all data from Supabase
  const fetchData = useCallback(async () => {
    if (!supabase || !user) {
      setLoading(false);
      setSyncStatus(!isSupabaseConfigured() ? 'not_configured' : 'not_authenticated');
      return;
    }

    try {
      setLoading(true);
      setSyncStatus('syncing');
      setError(null);

      const [
        payoutsRes,
        expensesRes,
        accountsRes,
        propFirmsRes,
        dailyEntriesRes,
        setupsRes,
        tradesRes,
      ] = await Promise.all([
        supabase.from('journal_payouts').select('*').order('date', { ascending: false }),
        supabase.from('journal_expenses').select('*').order('date', { ascending: false }),
        supabase.from('journal_accounts').select('*').order('start_date', { ascending: false }),
        supabase.from('journal_prop_firms').select('*').order('name'),
        supabase.from('journal_daily_entries').select('*').order('date', { ascending: false }),
        supabase.from('journal_setups').select('*').order('name'),
        supabase.from('journal_trades').select('*').order('date', { ascending: false }),
      ]);

      // Check for table not existing errors
      const checkTableError = (res: { error: { message?: string; code?: string } | null }, tableName: string) => {
        if (res.error) {
          const msg = res.error.message || '';
          const code = res.error.code || '';
          if (code === '42P01' || msg.includes('relation') || msg.includes('does not exist')) {
            throw new Error(`JOURNAL_TABLES_NOT_SETUP: ${tableName}`);
          }
          throw res.error;
        }
      };

      checkTableError(payoutsRes, 'journal_payouts');
      checkTableError(expensesRes, 'journal_expenses');
      checkTableError(accountsRes, 'journal_accounts');
      checkTableError(propFirmsRes, 'journal_prop_firms');
      checkTableError(dailyEntriesRes, 'journal_daily_entries');
      checkTableError(setupsRes, 'journal_setups');
      checkTableError(tradesRes, 'journal_trades');

      setPayouts((payoutsRes.data || []).map(r => toCamelCase<Payout>(r)));
      setExpenses((expensesRes.data || []).map(r => toCamelCase<Expense>(r)));
      setAccounts((accountsRes.data || []).map(r => toCamelCase<Account>(r)));
      setPropFirms((propFirmsRes.data || []).map(r => toCamelCase<PropFirm>(r)));
      setDailyEntries((dailyEntriesRes.data || []).map(r => toCamelCase<DailyEntry>(r)));
      setTradingSetups((setupsRes.data || []).map(r => toCamelCase<TradingSetup>(r)));
      setTrades((tradesRes.data || []).map(r => toCamelCase<Trade>(r)));
      setSyncStatus('synced');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';
      if (message.includes('JOURNAL_TABLES_NOT_SETUP')) {
        setError('Journal tables not found. Please run supabase/journal_schema.sql in your Supabase SQL Editor.');
      } else {
        setError(message);
      }
      setSyncStatus('error');
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
      const tables = [
        'journal_payouts', 'journal_expenses', 'journal_accounts',
        'journal_prop_firms', 'journal_daily_entries', 'journal_setups', 'journal_trades'
      ];
      tables.forEach(table => {
        const channel = supabase
          .channel(`${table}-changes`)
          .on('postgres_changes', { event: '*', schema: 'public', table }, () => fetchData())
          .subscribe();
        channels.push(channel);
      });
    }

    return () => {
      channels.forEach(channel => supabase?.removeChannel(channel));
    };
  }, [user, fetchData]);

  // ── Payouts ──────────────────────────────────────────────────
  const addPayout = useCallback(async (payout: Omit<Payout, 'id'>) => {
    if (!supabase || !user) return;
    const { error } = await supabase.from('journal_payouts').insert({
      user_id: user.id,
      ...toSnakeCase(payout as Record<string, unknown>),
    });
    if (error) setError(error.message);
  }, [user]);

  const updatePayout = useCallback(async (payout: Payout) => {
    if (!supabase) return;
    const { id, ...rest } = payout;
    const { error } = await supabase.from('journal_payouts').update(toSnakeCase(rest as Record<string, unknown>)).eq('id', id);
    if (error) setError(error.message);
  }, []);

  const deletePayout = useCallback(async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('journal_payouts').delete().eq('id', id);
    if (error) setError(error.message);
  }, []);

  // ── Expenses ─────────────────────────────────────────────────
  const addExpense = useCallback(async (expense: Omit<Expense, 'id'>) => {
    if (!supabase || !user) return;
    const { error } = await supabase.from('journal_expenses').insert({
      user_id: user.id,
      ...toSnakeCase(expense as Record<string, unknown>),
    });
    if (error) setError(error.message);
  }, [user]);

  const updateExpense = useCallback(async (expense: Expense) => {
    if (!supabase) return;
    const { id, ...rest } = expense;
    const { error } = await supabase.from('journal_expenses').update(toSnakeCase(rest as Record<string, unknown>)).eq('id', id);
    if (error) setError(error.message);
  }, []);

  const deleteExpense = useCallback(async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('journal_expenses').delete().eq('id', id);
    if (error) setError(error.message);
  }, []);

  // ── Accounts ─────────────────────────────────────────────────
  const addAccount = useCallback(async (account: Omit<Account, 'id'>) => {
    if (!supabase || !user) return;
    const { error } = await supabase.from('journal_accounts').insert({
      user_id: user.id,
      ...toSnakeCase(account as Record<string, unknown>),
    });
    if (error) setError(error.message);
  }, [user]);

  const updateAccount = useCallback(async (account: Account) => {
    if (!supabase) return;
    const { id, ...rest } = account;
    const { error } = await supabase.from('journal_accounts').update(toSnakeCase(rest as Record<string, unknown>)).eq('id', id);
    if (error) setError(error.message);
  }, []);

  const deleteAccount = useCallback(async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('journal_accounts').delete().eq('id', id);
    if (error) setError(error.message);
  }, []);

  // ── Prop Firms ───────────────────────────────────────────────
  const addPropFirm = useCallback(async (firm: Omit<PropFirm, 'id'>) => {
    if (!supabase || !user) return;
    const { error } = await supabase.from('journal_prop_firms').insert({
      user_id: user.id,
      ...toSnakeCase(firm as Record<string, unknown>),
    });
    if (error) setError(error.message);
  }, [user]);

  const updatePropFirm = useCallback(async (firm: PropFirm) => {
    if (!supabase) return;
    const { id, ...rest } = firm;
    const { error } = await supabase.from('journal_prop_firms').update(toSnakeCase(rest as Record<string, unknown>)).eq('id', id);
    if (error) setError(error.message);
  }, []);

  const deletePropFirm = useCallback(async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('journal_prop_firms').delete().eq('id', id);
    if (error) setError(error.message);
  }, []);

  // ── Daily Entries ────────────────────────────────────────────
  const upsertDailyEntry = useCallback(async (entry: Omit<DailyEntry, 'id'>) => {
    if (!supabase || !user) return;
    const { error } = await supabase.from('journal_daily_entries').upsert({
      user_id: user.id,
      ...toSnakeCase(entry as Record<string, unknown>),
    }, { onConflict: 'user_id,date' });
    if (error) setError(error.message);
  }, [user]);

  const deleteDailyEntry = useCallback(async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('journal_daily_entries').delete().eq('id', id);
    if (error) setError(error.message);
  }, []);

  // ── Trading Setups ───────────────────────────────────────────
  const addTradingSetup = useCallback(async (setup: Omit<TradingSetup, 'id'>) => {
    if (!supabase || !user) return;
    const { error } = await supabase.from('journal_setups').insert({
      user_id: user.id,
      ...toSnakeCase(setup as Record<string, unknown>),
    });
    if (error) setError(error.message);
  }, [user]);

  const updateTradingSetup = useCallback(async (setup: TradingSetup) => {
    if (!supabase) return;
    const { id, ...rest } = setup;
    const { error } = await supabase.from('journal_setups').update(toSnakeCase(rest as Record<string, unknown>)).eq('id', id);
    if (error) setError(error.message);
  }, []);

  const deleteTradingSetup = useCallback(async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('journal_setups').delete().eq('id', id);
    if (error) setError(error.message);
  }, []);

  // ── Trades ───────────────────────────────────────────────────
  const addTrade = useCallback(async (trade: Omit<Trade, 'id'>) => {
    if (!supabase || !user) return;
    const { error } = await supabase.from('journal_trades').insert({
      user_id: user.id,
      ...toSnakeCase(trade as Record<string, unknown>),
    });
    if (error) setError(error.message);
  }, [user]);

  const updateTrade = useCallback(async (trade: Trade) => {
    if (!supabase) return;
    const { id, ...rest } = trade;
    const { error } = await supabase.from('journal_trades').update(toSnakeCase(rest as Record<string, unknown>)).eq('id', id);
    if (error) setError(error.message);
  }, []);

  const deleteTrade = useCallback(async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('journal_trades').delete().eq('id', id);
    if (error) setError(error.message);
  }, []);

  // ── Import from localStorage ─────────────────────────────────
  const importFromLocalStorage = useCallback(async (data: {
    trades?: Trade[];
    accounts?: Account[];
    payouts?: Payout[];
    expenses?: Expense[];
    dailyEntries?: DailyEntry[];
    tradingSetups?: TradingSetup[];
    propFirms?: PropFirm[];
  }) => {
    if (!supabase || !user) {
      setError('Not authenticated');
      return;
    }

    setLoading(true);
    setSyncStatus('syncing');
    setError(null);

    try {
      // Import in order: setups, prop firms, accounts, then trades (due to references)
      if (data.tradingSetups?.length) {
        const setups = data.tradingSetups.map(s => ({
          id: s.id,
          user_id: user.id,
          name: s.name,
          description: s.description,
          rules: s.rules,
        }));
        const { error } = await supabase.from('journal_setups').upsert(setups, { onConflict: 'id' });
        if (error) throw error;
      }

      if (data.propFirms?.length) {
        const firms = data.propFirms.map(f => ({
          id: f.id,
          user_id: user.id,
          name: f.name,
          website: f.website,
          notes: f.notes,
          rating: f.rating,
          total_payouts: f.totalPayouts,
        }));
        const { error } = await supabase.from('journal_prop_firms').upsert(firms, { onConflict: 'id' });
        if (error) throw error;
      }

      if (data.accounts?.length) {
        const accts = data.accounts.map(a => ({
          id: a.id,
          user_id: user.id,
          type: a.type,
          prop_firm: a.propFirm,
          account_size: a.accountSize,
          start_date: a.startDate,
          status: a.status,
          end_date: a.endDate,
          profit_loss: a.profitLoss,
          max_drawdown: a.maxDrawdown,
          profit_target: a.profitTarget,
          notes: a.notes,
        }));
        const { error } = await supabase.from('journal_accounts').upsert(accts, { onConflict: 'id' });
        if (error) throw error;
      }

      if (data.payouts?.length) {
        const payouts = data.payouts.map(p => ({
          id: p.id,
          user_id: user.id,
          date: p.date,
          amount: p.amount,
          prop_firm: p.propFirm,
          method: p.method,
          notes: p.notes,
        }));
        const { error } = await supabase.from('journal_payouts').upsert(payouts, { onConflict: 'id' });
        if (error) throw error;
      }

      if (data.expenses?.length) {
        const expenses = data.expenses.map(e => ({
          id: e.id,
          user_id: user.id,
          date: e.date,
          amount: e.amount,
          category: e.category,
          prop_firm: e.propFirm,
          notes: e.notes,
        }));
        const { error } = await supabase.from('journal_expenses').upsert(expenses, { onConflict: 'id' });
        if (error) throw error;
      }

      if (data.dailyEntries?.length) {
        const entries = data.dailyEntries.map(d => ({
          id: d.id,
          user_id: user.id,
          date: d.date,
          pnl: d.pnl,
          notes: d.notes,
        }));
        const { error } = await supabase.from('journal_daily_entries').upsert(entries, { onConflict: 'id' });
        if (error) throw error;
      }

      if (data.trades?.length) {
        const trades = data.trades.map(t => ({
          id: t.id,
          user_id: user.id,
          date: t.date,
          time: t.time,
          instrument: t.instrument,
          setup_id: t.setupId,
          account_id: t.accountId,
          direction: t.direction,
          entry: t.entry,
          exit: t.exit,
          stop_loss: t.stopLoss,
          take_profit: t.takeProfit,
          contracts: t.contracts,
          pnl: t.pnl,
          result: t.result,
          risk_reward: t.riskReward,
          rating: t.rating,
          notes: t.notes,
        }));
        const { error } = await supabase.from('journal_trades').upsert(trades, { onConflict: 'id' });
        if (error) throw error;
      }

      await fetchData();
      setSyncStatus('synced');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setSyncStatus('error');
    } finally {
      setLoading(false);
    }
  }, [user, fetchData]);

  return (
    <JournalContext.Provider
      value={{
        payouts, expenses, accounts, propFirms, dailyEntries, tradingSetups, trades,
        loading, error, syncStatus,
        addPayout, updatePayout, deletePayout,
        addExpense, updateExpense, deleteExpense,
        addAccount, updateAccount, deleteAccount,
        addPropFirm, updatePropFirm, deletePropFirm,
        upsertDailyEntry, deleteDailyEntry,
        addTradingSetup, updateTradingSetup, deleteTradingSetup,
        addTrade, updateTrade, deleteTrade,
        importFromLocalStorage,
        refreshData: fetchData,
      }}
    >
      {children}
    </JournalContext.Provider>
  );
}

export function useJournal(): JournalContextValue {
  const ctx = useContext(JournalContext);
  if (!ctx) throw new Error('useJournal must be used within a JournalProvider');
  return ctx;
}
