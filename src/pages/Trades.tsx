import { useState, useMemo } from "react";
import { format } from "date-fns";
import {
  Plus,
  Pencil,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Star,
  Download,
  Upload,
} from "lucide-react";
import { useJournal } from "@/context/JournalContext";
import { Trade, INSTRUMENTS } from "@/types";
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

const Trades = () => {
  const { trades, tradingSetups, accounts, addTrade, updateTrade, deleteTrade } =
    useJournal();
  const tradingAccounts = useMemo(() => {
    const active = accounts.filter(
      (a) =>
        (a.type === "funded" && a.status === "active") ||
        (a.type === "evaluation" && a.status === "in_progress")
    );
    const nameCount = new Map<string, number>();
    const nameIndex = new Map<string, number>();
    active.forEach((a) => {
      const key = `${a.propFirm} $${(a.accountSize / 1000).toFixed(0)}K`;
      nameCount.set(key, (nameCount.get(key) || 0) + 1);
    });
    return active.map((a) => {
      const key = `${a.propFirm} $${(a.accountSize / 1000).toFixed(0)}K`;
      const count = nameCount.get(key) || 1;
      const idx = (nameIndex.get(key) || 0) + 1;
      nameIndex.set(key, idx);
      const suffix = a.type === "evaluation" ? " (Eval)" : "";
      return { ...a, label: count > 1 ? `${key} #${idx}${suffix}` : `${key}${suffix}` };
    });
  }, [accounts]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [filterSetup, setFilterSetup] = useState("all");
  const [filterResult, setFilterResult] = useState("all");
  const [filterInstrument, setFilterInstrument] = useState("all");

  const setupMap = useMemo(() => {
    const map = new Map<string, string>();
    tradingSetups.forEach((s) => map.set(s.id, s.name));
    return map;
  }, [tradingSetups]);

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    tradingAccounts.forEach((a) => map.set(a.id, a.label));
    return map;
  }, [tradingAccounts]);

  const filteredTrades = useMemo(() => {
    let result = [...trades];
    if (filterSetup !== "all")
      result = result.filter((t) => t.setupId === filterSetup);
    if (filterResult !== "all")
      result = result.filter((t) => t.result === filterResult);
    if (filterInstrument !== "all")
      result = result.filter((t) => t.instrument === filterInstrument);
    return result.sort(
      (a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime() ||
        (b.time ?? "").localeCompare(a.time ?? "")
    );
  }, [trades, filterSetup, filterResult, filterInstrument]);

  const stats = useMemo(() => {
    // Split trades represent N orders (one per active account)
    const splitN = Math.max(tradingAccounts.length, 1);
    const orderCount = (t: Trade) => t.accountId === "split" ? splitN : 1;

    const wins = filteredTrades.reduce((n, t) => n + (t.result === "win" ? orderCount(t) : 0), 0);
    const losses = filteredTrades.reduce((n, t) => n + (t.result === "loss" ? orderCount(t) : 0), 0);
    const totalPnl = filteredTrades.reduce((sum, t) => sum + t.pnl, 0);
    const tradingCount = wins + losses;
    const winRate = tradingCount > 0 ? Math.round((wins / tradingCount) * 100) : 0;
    const avgWin =
      wins > 0
        ? filteredTrades
            .filter((t) => t.result === "win")
            .reduce((sum, t) => sum + t.pnl, 0) / wins
        : 0;
    const avgLoss =
      losses > 0
        ? Math.abs(
            filteredTrades
              .filter((t) => t.result === "loss")
              .reduce((sum, t) => sum + t.pnl, 0) / losses
          )
        : 0;
    const profitFactor = avgLoss > 0 ? (avgWin * wins) / (avgLoss * losses) : wins > 0 ? Infinity : 0;
    const avgRating =
      filteredTrades.filter((t) => t.rating).length > 0
        ? filteredTrades
            .filter((t) => t.rating)
            .reduce((sum, t) => sum + (t.rating ?? 0), 0) /
          filteredTrades.filter((t) => t.rating).length
        : 0;
    const total = filteredTrades.reduce((n, t) => n + orderCount(t), 0);

    return { wins, losses, totalPnl, winRate, avgWin, avgLoss, profitFactor, avgRating, total };
  }, [filteredTrades, tradingAccounts]);

  const instruments = useMemo(() => {
    const set = new Set(trades.map((t) => t.instrument));
    return Array.from(set).sort();
  }, [trades]);

  const handleExportCSV = () => {
    const headers = [
      "Date",
      "Time",
      "Instrument",
      "Setup",
      "Account",
      "Direction",
      "Entry",
      "Exit",
      "Stop",
      "Contracts",
      "P&L",
      "Result",
      "R:R",
      "Rating",
      "Notes",
    ];
    const rows = filteredTrades.map((t) => [
      t.date,
      t.time ?? "",
      t.instrument,
      setupMap.get(t.setupId) ?? "",
      t.accountId === "split" ? "Split" : t.accountId ? accountMap.get(t.accountId) ?? "" : "",
      t.direction,
      t.entry?.toString() ?? "",
      t.exit?.toString() ?? "",
      t.stopLoss?.toString() ?? "",
      t.contracts.toString(),
      t.pnl.toString(),
      t.result,
      t.riskReward?.toString() ?? "",
      t.rating?.toString() ?? "",
      t.notes ?? "",
    ]);
    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trades.csv";
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Trade Journal</h1>
          <p className="page-subtitle">
            Log every trade, track your edge
          </p>
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
                Log Trade
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingTrade ? "Edit Trade" : "Log New Trade"}
                </DialogTitle>
              </DialogHeader>
              <TradeForm
                tradingSetups={tradingSetups}
                tradingAccounts={tradingAccounts}
                initialData={editingTrade}
                onSave={(trade) => {
                  if (editingTrade) {
                    updateTrade(trade as Trade);
                  } else {
                    addTrade(trade);
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
                tradingSetups={tradingSetups}
                tradingAccounts={tradingAccounts}
                allAccounts={accounts}
                onImport={(newTrades) => {
                  newTrades.forEach(t => addTrade(t));
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
          <p
            className={cn(
              "text-lg font-bold",
              stats.totalPnl >= 0 ? "text-success" : "text-destructive"
            )}
          >
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
          <p className="text-lg font-bold text-success">
            ${Math.round(stats.avgWin).toLocaleString()}
          </p>
        </div>
        <div className="stat-card p-3">
          <p className="section-label">Avg Loss</p>
          <p className="text-lg font-bold text-destructive">
            ${Math.round(stats.avgLoss).toLocaleString()}
          </p>
        </div>
        <div className="stat-card p-3">
          <p className="section-label">
            Profit Factor
          </p>
          <p className="text-lg font-bold">
            {stats.profitFactor === Infinity
              ? "∞"
              : stats.profitFactor.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-40">
          <Select value={filterSetup} onValueChange={setFilterSetup}>
            <SelectTrigger>
              <SelectValue placeholder="Setup" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Setups</SelectItem>
              {tradingSetups.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
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
              <TableHead>Instrument</TableHead>
              <TableHead>Setup</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Dir</TableHead>
              <TableHead className="text-right">Entry</TableHead>
              <TableHead className="text-right">Exit</TableHead>
              <TableHead className="text-right">R:R</TableHead>
              <TableHead className="text-right">P&L</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTrades.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={11}
                  className="py-12 text-center text-muted-foreground"
                >
                  No trades found. Log your first trade to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredTrades.map((trade) => (
                <TableRow key={trade.id} className="group">
                  <TableCell className="whitespace-nowrap">
                    <div>
                      {format(new Date(trade.date), "MMM d")}
                      {trade.time && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          {trade.time}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {trade.instrument}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {setupMap.get(trade.setupId) ?? "Unknown"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {trade.accountId === "split"
                        ? "Split"
                        : trade.accountId
                        ? accountMap.get(trade.accountId) ?? "—"
                        : "—"}
                    </span>
                  </TableCell>
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
                    {trade.entry?.toLocaleString() ?? "-"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {trade.exit?.toLocaleString() ?? "-"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {trade.riskReward ? trade.riskReward.toFixed(1) : "-"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-bold tabular-nums",
                      trade.pnl > 0
                        ? "text-success"
                        : trade.pnl < 0
                        ? "text-destructive"
                        : ""
                    )}
                  >
                    {trade.pnl >= 0 ? "+" : ""}$
                    {Math.abs(trade.pnl).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {trade.rating ? (
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={cn(
                              "h-3 w-3",
                              i < trade.rating!
                                ? "fill-warning text-warning"
                                : "text-muted-foreground/20"
                            )}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
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
                        onClick={() => deleteTrade(trade.id)}
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

// ── Trade Form ───────────────────────────────────────────────

interface TradeFormProps {
  tradingSetups: { id: string; name: string }[];
  tradingAccounts: { id: string; propFirm: string; accountSize: number; label: string }[];
  initialData?: Trade | null;
  onSave: (trade: Omit<Trade, "id"> | Trade) => void;
  onClose: () => void;
}

function TradeForm({
  tradingSetups,
  tradingAccounts,
  initialData,
  onSave,
  onClose,
}: TradeFormProps) {
  const [formData, setFormData] = useState<Partial<Trade>>(
    initialData ?? {
      date: new Date().toISOString().split("T")[0],
      time: "",
      instrument: "NQ",
      setupId: tradingSetups[0]?.id ?? "",
      accountId: tradingAccounts[0]?.id ?? "",
      direction: "long",
      entry: undefined,
      exit: undefined,
      stopLoss: undefined,
      takeProfit: undefined,
      contracts: 1,
      pnl: undefined,
      result: "win",
      riskReward: undefined,
      rating: undefined,
      notes: "",
    }
  );

  const [ratingHover, setRatingHover] = useState(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trade = {
      ...formData,
      entry: formData.entry ?? 0,
      pnl: formData.pnl ?? 0,
      contracts: formData.contracts ?? 1,
    };
    onSave(trade as Trade);
  };

  const set = (updates: Partial<Trade>) =>
    setFormData((prev) => ({ ...prev, ...updates }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="trade-date">Date</Label>
          <Input
            id="trade-date"
            type="date"
            value={formData.date}
            onChange={(e) => set({ date: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="trade-time">Time</Label>
          <Input
            id="trade-time"
            type="time"
            value={formData.time}
            onChange={(e) => set({ time: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Instrument</Label>
          <Select
            value={formData.instrument}
            onValueChange={(v) => set({ instrument: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INSTRUMENTS.map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>Setup</Label>
          <Select
            value={formData.setupId}
            onValueChange={(v) => set({ setupId: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select setup" />
            </SelectTrigger>
            <SelectContent>
              {tradingSetups.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Account</Label>
          <Select
            value={formData.accountId ?? ""}
            onValueChange={(v) => set({ accountId: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {tradingAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
              {tradingAccounts.length > 1 && (
                <SelectItem value="split">All Accounts (split)</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Direction</Label>
          <Select
            value={formData.direction}
            onValueChange={(v) =>
              set({ direction: v as Trade["direction"] })
            }
          >
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
          <Label htmlFor="trade-entry">Entry</Label>
          <Input
            id="trade-entry"
            type="number"
            step="any"
            value={formData.entry ?? ""}
            onChange={(e) => set({ entry: e.target.value !== '' ? parseFloat(e.target.value) : undefined })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="trade-exit">Exit</Label>
          <Input
            id="trade-exit"
            type="number"
            step="any"
            value={formData.exit ?? ""}
            onChange={(e) =>
              set({
                exit: e.target.value ? parseFloat(e.target.value) : undefined,
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="trade-sl">Stop Loss</Label>
          <Input
            id="trade-sl"
            type="number"
            step="any"
            value={formData.stopLoss ?? ""}
            onChange={(e) =>
              set({
                stopLoss: e.target.value
                  ? parseFloat(e.target.value)
                  : undefined,
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="trade-contracts">Contracts</Label>
          <Input
            id="trade-contracts"
            type="number"
            min="1"
            step="1"
            value={formData.contracts ?? 1}
            onChange={(e) =>
              set({ contracts: parseInt(e.target.value) || 1 })
            }
            required
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="trade-pnl">P&L ($)</Label>
          <Input
            id="trade-pnl"
            type="number"
            step="0.01"
            value={formData.pnl ?? ""}
            onChange={(e) => set({ pnl: e.target.value !== '' ? parseFloat(e.target.value) : undefined })}
            required
          />
        </div>
        <div className="space-y-1">
          <Label>Result</Label>
          <Select
            value={formData.result}
            onValueChange={(v) => set({ result: v as Trade["result"] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="win">Win</SelectItem>
              <SelectItem value="loss">Loss</SelectItem>
              <SelectItem value="breakeven">Breakeven</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="trade-rr">R:R</Label>
          <Input
            id="trade-rr"
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 2.5"
            value={formData.riskReward ?? ""}
            onChange={(e) =>
              set({
                riskReward: e.target.value
                  ? parseFloat(e.target.value)
                  : undefined,
              })
            }
          />
        </div>
      </div>

      {/* Star Rating */}
      <div className="space-y-1">
        <Label>Execution Rating</Label>
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setRatingHover(i + 1)}
              onMouseLeave={() => setRatingHover(0)}
              onClick={() =>
                set({ rating: formData.rating === i + 1 ? undefined : i + 1 })
              }
              className="p-0.5"
            >
              <Star
                className={cn(
                  "h-5 w-5 transition-colors",
                  i < (ratingHover || formData.rating || 0)
                    ? "fill-warning text-warning"
                    : "text-muted-foreground/30 hover:text-warning/50"
                )}
              />
            </button>
          ))}
          {formData.rating && (
            <span className="ml-2 text-xs text-muted-foreground">
              {formData.rating}/5
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="trade-notes">Notes</Label>
        <Textarea
          id="trade-notes"
          rows={3}
          placeholder="What went right/wrong? Was this an A+ setup?"
          value={formData.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          className="bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {initialData ? "Update" : "Log"} Trade
        </Button>
      </div>
    </form>
  );
}

// ── Import Form ───────────────────────────────────────────────

interface ImportFormProps {
  tradingSetups: { id: string; name: string }[];
  tradingAccounts: { id: string; propFirm: string; accountSize: number; label: string }[];
  allAccounts: { id: string; propFirm: string; accountSize: number; type: string; status: string }[];
  onImport: (trades: Omit<Trade, "id">[]) => void;
  onClose: () => void;
}

function ImportForm({
  tradingSetups,
  tradingAccounts,
  allAccounts,
  onImport,
  onClose,
}: ImportFormProps) {
  const [accountId, setAccountId] = useState(tradingAccounts[0]?.id ?? "");
  const [setupId, setSetupId] = useState(tradingSetups[0]?.id ?? "");
  const [csvData, setCsvData] = useState("");
  const [parsedTrades, setParsedTrades] = useState<Omit<Trade, "id">[]>([]);
  const [error, setError] = useState("");

  // All accounts for selection (not just active)
  const allAccountOptions = useMemo(() => {
    return allAccounts.map(a => ({
      id: a.id,
      label: `${a.propFirm} $${(a.accountSize / 1000).toFixed(0)}K ${a.type === 'evaluation' ? `(${a.status})` : '(Funded)'}`,
    }));
  }, [allAccounts]);

  // Helper to parse numbers, handling accounting format (123.45) = -123.45
  const parseNumber = (str: string): number => {
    if (!str) return 0;
    const trimmed = str.trim();
    // Check for accounting format: (123.45) means negative
    const isNegative = trimmed.startsWith("(") && trimmed.endsWith(")");
    // Remove everything except digits, decimal, and minus (strips commas, $, etc.)
    const cleaned = trimmed.replace(/[^0-9.-]/g, "");
    const num = parseFloat(cleaned) || 0;
    return isNegative ? -Math.abs(num) : num;
  };

  // Proper CSV line parser that handles quoted fields with commas
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else if (char === '"') {
          // End of quoted field
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          // Start of quoted field
          inQuotes = true;
        } else if (char === ',') {
          // Field separator
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
    }
    // Don't forget the last field
    result.push(current.trim());
    return result;
  };

  const parseCSV = (text: string) => {
    setError("");
    const lines = text.trim().split("\n").map(l => l.replace(/\r$/, "")); // Handle Windows line endings
    if (lines.length < 2) {
      setError("CSV must have headers and at least one data row");
      return;
    }

    // Parse headers (case-insensitive) using proper CSV parsing
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, ""));

    // Find column indices
    const findCol = (...names: string[]) =>
      headers.findIndex(h => names.some(n => h.includes(n)));

    const cols = {
      instrument: findCol("instrument", "symbol", "ticker", "contract"),
      contracts: findCol("qty", "quantity", "size", "lot", "filled"),
      entry: findCol("entry", "avg", "fill", "price"),
      exit: findCol("exit", "close"),
      pnl: findCol("pnl", "p&l", "profit", "net", "realized", "gain"),
      date: findCol("date", "exec", "timestamp"),
      time: findCol("time", "exec time"),
      direction: findCol("direction", "side", "b/s", "action", "type"),
    };

    const trades: Omit<Trade, "id">[] = [];

    for (let i = 1; i < lines.length; i++) {
      // Use proper CSV parsing that handles quoted fields with commas
      const values = parseCSVLine(lines[i]).map(v => v.replace(/^["']|["']$/g, "")); // Strip outer quotes only
      if (values.length < 2 || values.every(v => !v.trim())) continue;

      // Parse P&L - handles (50.00) as -50.00 and -50.00 as -50.00
      let pnl = 0;
      if (cols.pnl >= 0 && values[cols.pnl]) {
        pnl = parseNumber(values[cols.pnl]);
      }

      // Parse contracts
      let contracts = 1;
      if (cols.contracts >= 0 && values[cols.contracts]) {
        contracts = Math.abs(parseInt(values[cols.contracts])) || 1;
      }

      // Parse entry/exit - preserve negatives for prices (though rare)
      let entry = 0;
      let exit: number | undefined;
      if (cols.entry >= 0 && values[cols.entry]) {
        entry = parseNumber(values[cols.entry]);
      }
      if (cols.exit >= 0 && values[cols.exit]) {
        const exitVal = parseNumber(values[cols.exit]);
        exit = exitVal !== 0 ? exitVal : undefined;
      }

      // Parse date
      let date = new Date().toISOString().split("T")[0];
      let time = "";
      if (cols.date >= 0 && values[cols.date]) {
        const dateStr = values[cols.date];

        // Try ISO format first: YYYY-MM-DD or YYYY/MM/DD
        const isoMatch = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (isoMatch) {
          const [, y, m, d] = isoMatch;
          date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        } else {
          // Try MM/DD/YYYY or MM-DD-YYYY format
          const usMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
          if (usMatch) {
            const [, m, d, y] = usMatch;
            const year = y.length === 2 ? `20${y}` : y;
            date = `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
          }
        }

        // Parse time from date column
        const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (timeMatch) {
          time = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
        }
      }

      // Check separate time column
      if (!time && cols.time >= 0 && values[cols.time]) {
        const timeStr = values[cols.time];
        const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (timeMatch) {
          time = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
        }
      }

      // Parse instrument
      let instrument = "NQ";
      if (cols.instrument >= 0 && values[cols.instrument]) {
        const sym = values[cols.instrument].toUpperCase();
        if (sym.includes("NQ") || sym.includes("MNQ")) instrument = "NQ";
        else if (sym.includes("ES") || sym.includes("MES")) instrument = "ES";
        else if (sym.includes("GC") || sym.includes("MGC")) instrument = "GC";
        else if (sym.includes("CL") || sym.includes("MCL")) instrument = "CL";
        else if (sym.includes("YM") || sym.includes("MYM")) instrument = "YM";
        else if (sym.includes("RTY") || sym.includes("M2K")) instrument = "RTY";
        else instrument = sym.slice(0, 6);
      }

      // Determine direction from explicit column
      let direction: "long" | "short" = "long";
      if (cols.direction >= 0 && values[cols.direction]) {
        const dir = values[cols.direction].toLowerCase().trim();
        // Check for short: "short", "sell", "s", "-1", "-"
        if (dir === "s" || dir === "short" || dir === "sell" || dir === "-1" || dir === "-" || dir.startsWith("sell") || dir.startsWith("short")) {
          direction = "short";
        }
      }

      // Determine result
      const result: "win" | "loss" | "breakeven" =
        pnl > 0 ? "win" : pnl < 0 ? "loss" : "breakeven";

      trades.push({
        date,
        time,
        instrument,
        setupId,
        accountId,
        direction,
        entry,
        exit,
        contracts,
        pnl,
        result,
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

  const handlePaste = (text: string) => {
    setCsvData(text);
    if (text.trim()) {
      parseCSV(text);
    } else {
      setParsedTrades([]);
    }
  };


  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Account</Label>
          <Select value={accountId} onValueChange={(v) => { setAccountId(v); }}>
            <SelectTrigger>
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {allAccountOptions.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Default Setup</Label>
          <Select value={setupId} onValueChange={(v) => { setSetupId(v); }}>
            <SelectTrigger>
              <SelectValue placeholder="Select setup" />
            </SelectTrigger>
            <SelectContent>
              {tradingSetups.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Upload CSV or Paste Data</Label>
        <div className="flex gap-2">
          <Input
            type="file"
            accept=".csv,.txt"
            onChange={handleFileUpload}
            className="flex-1"
          />
        </div>
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
          onChange={(e) => handlePaste(e.target.value)}
          className="font-mono text-xs"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {parsedTrades.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Preview: {parsedTrades.length} trades to import
          </p>
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
                    <td>{t.date}</td>
                    <td>{t.instrument}</td>
                    <td className="text-right tabular-nums">{t.entry ? t.entry.toLocaleString() : "-"}</td>
                    <td className="text-right tabular-nums">{t.exit ? t.exit.toLocaleString() : "-"}</td>
                    <td className="text-right">{t.contracts}</td>
                    <td className={cn(
                      "text-right font-medium tabular-nums",
                      t.pnl >= 0 ? "text-success" : "text-destructive"
                    )}>
                      {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
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
            Total P&L: <span className={cn(
              "font-medium",
              parsedTrades.reduce((s, t) => s + t.pnl, 0) >= 0 ? "text-success" : "text-destructive"
            )}>
              ${parsedTrades.reduce((s, t) => s + t.pnl, 0).toFixed(2)}
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
            // Apply current account/setup to all trades before importing
            const finalTrades = parsedTrades.map(t => ({ ...t, accountId, setupId }));
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

export default Trades;
