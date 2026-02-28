import { Link } from "react-router-dom";
import { Plus, TrendingUp, TrendingDown } from "lucide-react";

const mockJournalEntries = [
  {
    id: 1,
    date: "2024-01-15",
    instrument: "MNQ",
    level: "PDH",
    direction: "Long",
    entry: 17245.50,
    sl: 17205.50,
    tp: 17285.50,
    result: "Win",
    pnl: 80,
    notes: "Clean break and retest. Entered at level, TP hit within 20 mins.",
  },
  {
    id: 2,
    date: "2024-01-15",
    instrument: "MNQ",
    level: "PDL",
    direction: "Short",
    entry: 17180.25,
    sl: 17220.25,
    tp: 17140.25,
    result: "Win",
    pnl: 80,
    notes: "Second trade of the day. London level held perfectly.",
  },
  {
    id: 3,
    date: "2024-01-14",
    instrument: "MGC",
    level: "PMH",
    direction: "Long",
    entry: 2045.20,
    sl: 2041.20,
    tp: 2049.20,
    result: "Loss",
    pnl: -80,
    notes: "Pre-market high. Fakeout before reversal. Stopped out.",
  },
  {
    id: 4,
    date: "2024-01-14",
    instrument: "MNQ",
    level: "LPH",
    direction: "Long",
    entry: 17320.00,
    sl: 17280.00,
    tp: 17360.00,
    result: "Win",
    pnl: 80,
    notes: "London pre-market high. Strong momentum continuation.",
  },
  {
    id: 5,
    date: "2024-01-13",
    instrument: "MNQ",
    level: "PDL",
    direction: "Short",
    entry: 17150.75,
    sl: 17190.75,
    tp: 17110.75,
    result: "Win",
    pnl: 80,
    notes: "Perfect setup. Break, retest, continuation to target.",
  },
];

export default function Journal() {
  // Calculate stats
  const totalTrades = mockJournalEntries.length;
  const wins = mockJournalEntries.filter((e) => e.result === "Win").length;
  const winRate = Math.round((wins / totalTrades) * 100);
  const totalPnl = mockJournalEntries.reduce((sum, e) => sum + e.pnl, 0);
  const avgR = (totalPnl / totalTrades / 80).toFixed(2);

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">My Trading Journal</h1>
            <p className="page-subtitle">
              Track your trades and review your progress
            </p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90">
            <Plus className="h-4 w-4" />
            Add Trade
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Total Trades</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{totalTrades}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Win Rate</p>
          <p className="mt-1 text-2xl font-bold text-accent">{winRate}%</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Total P&L</p>
          <p
            className={`mt-1 text-2xl font-bold ${
              totalPnl >= 0 ? "text-accent" : "text-destructive"
            }`}
          >
            {totalPnl >= 0 ? "+" : ""}${totalPnl}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Avg R</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{avgR}R</p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Track your daily trading notes, psychology, and lessons learned. Use this
          alongside your trade log to build your track record.
        </p>
      </div>

      {/* Journal Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Instrument
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Level
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Direction
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Entry
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  SL
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  TP
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Result
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  P&L
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mockJournalEntries.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 text-sm text-foreground">{entry.date}</td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    {entry.instrument}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
                      {entry.level}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 text-sm ${
                        entry.direction === "Long"
                          ? "text-accent"
                          : "text-destructive"
                      }`}
                    >
                      {entry.direction === "Long" ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {entry.direction}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    {entry.entry.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm text-destructive">
                    {entry.sl.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm text-accent">
                    {entry.tp.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        entry.result === "Win"
                          ? "bg-accent/20 text-accent"
                          : "bg-destructive/20 text-destructive"
                      }`}
                    >
                      {entry.result}
                    </span>
                  </td>
                  <td
                    className={`px-4 py-3 text-sm font-medium ${
                      entry.pnl >= 0 ? "text-accent" : "text-destructive"
                    }`}
                  >
                    {entry.pnl >= 0 ? "+" : ""}${entry.pnl}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px] truncate">
                    {entry.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
