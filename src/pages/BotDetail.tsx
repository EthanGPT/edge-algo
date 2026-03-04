import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowLeft, Pencil, Trash2, Bot, Play, Pause, Archive,
  History, ExternalLink, Wallet, ArrowRightLeft, BarChart3
} from "lucide-react";
import { useBots } from "@/context/BotContext";
import { useAuth } from "@/context/AuthContext";
import type { BotFormData, BotBacktestData } from "@/types/bots";
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

const BotDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    getBotById, getAccountsForBot, getTradesForBot, getBacktestForBot,
    updateBot, deleteBot, deleteBacktestData, updateBacktestData,
    loading
  } = useBots();

  const [editBotDialogOpen, setEditBotDialogOpen] = useState(false);
  const [editingBacktest, setEditingBacktest] = useState<BotBacktestData | null>(null);

  const bot = getBotById(id || '');
  const accounts = getAccountsForBot(id || '');
  const trades = getTradesForBot(id || '');
  const backtestData = getBacktestForBot(id || '');

  // Calculate live performance metrics
  const liveMetrics = useMemo(() => {
    const closedTrades = trades.filter(t => t.status === 'closed');
    const wins = closedTrades.filter(t => (t.pnl || 0) > 0);
    const losses = closedTrades.filter(t => (t.pnl || 0) < 0);

    const grossPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const commissions = closedTrades.reduce((sum, t) => sum + (t.commission || 0), 0);
    const netPnl = grossPnl - commissions;

    const avgWinner = wins.length > 0 ? wins.reduce((sum, t) => sum + (t.pnl || 0), 0) / wins.length : 0;
    const avgLoser = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + (t.pnl || 0), 0) / losses.length) : 0;

    // Calculate drawdown (max peak-to-trough)
    let maxDD = 0;
    let peak = 0;
    let runningPnl = 0;
    const sortedTrades = [...closedTrades].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    for (const trade of sortedTrades) {
      runningPnl += trade.pnl || 0;
      if (runningPnl > peak) peak = runningPnl;
      const dd = peak - runningPnl;
      if (dd > maxDD) maxDD = dd;
    }

    // Profit factor
    const totalWins = wins.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalLosses = Math.abs(losses.reduce((sum, t) => sum + (t.pnl || 0), 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0;

    return {
      total_trades: closedTrades.length,
      win_count: wins.length,
      loss_count: losses.length,
      win_rate: closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0,
      net_pnl: netPnl,
      max_drawdown: maxDD,
      avg_winner: avgWinner,
      avg_loser: avgLoser,
      profit_factor: profitFactor,
    };
  }, [trades]);

  if (!user) {
    navigate('/bots');
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (!bot) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-xl font-semibold">Bot not found</h2>
        <Button onClick={() => navigate('/bots')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Bots
        </Button>
      </div>
    );
  }

  const statusConfig = {
    active: { icon: Play, color: 'text-success', label: 'Active' },
    paused: { icon: Pause, color: 'text-warning', label: 'Paused' },
    retired: { icon: Archive, color: 'text-muted-foreground', label: 'Retired' },
  };
  const StatusIcon = statusConfig[bot.status].icon;

  const handleDeleteBot = async () => {
    if (confirm('Delete this bot and all its data?')) {
      await deleteBot(bot.id);
      navigate('/bots');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/bots')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10">
              <Bot className="h-7 w-7 text-accent" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{bot.name}</h1>
                <span className="text-lg text-muted-foreground">{bot.version}</span>
                <span className={cn("flex items-center gap-1 text-sm", statusConfig[bot.status].color)}>
                  <StatusIcon className="h-3 w-3" />
                  {statusConfig[bot.status].label}
                </span>
              </div>
              <p className="text-muted-foreground">{bot.instrument} • {bot.default_contracts} contracts</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditBotDialogOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={handleDeleteBot}>
            <Trash2 className="mr-2 h-4 w-4 text-destructive" />
            Delete
          </Button>
        </div>
      </div>

      {bot.description && (
        <p className="text-muted-foreground">{bot.description}</p>
      )}

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-5">
        <div className="stat-card text-center">
          <p className={cn("text-3xl font-bold", liveMetrics.net_pnl >= 0 ? "text-success" : "text-destructive")}>
            ${liveMetrics.net_pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="text-sm text-muted-foreground">Net P&L</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-3xl font-bold">{liveMetrics.total_trades}</p>
          <p className="text-sm text-muted-foreground">Trades</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-3xl font-bold">{liveMetrics.win_rate.toFixed(1)}%</p>
          <p className="text-sm text-muted-foreground">Win Rate</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-3xl font-bold">{liveMetrics.profit_factor.toFixed(2)}</p>
          <p className="text-sm text-muted-foreground">Profit Factor</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-3xl font-bold text-destructive">${liveMetrics.max_drawdown.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          <p className="text-sm text-muted-foreground">Max DD</p>
        </div>
      </div>

      {/* Quick Links to Journal Pages */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link to={`/bot-accounts?bot=${bot.id}`} className="stat-card flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors">
          <div className="flex items-center gap-3">
            <Wallet className="h-5 w-5 text-accent" />
            <div>
              <p className="font-medium">Accounts</p>
              <p className="text-sm text-muted-foreground">{accounts.length} linked accounts</p>
            </div>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </Link>

        <Link to={`/bot-trades?bot=${bot.id}`} className="stat-card flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors">
          <div className="flex items-center gap-3">
            <ArrowRightLeft className="h-5 w-5 text-accent" />
            <div>
              <p className="font-medium">Trades</p>
              <p className="text-sm text-muted-foreground">{trades.length} total trades</p>
            </div>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </Link>

        <Link to={`/bot-analytics?bot=${bot.id}`} className="stat-card flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-accent" />
            <div>
              <p className="font-medium">Analytics</p>
              <p className="text-sm text-muted-foreground">Performance & Benchmark</p>
            </div>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </Link>
      </div>

      {/* Backtest Data Section */}
      {backtestData.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <History className="h-5 w-5" />
            Backtest Benchmark
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            {backtestData.map((bt) => (
              <div key={bt.id} className="stat-card relative">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold">
                      {format(new Date(bt.period_start), 'MMM d, yyyy')} - {format(new Date(bt.period_end), 'MMM d, yyyy')}
                    </h4>
                    <p className="text-sm text-accent font-medium">{bt.contract_size} contracts baseline</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => setEditingBacktest(bt)}>
                      <Pencil className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteBacktestData(bt.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Trades</p>
                    <p className="font-bold">{bt.total_trades.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Win Rate</p>
                    <p className="font-bold">{((bt.win_count / bt.total_trades) * 100).toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Net P&L</p>
                    <p className={cn("font-bold", bt.net_pnl >= 0 ? "text-success" : "text-destructive")}>
                      ${bt.net_pnl.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Max DD</p>
                    <p className="font-bold text-destructive">${bt.max_drawdown.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Avg Winner</p>
                    <p className="font-bold text-success">${bt.avg_winner.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Avg Loser</p>
                    <p className="font-bold text-destructive">${bt.avg_loser.toLocaleString()}</p>
                  </div>
                </div>

                {bt.notes && <p className="mt-3 text-sm text-muted-foreground border-t pt-3">{bt.notes}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Strategy Notes */}
      {bot.strategy_notes && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Strategy Notes</h2>
          <div className="stat-card">
            <p className="text-sm whitespace-pre-wrap">{bot.strategy_notes}</p>
          </div>
        </section>
      )}

      {/* Edit Bot Dialog */}
      <Dialog open={editBotDialogOpen} onOpenChange={setEditBotDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Bot</DialogTitle>
          </DialogHeader>
          <BotEditForm
            initialData={bot}
            onSave={async (data) => {
              await updateBot(bot.id, data);
              setEditBotDialogOpen(false);
            }}
            onClose={() => setEditBotDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Backtest Dialog */}
      <Dialog open={!!editingBacktest} onOpenChange={(open) => !open && setEditingBacktest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Backtest Data</DialogTitle>
          </DialogHeader>
          {editingBacktest && (
            <BacktestEditForm
              initialData={editingBacktest}
              onSave={async (data) => {
                await updateBacktestData(editingBacktest.id, data);
                setEditingBacktest(null);
              }}
              onClose={() => setEditingBacktest(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Bot Edit Form
interface BotEditFormProps {
  initialData: { name: string; version: string; instrument: string; default_contracts: number; description?: string; strategy_notes?: string; status: 'active' | 'paused' | 'retired' };
  onSave: (data: Partial<BotFormData>) => void;
  onClose: () => void;
}

function BotEditForm({ initialData, onSave, onClose }: BotEditFormProps) {
  const [formData, setFormData] = useState({
    name: initialData.name,
    version: initialData.version,
    instrument: initialData.instrument,
    default_contracts: initialData.default_contracts,
    description: initialData.description || '',
    strategy_notes: initialData.strategy_notes || '',
    status: initialData.status,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Bot Name</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Version</Label>
          <Input
            value={formData.version}
            onChange={(e) => setFormData({ ...formData, version: e.target.value })}
            placeholder="e.g. v1.0"
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Instrument</Label>
          <Select value={formData.instrument} onValueChange={(v) => setFormData({ ...formData, instrument: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BOT_INSTRUMENTS.map((i) => (
                <SelectItem key={i} value={i}>{i}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Default Contracts</Label>
          <Input
            type="number"
            min="1"
            value={formData.default_contracts}
            onChange={(e) => setFormData({ ...formData, default_contracts: parseInt(e.target.value) || 1 })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as typeof formData.status })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="retired">Retired</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Brief description of the bot..."
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>Strategy Notes</Label>
        <Textarea
          value={formData.strategy_notes}
          onChange={(e) => setFormData({ ...formData, strategy_notes: e.target.value })}
          placeholder="Detailed strategy notes, parameters, rules..."
          rows={4}
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90">
          Save Changes
        </Button>
      </div>
    </form>
  );
}

// Backtest Edit Form
interface BacktestEditFormProps {
  initialData: BotBacktestData;
  onSave: (data: Partial<BotBacktestData>) => void;
  onClose: () => void;
}

function BacktestEditForm({ initialData, onSave, onClose }: BacktestEditFormProps) {
  const [formData, setFormData] = useState({
    period_start: initialData.period_start,
    period_end: initialData.period_end,
    total_trades: initialData.total_trades,
    win_count: initialData.win_count,
    loss_count: initialData.loss_count,
    net_pnl: initialData.net_pnl,
    max_drawdown: initialData.max_drawdown,
    avg_winner: initialData.avg_winner,
    avg_loser: initialData.avg_loser,
    contract_size: initialData.contract_size,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      <div className="p-3 rounded-md bg-accent/10 border border-accent/30">
        <p className="text-sm font-medium text-accent">Contract Size Baseline</p>
        <p className="text-xs text-muted-foreground mt-1">
          This should match the contracts used in your backtest data. All P&L values should be based on this contract size.
        </p>
        <Input
          type="number"
          min="1"
          value={formData.contract_size}
          onChange={(e) => setFormData({ ...formData, contract_size: parseInt(e.target.value) || 1 })}
          className="mt-2"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Period Start</Label>
          <Input
            type="date"
            value={formData.period_start}
            onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Period End</Label>
          <Input
            type="date"
            value={formData.period_end}
            onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Total Trades</Label>
          <Input
            type="number"
            min="0"
            value={formData.total_trades}
            onChange={(e) => setFormData({ ...formData, total_trades: parseInt(e.target.value) || 0 })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Wins</Label>
          <Input
            type="number"
            min="0"
            value={formData.win_count}
            onChange={(e) => setFormData({ ...formData, win_count: parseInt(e.target.value) || 0 })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Losses</Label>
          <Input
            type="number"
            min="0"
            value={formData.loss_count}
            onChange={(e) => setFormData({ ...formData, loss_count: parseInt(e.target.value) || 0 })}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Net P&L ($)</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.net_pnl}
            onChange={(e) => setFormData({ ...formData, net_pnl: parseFloat(e.target.value) || 0 })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Max Drawdown ($)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={formData.max_drawdown}
            onChange={(e) => setFormData({ ...formData, max_drawdown: parseFloat(e.target.value) || 0 })}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Avg Winner ($)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={formData.avg_winner}
            onChange={(e) => setFormData({ ...formData, avg_winner: parseFloat(e.target.value) || 0 })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Avg Loser ($)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={formData.avg_loser}
            onChange={(e) => setFormData({ ...formData, avg_loser: parseFloat(e.target.value) || 0 })}
            required
          />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90">
          Save Changes
        </Button>
      </div>
    </form>
  );
}

export default BotDetail;
