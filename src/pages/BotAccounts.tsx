import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, CheckCircle2, XCircle, Clock, Wallet, AlertTriangle, LogOut, Eye, EyeOff } from "lucide-react";
import { useBots } from "@/context/BotContext";
import { useAuth } from "@/context/AuthContext";
import type { BotAccount, BotAccountFormData, BotAccountStatus } from "@/types/bots";
import { BOT_PROP_FIRMS } from "@/types/bots";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { LoginForm } from "@/components/auth/LoginForm";

const statusConfig = {
  evaluation: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10', label: 'Evaluation' },
  funded: { icon: Wallet, color: 'text-success', bg: 'bg-success/10', label: 'Funded' },
  passed: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Passed' },
  breached: { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Breached' },
  withdrawn: { icon: LogOut, color: 'text-muted-foreground', bg: 'bg-secondary', label: 'Withdrawn' },
} as const;

const BotAccounts = () => {
  const { user, isConfigured } = useAuth();
  const { bots, botAccounts, addBotAccount, updateBotAccount, deleteBotAccount, loading } = useBots();
  const [searchParams] = useSearchParams();
  const botIdParam = searchParams.get("bot");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BotAccount | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<BotAccountStatus>('evaluation');
  const [showInactive, setShowInactive] = useState(false);
  const [filterBot, setFilterBot] = useState(botIdParam || "all");

  if (!isConfigured) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-xl font-semibold">Supabase Not Configured</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Bot Accounts</h2>
          <p className="text-muted-foreground">Sign in to access collaborative bot tracking</p>
        </div>
        <LoginForm />
      </div>
    );
  }

  // Filter accounts by bot first
  const filteredAccounts = filterBot === "all"
    ? botAccounts
    : botAccounts.filter(a => a.bot_id === filterBot);

  // Group accounts by status
  const evaluations = filteredAccounts.filter(a => a.status === 'evaluation');
  const funded = filteredAccounts.filter(a => a.status === 'funded');
  const passed = filteredAccounts.filter(a => a.status === 'passed');
  const breached = filteredAccounts.filter(a => a.status === 'breached');
  const withdrawn = filteredAccounts.filter(a => a.status === 'withdrawn');

  // Active accounts
  const activeAccounts = [...funded, ...evaluations, ...passed];
  const inactiveAccounts = [...breached, ...withdrawn];

  // Calculate stats
  const totalPL = activeAccounts.reduce((sum, a) => sum + (a.current_balance - a.starting_balance), 0);
  const fundedActive = funded.length;
  const evalActive = evaluations.length;
  const evalPassed = passed.length;
  const evalFailed = breached.filter(a => evaluations.some(e => e.bot_id === a.bot_id)).length;
  const passRate = evalPassed + evalFailed > 0
    ? Math.round((evalPassed / (evalPassed + evalFailed)) * 100) : 0;

  const getBotName = (botId: string) => {
    const bot = bots.find(b => b.id === botId);
    return bot ? `${bot.name} ${bot.version}` : 'Unknown Bot';
  };

  const renderAccountCard = (account: BotAccount) => {
    const config = statusConfig[account.status] || statusConfig.evaluation;
    const StatusIcon = config.icon;
    const pnl = account.current_balance - account.starting_balance;
    const ddUsed = Math.max(0, account.starting_balance - account.current_balance);
    const ddPercent = account.max_drawdown > 0 ? (ddUsed / account.max_drawdown) * 100 : 0;
    const targetProgress = account.profit_target && pnl > 0 ? (pnl / account.profit_target) * 100 : 0;

    return (
      <div key={account.id} className="stat-card group relative">
        <div className="absolute right-4 top-4 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" onClick={() => { setEditingAccount(account); setIsDialogOpen(true); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => deleteBotAccount(account.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>

        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">{account.account_name}</h3>
            <p className="text-sm text-muted-foreground">{account.prop_firm} • ${account.account_size.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{getBotName(account.bot_id)}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusIcon className={cn("h-3.5 w-3.5", config.color)} />
            <span className={cn("text-sm font-medium", config.color)}>{config.label}</span>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Start Date</span>
            <span className="font-medium">{format(new Date(account.start_date), 'MMM d, yyyy')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Contracts</span>
            <span className="font-medium">{account.contract_size}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Profit/Loss</span>
            <span className={cn("font-bold", pnl >= 0 ? "text-success" : "text-destructive")}>
              {pnl >= 0 ? '+' : ''}${pnl.toLocaleString()}
            </span>
          </div>

          {/* Drawdown progress */}
          {account.max_drawdown > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Drawdown</span>
                <span className={cn(
                  "font-semibold tabular-nums",
                  ddPercent >= 100 ? "text-destructive" : ddPercent >= 70 ? "text-warning" : "text-muted-foreground"
                )}>
                  ${ddUsed.toLocaleString()} / ${account.max_drawdown.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    ddPercent >= 100 ? "bg-destructive" : ddPercent >= 70 ? "bg-warning" : "bg-muted-foreground/40"
                  )}
                  style={{ width: `${Math.min(100, ddPercent)}%` }}
                />
              </div>
            </div>
          )}

          {/* Profit target progress (for evaluations) */}
          {account.profit_target && account.profit_target > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Target</span>
                <span className={cn(
                  "font-semibold tabular-nums",
                  pnl >= account.profit_target ? "text-success" : "text-muted-foreground"
                )}>
                  ${Math.max(0, pnl).toLocaleString()} / ${account.profit_target.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    pnl >= account.profit_target ? "bg-success" : "bg-accent/60"
                  )}
                  style={{ width: `${Math.min(100, targetProgress)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const openAddDialog = (status: BotAccountStatus) => {
    setDefaultStatus(status);
    setEditingAccount(null);
    setIsDialogOpen(true);
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
          <h1 className="page-title">Bot Accounts</h1>
          <p className="page-subtitle">Manage prop firm accounts for your bots</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingAccount ? 'Edit Account' : 'Add New Account'}</DialogTitle>
            </DialogHeader>
            <AccountForm
              bots={bots}
              onClose={() => { setIsDialogOpen(false); setEditingAccount(null); }}
              onSave={async (account) => {
                if (editingAccount) {
                  await updateBotAccount(editingAccount.id, account);
                } else {
                  await addBotAccount(account);
                }
                setIsDialogOpen(false);
                setEditingAccount(null);
              }}
              initialData={editingAccount}
              defaultStatus={defaultStatus}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter */}
      {bots.length > 0 && (
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">Filter by Bot:</span>
          <Select value={filterBot} onValueChange={setFilterBot}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Bots</SelectItem>
              {bots.map(bot => (
                <SelectItem key={bot.id} value={bot.id}>{bot.name} {bot.version}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Active Accounts Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Active Accounts</h2>
          <div className="flex gap-2">
            <Button onClick={() => openAddDialog('evaluation')} variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Add Evaluation
            </Button>
            <Button onClick={() => openAddDialog('funded')} className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Plus className="mr-2 h-4 w-4" />
              Add Funded
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="stat-card text-center">
            <p className={cn("text-4xl font-bold", totalPL >= 0 ? "text-success" : "text-destructive")}>
              ${totalPL.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground">Total P/L</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-4xl font-bold text-success">{fundedActive}</p>
            <p className="text-sm text-muted-foreground">Funded Active</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-4xl font-bold text-warning">{evalActive}</p>
            <p className="text-sm text-muted-foreground">Evals In Progress</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-4xl font-bold text-success">{passRate}%</p>
            <p className="text-sm text-muted-foreground">Pass Rate</p>
          </div>
        </div>

        {/* Funded Accounts */}
        {funded.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-medium text-muted-foreground">Funded</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{funded.map(renderAccountCard)}</div>
          </div>
        )}

        {/* Evaluations - In Progress */}
        {evaluations.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-medium text-muted-foreground">Evaluations - In Progress</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{evaluations.map(renderAccountCard)}</div>
          </div>
        )}

        {/* Passed Evaluations */}
        {passed.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-medium text-muted-foreground">Evaluations - Passed</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{passed.map(renderAccountCard)}</div>
          </div>
        )}
      </section>

      {/* Inactive Section (Toggle) */}
      {inactiveAccounts.length > 0 && (
        <section className="space-y-6">
          <Button
            variant="ghost"
            onClick={() => setShowInactive(!showInactive)}
            className="w-full justify-between border border-dashed border-muted-foreground/30 py-6"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              {showInactive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showInactive ? 'Hide' : 'Show'} Breached & Withdrawn Accounts
            </span>
            <span className="text-sm text-muted-foreground">{inactiveAccounts.length} accounts</span>
          </Button>

          {showInactive && (
            <div className="space-y-6">
              {breached.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-destructive">Breached ({breached.length})</h3>
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{breached.map(renderAccountCard)}</div>
                </div>
              )}
              {withdrawn.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-muted-foreground">Withdrawn ({withdrawn.length})</h3>
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{withdrawn.map(renderAccountCard)}</div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Empty State */}
      {filteredAccounts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Wallet className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">
            {filterBot !== "all" ? "No accounts for this bot" : "No accounts yet"}
          </h3>
          <p className="text-muted-foreground mb-4">
            {filterBot !== "all" ? "Try a different filter or add a new account" : "Link a prop firm account to start tracking"}
          </p>
          <Button onClick={() => openAddDialog('evaluation')} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="mr-2 h-4 w-4" />
            Add Your First Account
          </Button>
        </div>
      )}
    </div>
  );
};

// Account Form Component
interface AccountFormProps {
  bots: { id: string; name: string; version: string; default_contracts: number }[];
  onClose: () => void;
  onSave: (data: BotAccountFormData) => void;
  initialData?: BotAccount | null;
  defaultStatus?: BotAccountStatus;
}

function AccountForm({ bots, onClose, onSave, initialData, defaultStatus = 'evaluation' }: AccountFormProps) {
  const [formData, setFormData] = useState<BotAccountFormData>(
    initialData ? {
      bot_id: initialData.bot_id,
      account_name: initialData.account_name,
      prop_firm: initialData.prop_firm,
      account_size: initialData.account_size,
      contract_size: initialData.contract_size,
      status: initialData.status,
      max_drawdown: initialData.max_drawdown,
      daily_drawdown: initialData.daily_drawdown,
      profit_target: initialData.profit_target,
      min_trading_days: initialData.min_trading_days,
      scaling_rules: initialData.scaling_rules,
      start_date: initialData.start_date,
      starting_balance: initialData.starting_balance,
      current_balance: initialData.current_balance,
      high_water_mark: initialData.high_water_mark,
    } : {
      bot_id: bots[0]?.id || '',
      account_name: '',
      prop_firm: 'Apex Trader Funding',
      account_size: 50000,
      contract_size: bots[0]?.default_contracts || 1,
      status: defaultStatus,
      max_drawdown: 2500,
      daily_drawdown: 1500,
      profit_target: defaultStatus === 'evaluation' ? 3000 : undefined,
      min_trading_days: 7,
      start_date: new Date().toISOString().split('T')[0],
      starting_balance: 50000,
      current_balance: 50000,
      high_water_mark: 50000,
    }
  );

  const handleStatusChange = (status: BotAccountStatus) => {
    const updates: Partial<BotAccountFormData> = { status };
    // Set profit target for evaluations
    if (status === 'evaluation' && !formData.profit_target) {
      updates.profit_target = 3000;
    }
    setFormData({ ...formData, ...updates });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Linked Bot</Label>
        <Select value={formData.bot_id} onValueChange={(v) => setFormData({ ...formData, bot_id: v })}>
          <SelectTrigger><SelectValue placeholder="Select bot" /></SelectTrigger>
          <SelectContent>
            {bots.map((bot) => (
              <SelectItem key={bot.id} value={bot.id}>{bot.name} {bot.version}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Account Type</Label>
        <Select value={formData.status} onValueChange={(v) => handleStatusChange(v as BotAccountStatus)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="evaluation">Evaluation</SelectItem>
            <SelectItem value="funded">Funded</SelectItem>
            <SelectItem value="passed">Passed</SelectItem>
            <SelectItem value="breached">Breached</SelectItem>
            <SelectItem value="withdrawn">Withdrawn</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Account Name</Label>
          <Input
            value={formData.account_name}
            onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
            placeholder="e.g. Apex 50K #1"
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Prop Firm</Label>
          <Select value={formData.prop_firm} onValueChange={(v) => setFormData({ ...formData, prop_firm: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BOT_PROP_FIRMS.map((firm) => (
                <SelectItem key={firm} value={firm}>{firm}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Account Size ($)</Label>
          <Input
            type="number"
            value={formData.account_size}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 0;
              setFormData({ ...formData, account_size: val, starting_balance: val, current_balance: val, high_water_mark: val });
            }}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Contracts</Label>
          <Input
            type="number"
            min="1"
            value={formData.contract_size}
            onChange={(e) => setFormData({ ...formData, contract_size: parseInt(e.target.value) || 1 })}
            required
          />
        </div>
      </div>

      <div className={cn("grid gap-4", formData.status === 'evaluation' ? "sm:grid-cols-2" : "sm:grid-cols-1")}>
        <div className="space-y-2">
          <Label>Max Drawdown ($)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 2500"
            value={formData.max_drawdown}
            onChange={(e) => setFormData({ ...formData, max_drawdown: parseFloat(e.target.value) || 0 })}
            required
          />
          <p className="text-[10px] text-muted-foreground">Auto-breaches when loss hits this amount</p>
        </div>
        {formData.status === 'evaluation' && (
          <div className="space-y-2">
            <Label>Profit Target ($)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 3000"
              value={formData.profit_target ?? ''}
              onChange={(e) => setFormData({ ...formData, profit_target: e.target.value ? parseFloat(e.target.value) : undefined })}
            />
            <p className="text-[10px] text-muted-foreground">Auto-passes when profit reaches this amount</p>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Start Date</Label>
          <Input
            type="date"
            value={formData.start_date}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Current Balance ($)</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.current_balance}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 0;
              setFormData({ ...formData, current_balance: val, high_water_mark: Math.max(formData.high_water_mark, val) });
            }}
            required
          />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90">
          {initialData ? 'Update' : 'Add'} Account
        </Button>
      </div>
    </form>
  );
}

export default BotAccounts;
