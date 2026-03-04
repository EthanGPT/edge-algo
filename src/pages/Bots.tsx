import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Bot, Play, Pause, Archive, ChevronRight, AlertCircle } from "lucide-react";
import { useBots } from "@/context/BotContext";
import { useAuth } from "@/context/AuthContext";
import type { Bot as BotType, BotStatus, BotFormData, BotBacktestData } from "@/types/bots";
import { BOT_INSTRUMENTS } from "@/types/bots";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { LoginForm } from "@/components/auth/LoginForm";

const statusConfig = {
  active: { icon: Play, color: 'text-success', bg: 'bg-success/10', label: 'Active' },
  paused: { icon: Pause, color: 'text-warning', bg: 'bg-warning/10', label: 'Paused' },
  retired: { icon: Archive, color: 'text-muted-foreground', bg: 'bg-secondary', label: 'Retired' },
} as const;

const Bots = () => {
  const { user, isConfigured } = useAuth();
  const { bots, botAccounts, botTrades, backtestData, addBot, updateBot, deleteBot, addBacktestData, loading, error } = useBots();
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBot, setEditingBot] = useState<BotType | null>(null);

  // If Supabase not configured, show setup message
  if (!isConfigured) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-12 w-12 text-warning" />
        <h2 className="text-xl font-semibold">Supabase Not Configured</h2>
        <p className="text-muted-foreground text-center max-w-md">
          To use the collaborative bot tracking feature, you need to set up Supabase.
          Add <code className="bg-secondary px-1 rounded">VITE_SUPABASE_URL</code> and{" "}
          <code className="bg-secondary px-1 rounded">VITE_SUPABASE_ANON_KEY</code> to your environment.
        </p>
      </div>
    );
  }

  // If not logged in, show login form
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Bot Tracking</h2>
          <p className="text-muted-foreground">Sign in to access collaborative bot tracking</p>
        </div>
        <LoginForm />
      </div>
    );
  }

  const activeBots = bots.filter(b => b.status === 'active');
  const pausedBots = bots.filter(b => b.status === 'paused');
  const retiredBots = bots.filter(b => b.status === 'retired');

  // Calculate stats for each bot
  const getBotStats = (bot: BotType) => {
    const accounts = botAccounts.filter(a => a.bot_id === bot.id);
    const trades = botTrades.filter(t => t.bot_id === bot.id && t.status === 'closed');
    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winCount = trades.filter(t => (t.pnl || 0) > 0).length;
    const winRate = trades.length > 0 ? Math.round((winCount / trades.length) * 100) : 0;
    return { accounts: accounts.length, trades: trades.length, totalPnl, winRate };
  };

  const handleSave = async (data: BotFormData, backtestInput?: { period_start: string; period_end: string; total_trades: number; win_count: number; loss_count: number; net_pnl: number; max_drawdown: number; avg_winner: number; avg_loser: number; contract_size: number }) => {
    if (editingBot) {
      await updateBot(editingBot.id, data);
    } else {
      const newBot = await addBot(data);
      // Add backtest data if provided
      if (newBot && backtestInput && backtestInput.total_trades > 0) {
        await addBacktestData({
          bot_id: newBot.id,
          period_start: backtestInput.period_start,
          period_end: backtestInput.period_end,
          total_trades: backtestInput.total_trades,
          win_count: backtestInput.win_count,
          loss_count: backtestInput.loss_count,
          gross_pnl: backtestInput.net_pnl,
          net_pnl: backtestInput.net_pnl,
          max_drawdown: backtestInput.max_drawdown,
          max_daily_drawdown: backtestInput.max_drawdown * 0.4, // Estimate
          avg_winner: backtestInput.avg_winner,
          avg_loser: backtestInput.avg_loser,
          largest_winner: backtestInput.avg_winner * 3, // Estimate
          largest_loser: backtestInput.avg_loser * 2, // Estimate
          avg_rr_ratio: backtestInput.avg_loser > 0 ? backtestInput.avg_winner / backtestInput.avg_loser : 1,
          contract_size: backtestInput.contract_size,
          notes: '',
        });
      }
    }
    setIsDialogOpen(false);
    setEditingBot(null);
  };

  // Get backtest for editing bot
  const getExistingBacktest = (botId: string) => {
    return backtestData.find(b => b.bot_id === botId) || null;
  };

  const renderBotCard = (bot: BotType) => {
    const config = statusConfig[bot.status];
    const StatusIcon = config.icon;
    const stats = getBotStats(bot);

    return (
      <div
        key={bot.id}
        className="stat-card group relative cursor-pointer hover:border-accent/50 transition-colors"
        onClick={() => navigate(`/bots/${bot.id}`)}
      >
        <div className="absolute right-4 top-4 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); setEditingBot(bot); setIsDialogOpen(true); }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); deleteBot(bot.id); }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>

        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
              <Bot className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">{bot.name}</h3>
              <p className="text-sm text-muted-foreground">{bot.version} • {bot.instrument}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusIcon className={cn("h-3.5 w-3.5", config.color)} />
            <span className={cn("text-sm font-medium", config.color)}>{config.label}</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">{bot.default_contracts}</p>
            <p className="text-xs text-muted-foreground">Contracts</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{stats.accounts}</p>
            <p className="text-xs text-muted-foreground">Accounts</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{stats.trades}</p>
            <p className="text-xs text-muted-foreground">Trades</p>
          </div>
          <div>
            <p className={cn("text-2xl font-bold", stats.totalPnl >= 0 ? "text-success" : "text-destructive")}>
              ${Math.abs(stats.totalPnl).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">P&L</p>
          </div>
        </div>

        {bot.description && (
          <p className="mt-4 text-sm text-muted-foreground line-clamp-2">{bot.description}</p>
        )}

        <div className="mt-4 flex items-center justify-end text-sm text-muted-foreground">
          <span>View details</span>
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Trading Bots</h1>
          <p className="page-subtitle">Manage and track your algorithmic trading bots</p>
        </div>
        <Button onClick={() => { setEditingBot(null); setIsDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="mr-2 h-4 w-4" />
          Add Bot
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <p className="font-medium text-destructive">Error loading bot data</p>
              <p className="text-sm text-destructive/80 mt-1">{error}</p>
              {error.includes('schema.sql') && (
                <p className="text-sm text-muted-foreground mt-2">
                  Go to your Supabase Dashboard → SQL Editor → paste the contents of <code className="bg-secondary px-1 rounded">supabase/schema.sql</code> and run it.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBot ? 'Edit Bot' : 'Add New Bot'}</DialogTitle>
          </DialogHeader>
          <BotForm
            onClose={() => { setIsDialogOpen(false); setEditingBot(null); }}
            onSave={handleSave}
            initialData={editingBot}
            existingBacktest={editingBot ? getExistingBacktest(editingBot.id) : null}
          />
        </DialogContent>
      </Dialog>

      {/* Stats Summary */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="stat-card text-center">
          <p className="text-4xl font-bold">{bots.length}</p>
          <p className="text-sm text-muted-foreground">Total Bots</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-4xl font-bold text-success">{activeBots.length}</p>
          <p className="text-sm text-muted-foreground">Active</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-4xl font-bold">{botAccounts.length}</p>
          <p className="text-sm text-muted-foreground">Linked Accounts</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-4xl font-bold">{botTrades.filter(t => t.status === 'closed').length}</p>
          <p className="text-sm text-muted-foreground">Total Trades</p>
        </div>
      </div>

      {/* Active Bots */}
      {activeBots.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-muted-foreground">Active Bots</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {activeBots.map(renderBotCard)}
          </div>
        </section>
      )}

      {/* Paused Bots */}
      {pausedBots.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-warning">Paused Bots</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {pausedBots.map(renderBotCard)}
          </div>
        </section>
      )}

      {/* Retired Bots */}
      {retiredBots.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-muted-foreground">Retired Bots</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {retiredBots.map(renderBotCard)}
          </div>
        </section>
      )}

      {/* Empty State */}
      {bots.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Bot className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">No bots yet</h3>
          <p className="text-muted-foreground mb-4 max-w-md">
            Create your first trading bot. You can include backtest data when creating the bot.
          </p>
          <Button onClick={() => setIsDialogOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="mr-2 h-4 w-4" />
            Add Your First Bot
          </Button>
        </div>
      )}
    </div>
  );
};

// Bot Form Component with Backtest Data
interface BotFormProps {
  onClose: () => void;
  onSave: (data: BotFormData, backtestData?: BacktestInput) => void;
  initialData?: BotType | null;
  existingBacktest?: BotBacktestData | null;
}

interface BacktestInput {
  period_start: string;
  period_end: string;
  total_trades: number;
  win_count: number;
  loss_count: number;
  net_pnl: number;
  max_drawdown: number;
  avg_winner: number;
  avg_loser: number;
  contract_size: number;
}

function BotForm({ onClose, onSave, initialData, existingBacktest }: BotFormProps) {
  const [formData, setFormData] = useState<BotFormData>(
    initialData ? {
      name: initialData.name,
      version: initialData.version,
      instrument: initialData.instrument,
      default_contracts: initialData.default_contracts,
      description: initialData.description,
      strategy_notes: initialData.strategy_notes,
      status: initialData.status,
    } : {
      name: '',
      version: 'v1.0',
      instrument: 'MNQ',
      default_contracts: 1,
      description: '',
      strategy_notes: '',
      status: 'active' as BotStatus,
    }
  );

  const [includeBacktest, setIncludeBacktest] = useState(!!existingBacktest);
  const [backtest, setBacktest] = useState<BacktestInput>(
    existingBacktest ? {
      period_start: existingBacktest.period_start,
      period_end: existingBacktest.period_end,
      total_trades: existingBacktest.total_trades,
      win_count: existingBacktest.win_count,
      loss_count: existingBacktest.loss_count,
      net_pnl: existingBacktest.net_pnl,
      max_drawdown: existingBacktest.max_drawdown,
      avg_winner: existingBacktest.avg_winner,
      avg_loser: existingBacktest.avg_loser,
      contract_size: existingBacktest.contract_size,
    } : {
      period_start: '2018-01-01',
      period_end: '2024-08-31',
      total_trades: 0,
      win_count: 0,
      loss_count: 0,
      net_pnl: 0,
      max_drawdown: 0,
      avg_winner: 0,
      avg_loser: 0,
      contract_size: initialData?.default_contracts || 1,
    }
  );

  // Sync backtest contract_size when default_contracts changes
  const handleDefaultContractsChange = (contracts: number) => {
    setFormData({ ...formData, default_contracts: contracts });
    // Also update backtest contract_size if it matches the old value
    if (backtest.contract_size === formData.default_contracts) {
      setBacktest({ ...backtest, contract_size: contracts });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData, includeBacktest ? backtest : undefined);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Bot Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. KLBS Bot"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="version">Version</Label>
          <Input
            id="version"
            value={formData.version}
            onChange={(e) => setFormData({ ...formData, version: e.target.value })}
            placeholder="e.g. v1.0"
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="instrument">Instrument</Label>
          <Select value={formData.instrument} onValueChange={(v) => setFormData({ ...formData, instrument: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BOT_INSTRUMENTS.map((inst) => (
                <SelectItem key={inst} value={inst}>{inst}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="contracts">Default Contracts</Label>
          <Input
            id="contracts"
            type="number"
            min="1"
            value={formData.default_contracts}
            onChange={(e) => handleDefaultContractsChange(parseInt(e.target.value) || 1)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as BotStatus })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="retired">Retired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={formData.description || ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Brief description of the bot"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="strategy_notes">Strategy Notes</Label>
        <Textarea
          id="strategy_notes"
          value={formData.strategy_notes || ''}
          onChange={(e) => setFormData({ ...formData, strategy_notes: e.target.value })}
          placeholder="Entry/exit rules, key levels, parameters..."
          rows={3}
        />
      </div>

      {/* Backtest Data Section */}
      <div className="border-t pt-4 mt-4">
        <div className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            id="includeBacktest"
            checked={includeBacktest}
            onChange={(e) => setIncludeBacktest(e.target.checked)}
            className="rounded border-input"
          />
          <Label htmlFor="includeBacktest" className="text-sm font-medium cursor-pointer">
            Include Backtest Data
          </Label>
        </div>

        {includeBacktest && (
          <div className="space-y-4 p-4 rounded-lg bg-secondary/30">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Period Start</Label>
                <Input
                  type="date"
                  value={backtest.period_start}
                  onChange={(e) => setBacktest({ ...backtest, period_start: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Period End</Label>
                <Input
                  type="date"
                  value={backtest.period_end}
                  onChange={(e) => setBacktest({ ...backtest, period_end: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Total Trades</Label>
                <Input
                  type="number"
                  value={backtest.total_trades || ''}
                  onChange={(e) => setBacktest({ ...backtest, total_trades: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Wins</Label>
                <Input
                  type="number"
                  value={backtest.win_count || ''}
                  onChange={(e) => setBacktest({ ...backtest, win_count: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Losses</Label>
                <Input
                  type="number"
                  value={backtest.loss_count || ''}
                  onChange={(e) => setBacktest({ ...backtest, loss_count: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Net P&L ($)</Label>
                <Input
                  type="number"
                  value={backtest.net_pnl || ''}
                  onChange={(e) => setBacktest({ ...backtest, net_pnl: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max Drawdown ($)</Label>
                <Input
                  type="number"
                  value={backtest.max_drawdown || ''}
                  onChange={(e) => setBacktest({ ...backtest, max_drawdown: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Avg Winner ($)</Label>
                <Input
                  type="number"
                  value={backtest.avg_winner || ''}
                  onChange={(e) => setBacktest({ ...backtest, avg_winner: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Avg Loser ($)</Label>
                <Input
                  type="number"
                  value={backtest.avg_loser || ''}
                  onChange={(e) => setBacktest({ ...backtest, avg_loser: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Contract Size</Label>
                <Input
                  type="number"
                  min="1"
                  value={backtest.contract_size}
                  onChange={(e) => setBacktest({ ...backtest, contract_size: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90">
          {initialData ? 'Update' : 'Create'} Bot
        </Button>
      </div>
    </form>
  );
}

export default Bots;
