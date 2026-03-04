import React, { useState, useMemo } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  Star,
  CrosshairIcon,
  Camera,
} from "lucide-react";
import { useJournal } from "@/context/JournalContext";
import { DailyEntry, Trade, INSTRUMENTS } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { DailySnapshot } from "@/components/DailySnapshot";

const Calendar = () => {
  const {
    dailyEntries,
    upsertDailyEntry,
    deleteDailyEntry,
    trades,
    tradingSetups,
    accounts,
    addTrade,
    updateTrade,
    deleteTrade,
  } = useJournal();
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
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isEntryDialogOpen, setIsEntryDialogOpen] = useState(false);
  const [isTradeDialogOpen, setIsTradeDialogOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);

  // Build a lookup map for daily entries
  const entryMap = useMemo(() => {
    const map = new Map<string, DailyEntry>();
    dailyEntries.forEach((e) => map.set(e.date, e));
    return map;
  }, [dailyEntries]);

  // Build a lookup map for trades by date
  const tradesByDate = useMemo(() => {
    const map = new Map<string, Trade[]>();
    trades.forEach((t) => {
      const existing = map.get(t.date) || [];
      existing.push(t);
      map.set(t.date, existing);
    });
    return map;
  }, [trades]);

  // Setup name lookup
  const setupMap = useMemo(() => {
    const m = new Map<string, string>();
    tradingSetups.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [tradingSetups]);

  // Monthly stats (derived from trades + daily entries)
  const monthStats = useMemo(() => {
    const monthStr = format(currentMonth, "yyyy-MM");
    const monthTrades = trades.filter((t) => t.date.startsWith(monthStr));
    const totalPnl = monthTrades.reduce((sum, t) => sum + t.pnl, 0);
    const tradingDays = new Set(monthTrades.map((t) => t.date)).size;

    // Win/loss days by net P&L per day
    const dayPnl = new Map<string, number>();
    monthTrades.forEach((t) => {
      dayPnl.set(t.date, (dayPnl.get(t.date) || 0) + t.pnl);
    });
    // Also factor in manual daily entries if no trades exist for that day
    const monthEntries = dailyEntries.filter(
      (e) => e.date.startsWith(monthStr) && e.pnl !== undefined
    );
    monthEntries.forEach((e) => {
      if (!dayPnl.has(e.date)) {
        dayPnl.set(e.date, e.pnl!);
      }
    });

    let winDays = 0;
    let lossDays = 0;
    dayPnl.forEach((pnl) => {
      if (pnl > 0) winDays++;
      else if (pnl < 0) lossDays++;
    });

    const allDays = dayPnl.size;
    return { totalPnl, winDays, lossDays, tradingDays: allDays };
  }, [trades, dailyEntries, currentMonth]);

  // Generate calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const days: Date[] = [];
    let day = calStart;
    while (day <= calEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentMonth]);

  const selectedDateStr = selectedDate
    ? format(selectedDate, "yyyy-MM-dd")
    : null;
  const selectedEntry = selectedDateStr
    ? entryMap.get(selectedDateStr)
    : null;
  const selectedTrades = selectedDateStr
    ? (tradesByDate.get(selectedDateStr) || []).sort((a, b) =>
        (a.time ?? "").localeCompare(b.time ?? "")
      )
    : [];
  const selectedDayPnl = selectedTrades.reduce((sum, t) => sum + t.pnl, 0);

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-subtitle">
            Track your daily P&L, trades, and journal notes
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsSnapshotOpen(true)}
          className="gap-2"
        >
          <Camera className="h-4 w-4" />
          Daily Snapshot
        </Button>
      </div>

      {/* Monthly stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="stat-card p-4">
          <p className="text-xs text-muted-foreground">Monthly P&L</p>
          <p
            className={cn(
              "text-xl font-bold",
              monthStats.totalPnl >= 0 ? "text-success" : "text-destructive"
            )}
          >
            {monthStats.totalPnl >= 0 ? "+" : ""}$
            {Math.abs(monthStats.totalPnl).toLocaleString()}
          </p>
        </div>
        <div className="stat-card p-4">
          <p className="text-xs text-muted-foreground">Win Days</p>
          <p className="text-xl font-bold text-success">{monthStats.winDays}</p>
        </div>
        <div className="stat-card p-4">
          <p className="text-xs text-muted-foreground">Loss Days</p>
          <p className="text-xl font-bold text-destructive">
            {monthStats.lossDays}
          </p>
        </div>
        <div className="stat-card p-4">
          <p className="text-xs text-muted-foreground">Win Rate</p>
          <p className="text-xl font-bold">
            {monthStats.tradingDays > 0
              ? Math.round(
                  (monthStats.winDays / monthStats.tradingDays) * 100
                )
              : 0}
            %
          </p>
        </div>
      </div>

      {/* Calendar Grid — full width */}
      <div className="stat-card p-4 sm:p-6">
        {/* Month navigation */}
        <div className="mb-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold">
            {format(currentMonth, "MMMM yyyy")}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Day headers */}
        <div className="mb-1 grid grid-cols-8 gap-1.5">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Week"].map((d) => (
            <div
              key={d}
              className={cn(
                "py-2 text-center text-xs font-medium text-muted-foreground",
                d === "Week" && "bg-muted/30 rounded-t-md"
              )}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells with weekly summaries */}
        <div className="grid grid-cols-8 gap-1.5">
          {calendarDays.map((day, idx) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const entry = entryMap.get(dateStr);
            const dayTrades = tradesByDate.get(dateStr) || [];
            const inMonth = isSameMonth(day, currentMonth);
            const selected = selectedDate && isSameDay(day, selectedDate);
            const today = isToday(day);
            const hasNotes = !!entry?.notes;

            // P&L: sum of trades if any, else manual entry
            const tradePnl =
              dayTrades.length > 0
                ? dayTrades.reduce((s, t) => s + t.pnl, 0)
                : null;
            const pnl = tradePnl ?? entry?.pnl;
            const tradeCount = dayTrades.length;
            const hasPnl = pnl !== undefined && pnl !== null;
            const isGreen = hasPnl && pnl > 0;
            const isRed = hasPnl && pnl < 0;

            // Check if this is the last day of a week (Sunday = index 6 in week)
            const isEndOfWeek = (idx + 1) % 7 === 0;

            // Calculate weekly stats if end of week
            let weeklyPnl = 0;
            let weeklyTrades = 0;
            if (isEndOfWeek) {
              const weekStart = idx - 6;
              for (let i = weekStart; i <= idx; i++) {
                const weekDay = calendarDays[i];
                const weekDateStr = format(weekDay, "yyyy-MM-dd");
                const weekDayTrades = tradesByDate.get(weekDateStr) || [];
                const weekEntry = entryMap.get(weekDateStr);
                weeklyTrades += weekDayTrades.length;
                if (weekDayTrades.length > 0) {
                  weeklyPnl += weekDayTrades.reduce((s, t) => s + t.pnl, 0);
                } else if (weekEntry?.pnl !== undefined) {
                  weeklyPnl += weekEntry.pnl;
                }
              }
            }

            return (
              <React.Fragment key={dateStr}>
                <button
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    "relative flex min-h-[90px] flex-col items-center rounded-lg border p-1.5 text-left transition-all hover:border-accent/50 sm:min-h-[100px] sm:p-2",
                    !inMonth && "opacity-30",
                    selected
                      ? "border-accent bg-accent/5"
                      : isGreen
                      ? "border-success/30 bg-success/[0.06]"
                      : isRed
                      ? "border-destructive/30 bg-destructive/[0.06]"
                      : "border-border bg-card/50",
                    today && !selected && !isGreen && !isRed && "border-accent/40"
                  )}
                  style={
                    !selected && isGreen
                      ? { boxShadow: "inset 0 0 12px hsl(var(--success) / 0.08)" }
                      : !selected && isRed
                      ? { boxShadow: "inset 0 0 12px hsl(var(--destructive) / 0.08)" }
                      : undefined
                  }
                >
                  <span
                    className={cn(
                      "mb-1 text-xs font-medium sm:text-sm",
                      today &&
                        "rounded-full bg-accent px-1.5 py-0.5 text-accent-foreground",
                      !inMonth && "text-muted-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </span>

                  {hasPnl && (
                    <span
                      className={cn(
                        "text-lg font-bold sm:text-xl",
                        isGreen
                          ? "text-success"
                          : isRed
                          ? "text-destructive"
                          : "text-muted-foreground"
                      )}
                    >
                      {pnl > 0 ? "+" : ""}${Math.abs(pnl).toLocaleString()}
                    </span>
                  )}

                  {/* Trade count + notes indicators */}
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between">
                    {tradeCount > 0 && (
                      <span className="flex items-center gap-0.5 text-[9px] font-medium text-muted-foreground">
                        <CrosshairIcon className="h-2.5 w-2.5" />
                        {tradeCount}
                      </span>
                    )}
                    {hasNotes && (
                      <FileText className="ml-auto h-3 w-3 text-muted-foreground/60" />
                    )}
                  </div>
                </button>

                {/* Weekly summary cell */}
                {isEndOfWeek && (
                  <div
                    key={`week-${idx}`}
                    className={cn(
                      "flex min-h-[90px] flex-col items-center justify-center rounded-lg border p-1.5 sm:min-h-[100px] sm:p-2",
                      "bg-muted/30 border-muted-foreground/20",
                      weeklyPnl > 0 && "border-success/30 bg-success/[0.04]",
                      weeklyPnl < 0 && "border-destructive/30 bg-destructive/[0.04]"
                    )}
                  >
                    <span
                      className={cn(
                        "text-lg font-bold sm:text-xl",
                        weeklyPnl > 0
                          ? "text-success"
                          : weeklyPnl < 0
                          ? "text-destructive"
                          : "text-muted-foreground"
                      )}
                    >
                      {weeklyPnl !== 0 ? (weeklyPnl > 0 ? "+" : "") + "$" + Math.abs(weeklyPnl).toLocaleString() : "—"}
                    </span>
                    {weeklyTrades > 0 && (
                      <span className="mt-1 flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
                        <CrosshairIcon className="h-2.5 w-2.5" />
                        {weeklyTrades} trades
                      </span>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Day Details Dialog */}
      <Dialog open={!!selectedDate} onOpenChange={(open) => { if (!open) setSelectedDate(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedDate && format(selectedDate, "EEEE, MMM d yyyy")}
            </DialogTitle>
          </DialogHeader>

          {selectedDate && (
            <div className="space-y-4">
              {/* Day P&L Summary */}
              {(selectedTrades.length > 0 || selectedEntry?.pnl !== undefined) && (
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Day P&L</p>
                    <p
                      className={cn(
                        "text-2xl font-bold",
                        (selectedTrades.length > 0 ? selectedDayPnl : selectedEntry?.pnl ?? 0) >= 0
                          ? "text-success"
                          : "text-destructive"
                      )}
                    >
                      {(selectedTrades.length > 0 ? selectedDayPnl : selectedEntry?.pnl ?? 0) >= 0 ? "+" : ""}$
                      {Math.abs(selectedTrades.length > 0 ? selectedDayPnl : selectedEntry?.pnl ?? 0).toLocaleString()}
                    </p>
                  </div>
                  {selectedTrades.length > 0 && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Trades</p>
                      <p className="text-lg font-bold">{selectedTrades.length}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Trades List */}
              {selectedTrades.length > 0 && (
                <div>
                  <p className="mb-2 section-label">
                    Trades
                  </p>
                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                    {selectedTrades.map((trade) => (
                      <div
                        key={trade.id}
                        className="group flex items-center gap-2 rounded-lg border border-border bg-card p-2.5 transition-colors hover:bg-secondary/50"
                      >
                        {trade.direction === "long" ? (
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-success" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4 shrink-0 text-destructive" />
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold">
                              {trade.instrument}
                            </span>
                            <span className="rounded bg-background/50 px-1 py-0.5 text-[9px] text-muted-foreground">
                              {setupMap.get(trade.setupId) ?? "—"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {trade.time && (
                              <span className="text-[10px] text-muted-foreground">
                                {trade.time}
                              </span>
                            )}
                            {trade.rating && (
                              <span className="flex gap-0.5">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <Star
                                    key={i}
                                    className={cn(
                                      "h-2 w-2",
                                      i < trade.rating!
                                        ? "fill-warning text-warning"
                                        : "text-muted-foreground/15"
                                    )}
                                  />
                                ))}
                              </span>
                            )}
                          </div>
                          {trade.notes && (
                            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                              {trade.notes}
                            </p>
                          )}
                        </div>

                        <p
                          className={cn(
                            "text-sm font-bold tabular-nums",
                            trade.pnl > 0
                              ? "text-success"
                              : trade.pnl < 0
                              ? "text-destructive"
                              : "text-muted-foreground"
                          )}
                        >
                          {trade.pnl >= 0 ? "+" : ""}$
                          {Math.abs(trade.pnl).toLocaleString()}
                        </p>

                        {/* Edit / Delete on hover */}
                        <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setEditingTrade(trade);
                              setIsTradeDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-2.5 w-2.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => deleteTrade(trade.id)}
                          >
                            <Trash2 className="h-2.5 w-2.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Journal Notes */}
              {selectedEntry?.notes && (
                <div>
                  <p className="mb-1 section-label">
                    Journal Notes
                  </p>
                  <div className="rounded-lg border border-border bg-card p-3 text-sm leading-relaxed whitespace-pre-wrap">
                    {selectedEntry.notes}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
                  size="sm"
                  onClick={() => {
                    setEditingTrade(null);
                    setIsTradeDialogOpen(true);
                  }}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Log Trade
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setIsEntryDialogOpen(true)}
                >
                  <FileText className="mr-1 h-3.5 w-3.5" />
                  {selectedEntry ? "Edit Notes" : "Add Notes"}
                </Button>
                {selectedEntry && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      deleteDailyEntry(selectedEntry.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Daily Entry (Notes/PnL) Dialog */}
      <Dialog open={isEntryDialogOpen} onOpenChange={setIsEntryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedEntry ? "Edit Entry" : "Add Entry"} -{" "}
              {selectedDate && format(selectedDate, "MMM d, yyyy")}
            </DialogTitle>
          </DialogHeader>
          {selectedDate && (
            <EntryForm
              date={format(selectedDate, "yyyy-MM-dd")}
              initialData={selectedEntry}
              onSave={(entry) => {
                upsertDailyEntry(entry);
                setIsEntryDialogOpen(false);
              }}
              onClose={() => setIsEntryDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Trade Logging Dialog */}
      <Dialog
        open={isTradeDialogOpen}
        onOpenChange={(open) => {
          setIsTradeDialogOpen(open);
          if (!open) setEditingTrade(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTrade ? "Edit Trade" : "Log Trade"} -{" "}
              {selectedDate && format(selectedDate, "MMM d, yyyy")}
            </DialogTitle>
          </DialogHeader>
          {selectedDate && (
            <CalendarTradeForm
              date={format(selectedDate, "yyyy-MM-dd")}
              tradingSetups={tradingSetups}
              tradingAccounts={tradingAccounts}
              initialData={editingTrade}
              onSave={(trade) => {
                if (editingTrade) {
                  updateTrade(trade as Trade);
                } else {
                  addTrade(trade);
                }
                setIsTradeDialogOpen(false);
                setEditingTrade(null);
              }}
              onClose={() => {
                setIsTradeDialogOpen(false);
                setEditingTrade(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Daily Snapshot Dialog */}
      <Dialog open={isSnapshotOpen} onOpenChange={setIsSnapshotOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Daily Snapshot</DialogTitle>
          </DialogHeader>
          <DailySnapshot onClose={() => setIsSnapshotOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Daily Entry Form ─────────────────────────────────────────

interface EntryFormProps {
  date: string;
  initialData?: DailyEntry | null;
  onSave: (entry: Omit<DailyEntry, "id">) => void;
  onClose: () => void;
}

function EntryForm({ date, initialData, onSave, onClose }: EntryFormProps) {
  const [pnl, setPnl] = useState<string>(
    initialData?.pnl !== undefined ? String(initialData.pnl) : ""
  );
  const [notes, setNotes] = useState(initialData?.notes ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      date,
      pnl: pnl !== "" ? parseFloat(pnl) : undefined,
      notes: notes || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="pnl">Manual P&L Override ($)</Label>
        <Input
          id="pnl"
          type="number"
          step="0.01"
          placeholder="Leave blank to auto-sum from trades"
          value={pnl}
          onChange={(e) => setPnl(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Only needed if you want to override the auto-calculated P&L from trades.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Journal Notes</Label>
        <Textarea
          id="notes"
          rows={5}
          placeholder="What went well? What could be improved? Key observations..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
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
          {initialData ? "Update" : "Save"} Entry
        </Button>
      </div>
    </form>
  );
}

// ── Trade Form (for calendar) ────────────────────────────────

interface CalendarTradeFormProps {
  date: string;
  tradingSetups: { id: string; name: string }[];
  tradingAccounts: { id: string; propFirm: string; accountSize: number; label: string }[];
  initialData?: Trade | null;
  onSave: (trade: Omit<Trade, "id"> | Trade) => void;
  onClose: () => void;
}

function CalendarTradeForm({
  date,
  tradingSetups,
  tradingAccounts,
  initialData,
  onSave,
  onClose,
}: CalendarTradeFormProps) {
  const [formData, setFormData] = useState<Partial<Trade>>(
    initialData ?? {
      date,
      time: "",
      instrument: "NQ",
      setupId: tradingSetups[0]?.id ?? "",
      accountId: tradingAccounts[0]?.id ?? "",
      direction: "long",
      entry: undefined,
      exit: undefined,
      stopLoss: undefined,
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
      date, // always lock to the selected calendar date
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
          <Label htmlFor="cal-trade-time">Time</Label>
          <Input
            id="cal-trade-time"
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
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="cal-entry">Entry</Label>
          <Input
            id="cal-entry"
            type="number"
            step="any"
            value={formData.entry ?? ""}
            onChange={(e) => set({ entry: e.target.value !== '' ? parseFloat(e.target.value) : undefined })}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cal-exit">Exit</Label>
          <Input
            id="cal-exit"
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
          <Label htmlFor="cal-sl">Stop Loss</Label>
          <Input
            id="cal-sl"
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
          <Label htmlFor="cal-contracts">Contracts</Label>
          <Input
            id="cal-contracts"
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="cal-pnl">P&L ($)</Label>
          <Input
            id="cal-pnl"
            type="number"
            step="0.01"
            value={formData.pnl ?? ""}
            onChange={(e) => set({ pnl: e.target.value !== '' ? parseFloat(e.target.value) : undefined })}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cal-rr">R:R</Label>
          <Input
            id="cal-rr"
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
        <Label htmlFor="cal-notes">Notes</Label>
        <Textarea
          id="cal-notes"
          rows={2}
          placeholder="Quick notes on this trade..."
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

export default Calendar;
