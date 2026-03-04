import { useState } from "react";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, CheckCircle2, XCircle, Clock, Wallet, AlertTriangle, LogOut, Eye, EyeOff, Monitor } from "lucide-react";
import { useJournal } from "@/context/JournalContext";
import { ACCOUNT_SIZES, Account, AccountType, EvaluationStatus, FundedStatus, DemoStatus } from "@/types";
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

const evalStatusConfig = {
  passed: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Passed' },
  failed: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Failed' },
  in_progress: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10', label: 'In Progress' },
} as const;

const fundedStatusConfig = {
  active: { icon: Wallet, color: 'text-success', bg: 'bg-success/10', label: 'Active' },
  breached: { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Breached' },
  withdrawn: { icon: LogOut, color: 'text-muted-foreground', bg: 'bg-secondary', label: 'Withdrawn' },
} as const;

const demoStatusConfig = {
  active: { icon: Monitor, color: 'text-accent', bg: 'bg-accent/10', label: 'Active' },
  closed: { icon: XCircle, color: 'text-muted-foreground', bg: 'bg-secondary', label: 'Closed' },
} as const;

function getStatusConfig(account: Account) {
  if (account.type === 'funded') {
    return fundedStatusConfig[account.status as FundedStatus] ?? fundedStatusConfig.active;
  }
  if (account.type === 'demo') {
    return demoStatusConfig[account.status as DemoStatus] ?? demoStatusConfig.active;
  }
  return evalStatusConfig[account.status as EvaluationStatus] ?? evalStatusConfig.in_progress;
}

const Accounts = () => {
  const { accounts, addAccount, updateAccount, deleteAccount } = useJournal();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [defaultType, setDefaultType] = useState<AccountType>('evaluation');
  const [showFailed, setShowFailed] = useState(false);

  const evaluations = accounts.filter(a => a.type === 'evaluation');
  const funded = accounts.filter(a => a.type === 'funded');
  const demo = accounts.filter(a => a.type === 'demo');

  // Active accounts (not failed/breached)
  const activeEvaluations = evaluations.filter(a => a.status === 'in_progress' || a.status === 'passed');
  const failedEvaluations = evaluations.filter(a => a.status === 'failed');
  const activeFunded = funded.filter(a => a.status === 'active');
  const inactiveFunded = funded.filter(a => a.status === 'breached' || a.status === 'withdrawn');
  const activeDemo = demo.filter(a => a.status === 'active');
  const closedDemo = demo.filter(a => a.status === 'closed');

  // Evaluation stats
  const evalPassed = evaluations.filter(a => a.status === 'passed').length;
  const evalFailed = evaluations.filter(a => a.status === 'failed').length;
  const evalActive = evaluations.filter(a => a.status === 'in_progress').length;
  const evalSuccessRate = evalPassed + evalFailed > 0
    ? Math.round((evalPassed / (evalPassed + evalFailed)) * 100) : 0;

  // Funded stats
  const fundedActive = funded.filter(a => a.status === 'active').length;
  const fundedTotalPL = funded.reduce((sum, a) => sum + a.profitLoss, 0);

  // Combined P&L (active accounts only: funded active + evals in progress)
  const activeAccounts = accounts.filter(a =>
    (a.type === 'funded' && a.status === 'active') ||
    (a.type === 'evaluation' && a.status === 'in_progress')
  );
  const totalPL = activeAccounts.reduce((sum, a) => sum + a.profitLoss, 0);

  const renderAccountCard = (account: Account) => {
    const config = getStatusConfig(account);
    const StatusIcon = config.icon;

    return (
      <div key={account.id} className="stat-card group relative">
        <div className="absolute right-4 top-4 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" onClick={() => { setEditingAccount(account); setIsDialogOpen(true); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => deleteAccount(account.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>

        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">{account.propFirm}</h3>
            <p className="text-sm text-muted-foreground">${account.accountSize.toLocaleString()} account</p>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusIcon className={cn("h-3.5 w-3.5", config.color)} />
            <span className={cn("text-sm font-medium", config.color)}>{config.label}</span>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Start Date</span>
            <span className="font-medium">{format(new Date(account.startDate), 'MMM d, yyyy')}</span>
          </div>
          {account.endDate && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">End Date</span>
              <span className="font-medium">{format(new Date(account.endDate), 'MMM d, yyyy')}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Profit/Loss</span>
            <span className={cn("font-bold", account.profitLoss >= 0 ? "text-success" : "text-destructive")}>
              {account.profitLoss >= 0 ? '+' : ''}${account.profitLoss.toLocaleString()}
            </span>
          </div>

          {/* Drawdown progress */}
          {account.maxDrawdown != null && account.maxDrawdown > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Drawdown</span>
                <span className={cn(
                  "font-semibold tabular-nums",
                  account.profitLoss < 0
                    ? Math.abs(account.profitLoss) >= account.maxDrawdown ? "text-destructive" : "text-warning"
                    : "text-muted-foreground"
                )}>
                  ${Math.max(0, Math.abs(Math.min(0, account.profitLoss))).toLocaleString()} / ${account.maxDrawdown.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    account.profitLoss >= 0
                      ? "bg-muted-foreground/20"
                      : Math.abs(account.profitLoss) >= account.maxDrawdown
                        ? "bg-destructive"
                        : Math.abs(account.profitLoss) >= account.maxDrawdown * 0.7
                          ? "bg-warning"
                          : "bg-muted-foreground/40"
                  )}
                  style={{ width: `${Math.min(100, account.profitLoss < 0 ? (Math.abs(account.profitLoss) / account.maxDrawdown) * 100 : 0)}%` }}
                />
              </div>
            </div>
          )}

          {/* Profit target progress (eval and demo) */}
          {(account.type === 'evaluation' || account.type === 'demo') && account.profitTarget != null && account.profitTarget > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Target</span>
                <span className={cn(
                  "font-semibold tabular-nums",
                  account.profitLoss >= account.profitTarget ? "text-success" : "text-muted-foreground"
                )}>
                  ${Math.max(0, account.profitLoss).toLocaleString()} / ${account.profitTarget.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    account.profitLoss >= account.profitTarget
                      ? "bg-success"
                      : "bg-accent/60"
                  )}
                  style={{ width: `${Math.min(100, account.profitLoss > 0 ? (account.profitLoss / account.profitTarget) * 100 : 0)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {account.notes && (
          <div className="mt-4 border-t pt-4">
            <p className="text-sm text-muted-foreground">{account.notes}</p>
          </div>
        )}
      </div>
    );
  };

  const openAddDialog = (type: AccountType) => {
    setDefaultType(type);
    setEditingAccount(null);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="page-subtitle">Manage your evaluations and funded accounts</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingAccount ? 'Edit Account' : 'Add New Account'}</DialogTitle>
            </DialogHeader>
            <AccountForm
              onClose={() => { setIsDialogOpen(false); setEditingAccount(null); }}
              onSave={(account) => {
                if (editingAccount) {
                  updateAccount(account);
                } else {
                  addAccount(account);
                }
                setIsDialogOpen(false);
                setEditingAccount(null);
              }}
              initialData={editingAccount}
              defaultType={defaultType}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Active Accounts Section ─────────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Active Accounts</h2>
          <div className="flex gap-2">
            <Button onClick={() => openAddDialog('demo')} variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Add Demo
            </Button>
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
            <p className="text-4xl font-bold text-success">{evalSuccessRate}%</p>
            <p className="text-sm text-muted-foreground">Pass Rate</p>
          </div>
        </div>

        {/* Funded Accounts */}
        {activeFunded.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-medium text-muted-foreground">Funded</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{activeFunded.map(renderAccountCard)}</div>
          </div>
        )}

        {/* Demo Accounts */}
        {activeDemo.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-medium text-muted-foreground">Demo</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{activeDemo.map(renderAccountCard)}</div>
          </div>
        )}

        {/* In Progress Evaluations */}
        {activeEvaluations.filter(a => a.status === 'in_progress').length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-medium text-muted-foreground">Evaluations - In Progress</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {activeEvaluations.filter(a => a.status === 'in_progress').map(renderAccountCard)}
            </div>
          </div>
        )}

        {/* Passed Evaluations */}
        {activeEvaluations.filter(a => a.status === 'passed').length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-medium text-muted-foreground">Evaluations - Passed</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {activeEvaluations.filter(a => a.status === 'passed').map(renderAccountCard)}
            </div>
          </div>
        )}
      </section>

      {/* ── Failed/Inactive Section (Toggle) ──────────────────────────────────── */}
      {(failedEvaluations.length > 0 || inactiveFunded.length > 0 || closedDemo.length > 0) && (
        <section className="space-y-6">
          <Button
            variant="ghost"
            onClick={() => setShowFailed(!showFailed)}
            className="w-full justify-between border border-dashed border-muted-foreground/30 py-6"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              {showFailed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showFailed ? 'Hide' : 'Show'} Failed & Inactive Accounts
            </span>
            <span className="text-sm text-muted-foreground">
              {failedEvaluations.length + inactiveFunded.length + closedDemo.length} accounts
            </span>
          </Button>

          {showFailed && (
            <div className="space-y-6">
              {/* Failed Evaluations */}
              {failedEvaluations.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-destructive">Failed Evaluations ({failedEvaluations.length})</h3>
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{failedEvaluations.map(renderAccountCard)}</div>
                </div>
              )}

              {/* Breached/Withdrawn Funded */}
              {inactiveFunded.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-destructive">Breached/Withdrawn Funded ({inactiveFunded.length})</h3>
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{inactiveFunded.map(renderAccountCard)}</div>
                </div>
              )}

              {/* Closed Demo */}
              {closedDemo.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-muted-foreground">Closed Demo ({closedDemo.length})</h3>
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{closedDemo.map(renderAccountCard)}</div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

interface AccountFormProps {
  onClose: () => void;
  onSave: (account: Account) => void;
  initialData?: Account | null;
  defaultType?: AccountType;
}

function AccountForm({ onClose, onSave, initialData, defaultType = 'evaluation' }: AccountFormProps) {
  const { propFirms } = useJournal();
  const getDefaultStatus = (type: AccountType) => {
    if (type === 'funded') return 'active';
    if (type === 'demo') return 'active';
    return 'in_progress';
  };

  const [formData, setFormData] = useState<Partial<Account>>(
    initialData || {
      type: defaultType,
      propFirm: defaultType === 'demo' ? 'Demo' : '',
      accountSize: 10000,
      startDate: new Date().toISOString().split('T')[0],
      status: getDefaultStatus(defaultType),
      profitLoss: 0,
      maxDrawdown: undefined,
      profitTarget: undefined,
      notes: '',
    }
  );

  const accountType = formData.type || 'evaluation';

  const handleTypeChange = (type: AccountType) => {
    const newStatus = getDefaultStatus(type);
    const newPropFirm = type === 'demo' ? 'Demo' : formData.propFirm;
    setFormData({ ...formData, type, status: newStatus, propFirm: newPropFirm });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData as Account);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Account Type</Label>
        <Select value={accountType} onValueChange={(v) => handleTypeChange(v as AccountType)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="demo">Demo</SelectItem>
            <SelectItem value="evaluation">Evaluation</SelectItem>
            <SelectItem value="funded">Funded</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="propFirm">{accountType === 'demo' ? 'Account Name' : 'Prop Firm'}</Label>
          {accountType === 'demo' ? (
            <Input
              value={formData.propFirm}
              onChange={(e) => setFormData({ ...formData, propFirm: e.target.value })}
              placeholder="e.g. Demo Account 1"
            />
          ) : (
            <Select value={formData.propFirm} onValueChange={(value) => setFormData({ ...formData, propFirm: value })}>
              <SelectTrigger><SelectValue placeholder="Select firm" /></SelectTrigger>
              <SelectContent>
                {propFirms.map((firm) => (
                  <SelectItem key={firm.id} value={firm.name}>{firm.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="accountSize">Account Size</Label>
          <Select value={formData.accountSize?.toString()} onValueChange={(value) => setFormData({ ...formData, accountSize: parseInt(value) })}>
            <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
            <SelectContent>
              {ACCOUNT_SIZES.map((size) => (
                <SelectItem key={size} value={size.toString()}>${size.toLocaleString()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className={cn("grid gap-4", (accountType === 'evaluation' || accountType === 'demo') ? "sm:grid-cols-2" : "sm:grid-cols-1")}>
        <div className="space-y-2">
          <Label htmlFor="maxDrawdown">Max Drawdown ($) {accountType === 'demo' && <span className="text-muted-foreground">(optional)</span>}</Label>
          <Input
            id="maxDrawdown"
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 1500"
            value={formData.maxDrawdown ?? ''}
            onChange={(e) => setFormData({ ...formData, maxDrawdown: e.target.value ? parseFloat(e.target.value) : undefined })}
          />
          <p className="text-[10px] text-muted-foreground">{accountType === 'demo' ? 'Track against a drawdown limit' : 'Auto-fails/breaches when loss hits this amount'}</p>
        </div>
        {(accountType === 'evaluation' || accountType === 'demo') && (
          <div className="space-y-2">
            <Label htmlFor="profitTarget">Profit Target ($) {accountType === 'demo' && <span className="text-muted-foreground">(optional)</span>}</Label>
            <Input
              id="profitTarget"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 3000"
              value={formData.profitTarget ?? ''}
              onChange={(e) => setFormData({ ...formData, profitTarget: e.target.value ? parseFloat(e.target.value) : undefined })}
            />
            <p className="text-[10px] text-muted-foreground">{accountType === 'demo' ? 'Track against a profit goal' : 'Auto-passes when profit reaches this amount'}</p>
          </div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="startDate">Start Date</Label>
          <Input id="startDate" type="date" value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value as Account['status'] })}>
            <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
            <SelectContent>
              {accountType === 'evaluation' ? (
                <>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="passed">Passed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </>
              ) : accountType === 'demo' ? (
                <>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="breached">Breached</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="endDate">End Date (optional)</Label>
          <Input id="endDate" type="date" value={formData.endDate || ''} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profitLoss">Profit/Loss ($)</Label>
          <Input id="profitLoss" type="number" step="0.01" value={formData.profitLoss} onChange={(e) => setFormData({ ...formData, profitLoss: parseFloat(e.target.value) })} required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes..." />
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

export default Accounts;
