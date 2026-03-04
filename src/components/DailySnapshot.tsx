import { useRef, useMemo } from "react";
import { format, parseISO, isToday } from "date-fns";
import { Download, Camera, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import html2canvas from "html2canvas";
import { useJournal } from "@/context/JournalContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DailySnapshotProps {
  onClose?: () => void;
}

export function DailySnapshot({ onClose }: DailySnapshotProps) {
  const snapshotRef = useRef<HTMLDivElement>(null);
  const { accounts, trades, propFirms } = useJournal();

  const today = format(new Date(), "yyyy-MM-dd");
  const displayDate = format(new Date(), "EEEE, MMMM d, yyyy");

  // Prop firm name map
  const firmMap = useMemo(() => {
    const m = new Map<string, string>();
    propFirms.forEach((f) => m.set(f.id, f.name));
    return m;
  }, [propFirms]);

  // Active accounts only (funded + active OR evaluation + in_progress)
  const activeAccounts = useMemo(() => {
    return accounts.filter(
      (a) =>
        (a.type === "evaluation" && a.status === "in_progress") ||
        (a.type === "funded" && a.status === "active")
    );
  }, [accounts]);

  // Calculate today's P&L from trades
  const todayStats = useMemo(() => {
    const todayTrades = trades.filter((t) => t.date === today);
    const splitCount = activeAccounts.length || 1;

    // Per-account P&L for today
    const accountPnl = new Map<string, number>();
    activeAccounts.forEach((a) => accountPnl.set(a.id, 0));

    todayTrades.forEach((trade) => {
      if (trade.accountId === "split") {
        // Split equally across active accounts
        const perAccount = trade.pnl / splitCount;
        activeAccounts.forEach((a) => {
          accountPnl.set(a.id, (accountPnl.get(a.id) || 0) + perAccount);
        });
      } else if (trade.accountId && accountPnl.has(trade.accountId)) {
        accountPnl.set(
          trade.accountId,
          (accountPnl.get(trade.accountId) || 0) + trade.pnl
        );
      }
    });

    const totalPnl = todayTrades.reduce((sum, t) => sum + t.pnl, 0);
    const tradeCount = todayTrades.length;
    const wins = todayTrades.filter((t) => t.result === "win").length;
    const losses = todayTrades.filter((t) => t.result === "loss").length;

    return { totalPnl, tradeCount, wins, losses, accountPnl };
  }, [trades, today, activeAccounts]);

  // Account data with today's P&L
  const accountsData = useMemo(() => {
    return activeAccounts.map((a) => {
      const firmName = firmMap.get(a.propFirm) ?? a.propFirm;
      const displayName = `${firmName} $${(a.accountSize / 1000).toFixed(0)}K`;
      const todayPnl = todayStats.accountPnl.get(a.id) || 0;
      const balance = a.accountSize + a.profitLoss;

      return {
        id: a.id,
        displayName,
        type: a.type,
        size: a.accountSize,
        totalPnl: a.profitLoss,
        todayPnl,
        balance,
      };
    });
  }, [activeAccounts, firmMap, todayStats.accountPnl]);

  const totalAccountValue = accountsData.reduce((s, a) => s + a.balance, 0);

  const handleDownload = async () => {
    if (!snapshotRef.current) return;

    try {
      const canvas = await html2canvas(snapshotRef.current, {
        backgroundColor: "#0a0a0a",
        scale: 2,
        useCORS: true,
      });

      const link = document.createElement("a");
      link.download = `trading-snapshot-${today}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("Failed to capture snapshot:", error);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!snapshotRef.current) return;

    try {
      const canvas = await html2canvas(snapshotRef.current, {
        backgroundColor: "#0a0a0a",
        scale: 2,
        useCORS: true,
      });

      canvas.toBlob(async (blob) => {
        if (blob) {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
        }
      });
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  return (
    <div className="space-y-4">
      {/* Snapshot content - this gets captured */}
      <div
        ref={snapshotRef}
        className="rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 space-y-5"
        style={{ minWidth: 360 }}
      >
        {/* Header */}
        <div className="text-center space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            Daily Trading Recap
          </p>
          <p className="text-lg font-semibold text-zinc-100">{displayDate}</p>
        </div>

        {/* Main Stats */}
        <div className="grid grid-cols-2 gap-4">
          {/* Account Value */}
          <div className="rounded-lg bg-zinc-800/50 p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-zinc-400 mb-1">
              <Wallet className="h-3.5 w-3.5" />
              <span className="text-xs font-medium uppercase tracking-wide">
                Account Value
              </span>
            </div>
            <p className="text-2xl font-bold text-zinc-100 tabular-nums">
              ${totalAccountValue.toLocaleString()}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {accountsData.length} active account{accountsData.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Today's P&L */}
          <div className="rounded-lg bg-zinc-800/50 p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-zinc-400 mb-1">
              {todayStats.totalPnl >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              <span className="text-xs font-medium uppercase tracking-wide">
                Today's P&L
              </span>
            </div>
            <p
              className={cn(
                "text-2xl font-bold tabular-nums",
                todayStats.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"
              )}
            >
              {todayStats.totalPnl >= 0 ? "+" : ""}
              ${Math.abs(todayStats.totalPnl).toLocaleString()}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {todayStats.tradeCount} trade{todayStats.tradeCount !== 1 ? "s" : ""} ·{" "}
              {todayStats.wins}W {todayStats.losses}L
            </p>
          </div>
        </div>

        {/* Account Breakdown */}
        {accountsData.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 px-1">
              Account Breakdown
            </p>
            <div className="space-y-2">
              {accountsData.map((acct) => (
                <div
                  key={acct.id}
                  className="flex items-center justify-between rounded-lg bg-zinc-800/30 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-200">
                      {acct.displayName}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {acct.type === "evaluation" ? "Eval" : "Funded"} ·{" "}
                      <span
                        className={cn(
                          "font-medium",
                          acct.totalPnl >= 0 ? "text-emerald-400/80" : "text-red-400/80"
                        )}
                      >
                        {acct.totalPnl >= 0 ? "+" : ""}${acct.totalPnl.toLocaleString()} total
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        acct.todayPnl >= 0 ? "text-emerald-400" : "text-red-400"
                      )}
                    >
                      {acct.todayPnl >= 0 ? "+" : ""}
                      ${Math.abs(acct.todayPnl).toLocaleString()}
                    </p>
                    <p className="text-xs text-zinc-500">today</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer watermark */}
        <div className="pt-2 text-center">
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest">
            Edge
          </p>
        </div>
      </div>

      {/* Action buttons - outside the snapshot */}
      <div className="flex gap-2">
        <Button onClick={handleDownload} className="flex-1 gap-2">
          <Download className="h-4 w-4" />
          Download
        </Button>
        <Button
          onClick={handleCopyToClipboard}
          variant="outline"
          className="flex-1 gap-2"
        >
          <Camera className="h-4 w-4" />
          Copy to Clipboard
        </Button>
      </div>
    </div>
  );
}
