import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import {
  Plus,
  Pencil,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Upload,
} from "lucide-react";
import { useBots } from "@/context/BotContext";
import { useAuth } from "@/context/AuthContext";
import type { BotTrade, BotTradeFormData } from "@/types/bots";
import { BOT_INSTRUMENTS } from "@/types/bots";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const BotTrades = () => {
  const [searchParams] = useSearchParams();
  const botIdParam = searchParams.get("bot");

  const { user } = useAuth();
  const {
    bots,
    botAccounts,
    botTrades,
    addBotTrade,
    updateBotTrade,
    deleteBotTrade,
    loading,
  } = useBots();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<BotTrade | null>(null);
  const [filterBot, setFilterBot] = useState(botIdParam || "all");
  const [filterResult, setFilterResult] = useState("all");
  const [filterInstrument, setFilterInstrument] = useState("all");

  // Build lookup maps
  const botMap = useMemo(() => {
    const map = new Map<string, string>();
    bots.forEach((b) => map.set(b.id, `${b.name} ${b.version}`));
    return map;
  }, [bots]);

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    botAccounts.forEach((a) => map.set(a.id, a.account_name));
    return map;
  }, [botAccounts]);

  // Filter trades
  const filteredTrades = useMemo(() => {
    let result = [...botTrades];
    if (filterBot !== "all") {
      result = result.filter((t) => t.bot_id === filterBot);
    }
    if (filterResult !== "all") {
      if (filterResult === "win") result = result.filter((t) => (t.pnl || 0) > 0);
      else if (filterResult === "loss") result = result.filter((t) => (t.pnl || 0) < 0);
      else if (filterResult === "breakeven") result = result.filter((t) => (t.pnl || 0) === 0);
    }
    if (filterInstrument !== "all") {
      result = result.filter((t) => t.instrument === filterInstrument);
    }
    return result.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [botTrades, filterBot, filterResult, filterInstrument]);

  // Calculate stats
  const stats = useMemo(() => {
    const closedTrades = filteredTrades.filter((t) => t.status === "closed");
    const wins = closedTrades.filter((t) => (t.pnl || 0) > 0);
    const losses = closedTrades.filter((t) => (t.pnl || 0) < 0);
    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winRate = closedTrades.length > 0 ? Math.round((wins.length / closedTrades.length) * 100) : 0;
    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + (t.pnl || 0), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + (t.pnl || 0), 0) / losses.length) : 0;
    const totalWins = wins.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalLosses = Math.abs(losses.reduce((sum, t) => sum + (t.pnl || 0), 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

    return {
      total: filteredTrades.length,
      wins: wins.length,
      losses: losses.length,
      totalPnl,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
    };
  }, [filteredTrades]);

  // Get unique instruments for filter
  const instruments = useMemo(() => {
    const set = new Set(botTrades.map((t) => t.instrument));
    return Array.from(set).sort();
  }, [botTrades]);

  // Export CSV
  const handleExportCSV = () => {
    const headers = ["Date", "Time", "Bot", "Account", "Instrument", "Direction", "Entry", "Exit", "Contracts", "P&L", "Status", "Source", "Notes"];
    const rows = filteredTrades.map((t) => [
      format(new Date(t.timestamp), "yyyy-MM-dd"),
      format(new Date(t.timestamp), "HH:mm"),
      botMap.get(t.bot_id) || "",
      t.bot_account_id ? accountMap.get(t.bot_account_id) || "" : "",
      t.instrument,
      t.direction,
      t.entry_price.toString(),
      t.exit_price?.toString() ?? "",
      t.contracts.toString(),
      (t.pnl || 0).toString(),
      t.status,
      t.source,
      t.notes ?? "",
    ]);
    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bot-trades.csv";
    a.click();
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Please log in to view bot trades.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Bot Trades</h1>
          <p className="page-subtitle">Track every bot execution</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setIsImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) setEditingTrade(null);
            }}
          >
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Plus className="mr-2 h-4 w-4" />
                Add Trade
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingTrade ? "Edit Trade" : "Add Trade"}</DialogTitle>
              </DialogHeader>
              <TradeForm
                bots={bots}
                accounts={botAccounts}
                initialData={editingTrade}
                defaultBotId={filterBot !== "all" ? filterBot : undefined}
                onSave={async (data) => {
                  if (editingTrade) {
                    await updateBotTrade(editingTrade.id, data);
                  } else {
                    await addBotTrade(data);
                  }
                  setIsDialogOpen(false);
                  setEditingTrade(null);
                }}
                onClose={() => {
                  setIsDialogOpen(false);
                  setEditingTrade(null);
                }}
              />
            </DialogContent>
          </Dialog>
          {/* Import Dialog */}
          <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Import Trades from CSV</DialogTitle>
              </DialogHeader>
              <ImportForm
                bots={bots}
                accounts={botAccounts}
                onImport={async (trades) => {
                  for (const t of trades) {
                    await addBotTrade(t);
                  }
                  setIsImportDialogOpen(false);
                }}
                onClose={() => setIsImportDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <div className="stat-card p-3">
          <p className="section-label">Trades</p>
          <p className="text-lg font-bold">{stats.total}</p>
        </div>
        <div className="stat-card p-3">
          <p className="section-label">Net P&L</p>
          <p className={cn("text-lg font-bold", stats.totalPnl >= 0 ? "text-success" : "text-destructive")}>
            {stats.totalPnl >= 0 ? "+" : ""}${Math.abs(stats.totalPnl).toLocaleString()}
          </p>
        </div>
        <div className="stat-card p-3">
          <p className="section-label">Win Rate</p>
          <p className="text-lg font-bold">{stats.winRate}%</p>
        </div>
        <div className="stat-card p-3">
          <p className="section-label">Wins</p>
          <p className="text-lg font-bold text-success">{stats.wins}</p>
        </div>
        <div className="stat-card p-3">
          <p className="section-label">Losses</p>
          <p className="text-lg font-bold text-destructive">{stats.losses}</p>
        </div>
        <div className="stat-card p-3">
          <p className="section-label">Avg Win</p>
          <p className="text-lg font-bold text-success">${Math.round(stats.avgWin).toLocaleString()}</p>
        </div>
        <div className="stat-card p-3">
          <p className="section-label">Avg Loss</p>
          <p className="text-lg font-bold text-destructive">${Math.round(stats.avgLoss).toLocaleString()}</p>
        </div>
        <div className="stat-card p-3">
          <p className="section-label">Profit Factor</p>
          <p className="text-lg font-bold">
            {stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-48">
          <Select value={filterBot} onValueChange={setFilterBot}>
            <SelectTrigger>
              <SelectValue placeholder="Bot" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Bots</SelectItem>
              {bots.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} {b.version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-36">
          <Select value={filterResult} onValueChange={setFilterResult}>
            <SelectTrigger>
              <SelectValue placeholder="Result" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Results</SelectItem>
              <SelectItem value="win">Wins</SelectItem>
              <SelectItem value="loss">Losses</SelectItem>
              <SelectItem value="breakeven">Breakeven</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-36">
          <Select value={filterInstrument} onValueChange={setFilterInstrument}>
            <SelectTrigger>
              <SelectValue placeholder="Instrument" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Instruments</SelectItem>
              {instruments.map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Trades Table */}
      <div className="stat-card overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Date</TableHead>
              <TableHead>Bot</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Instrument</TableHead>
              <TableHead>Dir</TableHead>
              <TableHead className="text-right">Entry</TableHead>
              <TableHead className="text-right">Exit</TableHead>
              <TableHead className="text-right">Contracts</TableHead>
              <TableHead className="text-right">P&L</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTrades.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-12 text-center text-muted-foreground">
                  No trades found. Add your first bot trade to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredTrades.map((trade) => (
                <TableRow key={trade.id} className="group">
                  <TableCell className="whitespace-nowrap">
                    <div>
                      {format(new Date(trade.timestamp), "MMM d")}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {format(new Date(trade.timestamp), "HH:mm")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {botMap.get(trade.bot_id) || "Unknown"}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {trade.bot_account_id ? accountMap.get(trade.bot_account_id) || "—" : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{trade.instrument}</TableCell>
                  <TableCell>
                    {trade.direction === "long" ? (
                      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-success">
                        <ArrowUpRight className="h-3 w-3" />
                        Long
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-destructive">
                        <ArrowDownRight className="h-3 w-3" />
                        Short
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {trade.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {trade.exit_price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "-"}
                  </TableCell>
                  <TableCell className="text-right">{trade.contracts}</TableCell>
                  <TableCell className={cn("text-right font-bold tabular-nums", (trade.pnl || 0) > 0 ? "text-success" : (trade.pnl || 0) < 0 ? "text-destructive" : "")}>
                    {(trade.pnl || 0) >= 0 ? "+" : ""}${Math.abs(trade.pnl || 0).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-xs",
                      trade.status === "closed" ? "bg-secondary" : trade.status === "open" ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
                    )}>
                      {trade.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingTrade(trade);
                          setIsDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => deleteBotTrade(trade.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

// Trade Form
interface TradeFormProps {
  bots: { id: string; name: string; version: string; instrument: string; default_contracts: number }[];
  accounts: { id: string; bot_id: string; account_name: string }[];
  initialData?: BotTrade | null;
  defaultBotId?: string;
  onSave: (data: BotTradeFormData) => void;
  onClose: () => void;
}

function TradeForm({ bots, accounts, initialData, defaultBotId, onSave, onClose }: TradeFormProps) {
  const defaultBot = bots.find((b) => b.id === defaultBotId) || bots[0];

  const [formData, setFormData] = useState<BotTradeFormData>(
    initialData
      ? {
          bot_id: initialData.bot_id,
          bot_account_id: initialData.bot_account_id,
          external_id: initialData.external_id,
          timestamp: initialData.timestamp,
          instrument: initialData.instrument,
          direction: initialData.direction,
          entry_price: initialData.entry_price,
          exit_price: initialData.exit_price,
          contracts: initialData.contracts,
          pnl: initialData.pnl,
          commission: initialData.commission,
          status: initialData.status,
          source: initialData.source,
          notes: initialData.notes,
        }
      : {
          bot_id: defaultBot?.id || "",
          timestamp: new Date().toISOString(),
          instrument: defaultBot?.instrument || "MNQ",
          direction: "long",
          entry_price: 0,
          contracts: defaultBot?.default_contracts || 1,
          status: "closed",
          source: "manual",
        }
  );

  // Filter accounts for selected bot
  const botAccounts = accounts.filter((a) => a.bot_id === formData.bot_id);

  const handleBotChange = (botId: string) => {
    const bot = bots.find((b) => b.id === botId);
    setFormData({
      ...formData,
      bot_id: botId,
      instrument: bot?.instrument || formData.instrument,
      contracts: bot?.default_contracts || formData.contracts,
      bot_account_id: undefined,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Bot</Label>
          <Select value={formData.bot_id} onValueChange={handleBotChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select bot" />
            </SelectTrigger>
            <SelectContent>
              {bots.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} {b.version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Account (Optional)</Label>
          <Select
            value={formData.bot_account_id || ""}
            onValueChange={(v) => setFormData({ ...formData, bot_account_id: v || undefined })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No specific account</SelectItem>
              {botAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.account_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>Timestamp</Label>
          <Input
            type="datetime-local"
            value={formData.timestamp.slice(0, 16)}
            onChange={(e) => setFormData({ ...formData, timestamp: new Date(e.target.value).toISOString() })}
            required
          />
        </div>
        <div className="space-y-1">
          <Label>Instrument</Label>
          <Select value={formData.instrument} onValueChange={(v) => setFormData({ ...formData, instrument: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BOT_INSTRUMENTS.map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Direction</Label>
          <Select value={formData.direction} onValueChange={(v) => setFormData({ ...formData, direction: v as "long" | "short" })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="long">Long</SelectItem>
              <SelectItem value="short">Short</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label>Entry Price</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.entry_price || ""}
            onChange={(e) => setFormData({ ...formData, entry_price: parseFloat(e.target.value) || 0 })}
            required
          />
        </div>
        <div className="space-y-1">
          <Label>Exit Price</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.exit_price || ""}
            onChange={(e) => setFormData({ ...formData, exit_price: e.target.value ? parseFloat(e.target.value) : undefined })}
          />
        </div>
        <div className="space-y-1">
          <Label>Contracts</Label>
          <Input
            type="number"
            min="1"
            value={formData.contracts}
            onChange={(e) => setFormData({ ...formData, contracts: parseInt(e.target.value) || 1 })}
            required
          />
        </div>
        <div className="space-y-1">
          <Label>P&L ($)</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.pnl ?? ""}
            onChange={(e) => setFormData({ ...formData, pnl: e.target.value ? parseFloat(e.target.value) : undefined })}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as BotTrade["status"] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Commission ($)</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.commission || ""}
            onChange={(e) => setFormData({ ...formData, commission: e.target.value ? parseFloat(e.target.value) : undefined })}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Notes</Label>
        <Textarea
          rows={2}
          placeholder="Trade notes..."
          value={formData.notes || ""}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90">
          {initialData ? "Update" : "Add"} Trade
        </Button>
      </div>
    </form>
  );
}

// Import Form
interface ImportFormProps {
  bots: { id: string; name: string; version: string; instrument: string; default_contracts: number }[];
  accounts: { id: string; bot_id: string; account_name: string }[];
  onImport: (trades: BotTradeFormData[]) => void;
  onClose: () => void;
}

function ImportForm({ bots, accounts, onImport, onClose }: ImportFormProps) {
  const [botId, setBotId] = useState(bots[0]?.id || "");
  const [accountId, setAccountId] = useState("");
  const [csvData, setCsvData] = useState("");
  const [parsedTrades, setParsedTrades] = useState<BotTradeFormData[]>([]);
  const [error, setError] = useState("");

  const botAccounts = accounts.filter((a) => a.bot_id === botId);
  const selectedBot = bots.find((b) => b.id === botId);

  const parseNumber = (str: string): number => {
    if (!str) return 0;
    const trimmed = str.trim();
    const isNegative = trimmed.startsWith("(") && trimmed.endsWith(")");
    const cleaned = trimmed.replace(/[^0-9.-]/g, "");
    const num = parseFloat(cleaned) || 0;
    return isNegative ? -Math.abs(num) : num;
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
    }
    result.push(current.trim());
    return result;
  };

  const parseCSV = (text: string) => {
    setError("");
    const lines = text.trim().split("\n").map((l) => l.replace(/\r$/, ""));
    if (lines.length < 2) {
      setError("CSV must have headers and at least one data row");
      return;
    }

    const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/['"]/g, ""));
    const findCol = (...names: string[]) => headers.findIndex((h) => names.some((n) => h.includes(n)));

    const cols = {
      instrument: findCol("instrument", "symbol", "ticker", "contract"),
      contracts: findCol("qty", "quantity", "size", "lot", "filled"),
      entry: findCol("entry", "avg", "fill", "price"),
      exit: findCol("exit", "close"),
      pnl: findCol("pnl", "p&l", "profit", "net", "realized", "gain"),
      date: findCol("date", "exec", "timestamp"),
      direction: findCol("direction", "side", "b/s", "action", "type"),
    };

    const trades: BotTradeFormData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]).map((v) => v.replace(/^["']|["']$/g, ""));
      if (values.length < 2 || values.every((v) => !v.trim())) continue;

      let pnl = 0;
      if (cols.pnl >= 0 && values[cols.pnl]) pnl = parseNumber(values[cols.pnl]);

      let contracts = selectedBot?.default_contracts || 1;
      if (cols.contracts >= 0 && values[cols.contracts]) contracts = Math.abs(parseInt(values[cols.contracts])) || 1;

      let entry_price = 0;
      let exit_price: number | undefined;
      if (cols.entry >= 0 && values[cols.entry]) entry_price = parseNumber(values[cols.entry]);
      if (cols.exit >= 0 && values[cols.exit]) {
        const exitVal = parseNumber(values[cols.exit]);
        exit_price = exitVal !== 0 ? exitVal : undefined;
      }

      let timestamp = new Date().toISOString();
      if (cols.date >= 0 && values[cols.date]) {
        const dateStr = values[cols.date];
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) timestamp = parsed.toISOString();
      }

      let instrument = selectedBot?.instrument || "MNQ";
      if (cols.instrument >= 0 && values[cols.instrument]) {
        const sym = values[cols.instrument].toUpperCase();
        if (sym.includes("NQ") || sym.includes("MNQ")) instrument = "MNQ";
        else if (sym.includes("ES") || sym.includes("MES")) instrument = "MES";
        else instrument = sym.slice(0, 6);
      }

      let direction: "long" | "short" = "long";
      if (cols.direction >= 0 && values[cols.direction]) {
        const dir = values[cols.direction].toLowerCase().trim();
        if (dir === "s" || dir === "short" || dir === "sell" || dir === "-1") direction = "short";
      }

      trades.push({
        bot_id: botId,
        bot_account_id: accountId || undefined,
        timestamp,
        instrument,
        direction,
        entry_price,
        exit_price,
        contracts,
        pnl,
        status: "closed",
        source: "manual",
      });
    }

    if (trades.length === 0) {
      setError("No valid trades found in CSV");
      return;
    }

    setParsedTrades(trades);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setCsvData(text);
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Bot</Label>
          <Select value={botId} onValueChange={(v) => { setBotId(v); setAccountId(""); }}>
            <SelectTrigger>
              <SelectValue placeholder="Select bot" />
            </SelectTrigger>
            <SelectContent>
              {bots.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} {b.version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Account (Optional)</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="No specific account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No specific account</SelectItem>
              {botAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.account_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Upload CSV or Paste Data</Label>
        <Input type="file" accept=".csv,.txt" onChange={handleFileUpload} />
        <p className="text-xs text-muted-foreground">
          Supports most broker exports. Looks for: instrument, contracts, entry, exit, pnl, date
        </p>
      </div>

      <div className="space-y-1">
        <Label>Or paste CSV data</Label>
        <Textarea
          rows={4}
          placeholder="Paste CSV data here..."
          value={csvData}
          onChange={(e) => {
            setCsvData(e.target.value);
            if (e.target.value.trim()) parseCSV(e.target.value);
            else setParsedTrades([]);
          }}
          className="font-mono text-xs"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {parsedTrades.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Preview: {parsedTrades.length} trades to import</p>
          <div className="max-h-48 overflow-auto rounded border p-2 text-xs">
            <table className="w-full">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left">Date</th>
                  <th className="text-left">Instrument</th>
                  <th className="text-right">Entry</th>
                  <th className="text-right">Exit</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">P&L</th>
                </tr>
              </thead>
              <tbody>
                {parsedTrades.slice(0, 10).map((t, i) => (
                  <tr key={i}>
                    <td>{format(new Date(t.timestamp), "MMM d")}</td>
                    <td>{t.instrument}</td>
                    <td className="text-right tabular-nums">{t.entry_price ? t.entry_price.toLocaleString() : "-"}</td>
                    <td className="text-right tabular-nums">{t.exit_price ? t.exit_price.toLocaleString() : "-"}</td>
                    <td className="text-right">{t.contracts}</td>
                    <td className={cn("text-right font-medium tabular-nums", (t.pnl || 0) >= 0 ? "text-success" : "text-destructive")}>
                      {(t.pnl || 0) >= 0 ? "+" : ""}${(t.pnl || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
                {parsedTrades.length > 10 && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted-foreground">
                      ... and {parsedTrades.length - 10} more
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Total P&L:{" "}
            <span className={cn("font-medium", parsedTrades.reduce((s, t) => s + (t.pnl || 0), 0) >= 0 ? "text-success" : "text-destructive")}>
              ${parsedTrades.reduce((s, t) => s + (t.pnl || 0), 0).toFixed(2)}
            </span>
          </p>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            const finalTrades = parsedTrades.map((t) => ({ ...t, bot_id: botId, bot_account_id: accountId || undefined }));
            onImport(finalTrades);
          }}
          disabled={parsedTrades.length === 0}
          className="bg-accent text-accent-foreground hover:bg-accent/90"
        >
          Import {parsedTrades.length} Trades
        </Button>
      </div>
    </div>
  );
}

export default BotTrades;
