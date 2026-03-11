import React, { useState, useMemo, useEffect } from "react";
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
  FileText,
  Bot,
  Wallet,
  CrosshairIcon,
} from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useBots } from "@/context/BotContext";
import { supabase } from "@/lib/supabase";

interface BotCalendarDay {
  bot_id: string;
  bot_name: string;
  instrument: string;
  bot_account_id: string | null;
  account_name: string | null;
  prop_firm: string | null;
  trade_date: string;
  daily_pnl: number;
  trade_count: number;
  win_count: number;
  loss_count: number;
  be_count: number;
  contracts_traded: number;
  commissions: number;
  best_trade: number;
  worst_trade: number;
  win_rate: number;
  note: string | null;
}

interface CalendarNote {
  id: string;
  bot_id: string | null;
  bot_account_id: string | null;
  note_date: string;
  note: string;
}

const BotCalendar = () => {
  const { bots, botAccounts } = useBots();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [calendarData, setCalendarData] = useState<BotCalendarDay[]>([]);
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

  // Filters
  const [selectedBotId, setSelectedBotId] = useState<string>("all");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");

  // Filter accounts based on selected bot
  const filteredAccounts = useMemo(() => {
    if (selectedBotId === "all") return botAccounts;
    return botAccounts.filter((a) => a.bot_id === selectedBotId);
  }, [botAccounts, selectedBotId]);

  // Fetch calendar data from Supabase view
  useEffect(() => {
    const fetchCalendarData = async () => {
      setIsLoading(true);
      const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");

      let query = supabase
        .from("bot_calendar")
        .select("*")
        .gte("trade_date", monthStart)
        .lte("trade_date", monthEnd);

      if (selectedBotId !== "all") {
        query = query.eq("bot_id", selectedBotId);
      }
      if (selectedAccountId !== "all") {
        query = query.eq("bot_account_id", selectedAccountId);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Error fetching bot calendar:", error);
      } else {
        setCalendarData(data || []);
      }

      // Fetch notes
      let notesQuery = supabase
        .from("bot_calendar_notes")
        .select("*")
        .gte("note_date", monthStart)
        .lte("note_date", monthEnd);

      if (selectedBotId !== "all") {
        notesQuery = notesQuery.or(`bot_id.eq.${selectedBotId},bot_id.is.null`);
      }

      const { data: notesData } = await notesQuery;
      setNotes(notesData || []);

      setIsLoading(false);
    };

    fetchCalendarData();
  }, [currentMonth, selectedBotId, selectedAccountId]);

  // Build lookup map for calendar data by date
  const dataByDate = useMemo(() => {
    const map = new Map<string, BotCalendarDay[]>();
    calendarData.forEach((d) => {
      const existing = map.get(d.trade_date) || [];
      existing.push(d);
      map.set(d.trade_date, existing);
    });
    return map;
  }, [calendarData]);

  // Build lookup map for notes by date
  const notesByDate = useMemo(() => {
    const map = new Map<string, CalendarNote>();
    notes.forEach((n) => map.set(n.note_date, n));
    return map;
  }, [notes]);

  // Monthly stats
  const monthStats = useMemo(() => {
    const totalPnl = calendarData.reduce((sum, d) => sum + d.daily_pnl, 0);
    const totalTrades = calendarData.reduce((sum, d) => sum + d.trade_count, 0);
    const totalWins = calendarData.reduce((sum, d) => sum + d.win_count, 0);
    const totalLosses = calendarData.reduce((sum, d) => sum + d.loss_count, 0);

    // Aggregate by date for win/loss days
    const dayPnl = new Map<string, number>();
    calendarData.forEach((d) => {
      dayPnl.set(d.trade_date, (dayPnl.get(d.trade_date) || 0) + d.daily_pnl);
    });

    let winDays = 0;
    let lossDays = 0;
    dayPnl.forEach((pnl) => {
      if (pnl > 0) winDays++;
      else if (pnl < 0) lossDays++;
    });

    return { totalPnl, totalTrades, totalWins, totalLosses, winDays, lossDays, tradingDays: dayPnl.size };
  }, [calendarData]);

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

  const selectedDateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const selectedDayData = selectedDateStr ? dataByDate.get(selectedDateStr) || [] : [];
  const selectedDayPnl = selectedDayData.reduce((sum, d) => sum + d.daily_pnl, 0);
  const selectedDayTrades = selectedDayData.reduce((sum, d) => sum + d.trade_count, 0);
  const selectedDayNote = selectedDateStr ? notesByDate.get(selectedDateStr) : null;

  const handleSaveNote = async () => {
    if (!selectedDateStr) return;

    const noteData = {
      bot_id: selectedBotId !== "all" ? selectedBotId : null,
      bot_account_id: selectedAccountId !== "all" ? selectedAccountId : null,
      note_date: selectedDateStr,
      note: noteText,
    };

    if (selectedDayNote) {
      await supabase
        .from("bot_calendar_notes")
        .update({ note: noteText, updated_at: new Date().toISOString() })
        .eq("id", selectedDayNote.id);
    } else {
      await supabase.from("bot_calendar_notes").insert(noteData);
    }

    // Refresh notes
    const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");
    const { data: notesData } = await supabase
      .from("bot_calendar_notes")
      .select("*")
      .gte("note_date", monthStart)
      .lte("note_date", monthEnd);
    setNotes(notesData || []);
    setIsNoteDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Bot Calendar</h1>
          <p className="page-subtitle">Daily P&L tracking for your trading bots</p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedBotId} onValueChange={(v) => { setSelectedBotId(v); setSelectedAccountId("all"); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Bots" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Bots</SelectItem>
                {bots.map((bot) => (
                  <SelectItem key={bot.id} value={bot.id}>{bot.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {filteredAccounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.account_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Monthly stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <div className="stat-card p-4">
          <p className="text-xs text-muted-foreground">Monthly P&L</p>
          <p className={cn("text-xl font-bold", monthStats.totalPnl >= 0 ? "text-success" : "text-destructive")}>
            {monthStats.totalPnl >= 0 ? "+" : ""}${Math.abs(monthStats.totalPnl).toLocaleString()}
          </p>
        </div>
        <div className="stat-card p-4">
          <p className="text-xs text-muted-foreground">Trading Days</p>
          <p className="text-xl font-bold">{monthStats.tradingDays}</p>
        </div>
        <div className="stat-card p-4">
          <p className="text-xs text-muted-foreground">Total Trades</p>
          <p className="text-xl font-bold">{monthStats.totalTrades}</p>
        </div>
        <div className="stat-card p-4">
          <p className="text-xs text-muted-foreground">Win Days</p>
          <p className="text-xl font-bold text-success">{monthStats.winDays}</p>
        </div>
        <div className="stat-card p-4">
          <p className="text-xs text-muted-foreground">Loss Days</p>
          <p className="text-xl font-bold text-destructive">{monthStats.lossDays}</p>
        </div>
        <div className="stat-card p-4">
          <p className="text-xs text-muted-foreground">Day Win Rate</p>
          <p className="text-xl font-bold">
            {monthStats.tradingDays > 0 ? Math.round((monthStats.winDays / monthStats.tradingDays) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="stat-card p-4 sm:p-6">
        {/* Month navigation */}
        <div className="mb-4 flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold">{format(currentMonth, "MMMM yyyy")}</h2>
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Day headers */}
        <div className="mb-1 grid grid-cols-7 gap-1.5">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {calendarDays.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const dayData = dataByDate.get(dateStr) || [];
              const dayNote = notesByDate.get(dateStr);
              const inMonth = isSameMonth(day, currentMonth);
              const selected = selectedDate && isSameDay(day, selectedDate);
              const today = isToday(day);

              const pnl = dayData.reduce((sum, d) => sum + d.daily_pnl, 0);
              const tradeCount = dayData.reduce((sum, d) => sum + d.trade_count, 0);
              const hasTrades = tradeCount > 0;
              const isGreen = hasTrades && pnl > 0;
              const isRed = hasTrades && pnl < 0;

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(day)}
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
                >
                  <span
                    className={cn(
                      "mb-1 text-xs font-medium sm:text-sm",
                      today && "rounded-full bg-accent px-1.5 py-0.5 text-accent-foreground",
                      !inMonth && "text-muted-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </span>

                  {hasTrades && (
                    <span
                      className={cn(
                        "text-lg font-bold sm:text-xl",
                        isGreen ? "text-success" : isRed ? "text-destructive" : "text-muted-foreground"
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
                    {dayNote?.note && (
                      <FileText className="ml-auto h-3 w-3 text-muted-foreground/60" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Day Details Dialog */}
      <Dialog open={!!selectedDate} onOpenChange={(open) => { if (!open) setSelectedDate(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedDate && format(selectedDate, "EEEE, MMM d yyyy")}</DialogTitle>
          </DialogHeader>

          {selectedDate && (
            <div className="space-y-4">
              {/* Day P&L Summary */}
              {selectedDayData.length > 0 && (
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Day P&L</p>
                    <p className={cn("text-2xl font-bold", selectedDayPnl >= 0 ? "text-success" : "text-destructive")}>
                      {selectedDayPnl >= 0 ? "+" : ""}${Math.abs(selectedDayPnl).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Trades</p>
                    <p className="text-lg font-bold">{selectedDayTrades}</p>
                  </div>
                </div>
              )}

              {/* Bot breakdown */}
              {selectedDayData.length > 0 && (
                <div>
                  <p className="mb-2 section-label">By Bot/Account</p>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {selectedDayData.map((d, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-card p-2.5">
                        <div>
                          <p className="text-sm font-medium">{d.bot_name}</p>
                          {d.account_name && (
                            <p className="text-xs text-muted-foreground">{d.account_name} ({d.prop_firm})</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {d.trade_count} trades &bull; {d.win_count}W / {d.loss_count}L
                          </p>
                        </div>
                        <p className={cn("text-sm font-bold", d.daily_pnl >= 0 ? "text-success" : "text-destructive")}>
                          {d.daily_pnl >= 0 ? "+" : ""}${Math.abs(d.daily_pnl).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedDayNote?.note && (
                <div>
                  <p className="mb-1 section-label">Notes</p>
                  <div className="rounded-lg border border-border bg-card p-3 text-sm leading-relaxed whitespace-pre-wrap">
                    {selectedDayNote.note}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setNoteText(selectedDayNote?.note || "");
                    setIsNoteDialogOpen(true);
                  }}
                >
                  <FileText className="mr-1 h-3.5 w-3.5" />
                  {selectedDayNote ? "Edit Note" : "Add Note"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Note Dialog */}
      <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedDayNote ? "Edit Note" : "Add Note"} - {selectedDate && format(selectedDate, "MMM d, yyyy")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <Textarea
                id="note"
                rows={5}
                placeholder="Add notes about this trading day..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsNoteDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveNote} className="bg-accent text-accent-foreground hover:bg-accent/90">
                Save Note
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BotCalendar;
