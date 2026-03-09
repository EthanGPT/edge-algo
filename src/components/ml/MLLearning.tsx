import { useState, useEffect, useCallback } from "react";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Lightbulb,
  Target,
  BarChart3,
  Clock,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MLInsights {
  total_signals_with_outcomes: number;
  approved: {
    count: number;
    win_rate: string;
    wins: number;
    losses: number;
  };
  rejected: {
    count: number;
    win_rate: string;
    note: string;
  };
  filter_edge: string;
  by_level: Record<string, { count: number; win_rate: string }>;
  by_session: Record<string, { count: number; win_rate: string }>;
  by_instrument: Record<string, { count: number; win_rate: string }>;
  recent_mistakes: {
    missed_wins: Array<{
      ticker: string;
      level: string;
      session: string;
      confidence: string;
      rsi: number;
    }>;
    bad_approvals: Array<{
      ticker: string;
      level: string;
      session: string;
      confidence: string;
      rsi: number;
    }>;
  };
  recommendations: string[];
}

const ML_API_URL = import.meta.env.VITE_ML_API_URL || "";

export function MLLearning() {
  const [insights, setInsights] = useState<MLInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [retrainStatus, setRetrainStatus] = useState<{
    running: boolean;
    last_run: string | null;
    last_result: string | null;
  } | null>(null);
  const [retraining, setRetraining] = useState(false);

  const fetchInsights = useCallback(async () => {
    if (!ML_API_URL) {
      setError("ML API URL not configured. Add VITE_ML_API_URL to your .env file.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${ML_API_URL}/learning-insights`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setInsights(data);
        setLastUpdated(new Date());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch insights");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRetrainStatus = useCallback(async () => {
    if (!ML_API_URL) return;
    try {
      const response = await fetch(`${ML_API_URL}/retrain-status`);
      if (response.ok) {
        const data = await response.json();
        setRetrainStatus(data);
      }
    } catch {
      // Silently fail - not critical
    }
  }, []);

  const triggerRetrain = useCallback(async () => {
    if (!ML_API_URL) return;
    setRetraining(true);
    try {
      const response = await fetch(`${ML_API_URL}/retrain`, { method: "POST" });
      const data = await response.json();
      if (data.status === "started") {
        // Poll for status
        const pollInterval = setInterval(async () => {
          const statusRes = await fetch(`${ML_API_URL}/retrain-status`);
          const status = await statusRes.json();
          setRetrainStatus(status);
          if (!status.running) {
            clearInterval(pollInterval);
            setRetraining(false);
            // Refresh insights after retrain
            fetchInsights();
          }
        }, 3000);
      } else {
        setRetraining(false);
      }
    } catch (err) {
      setRetraining(false);
      setError(err instanceof Error ? err.message : "Failed to trigger retrain");
    }
  }, [fetchInsights]);

  useEffect(() => {
    fetchInsights();
    fetchRetrainStatus();
  }, [fetchInsights, fetchRetrainStatus]);

  // Parse edge value for coloring
  const parseEdge = (edge: string): number => {
    const num = parseFloat(edge.replace("%", ""));
    return isNaN(num) ? 0 : num;
  };

  const parseWinRate = (wr: string): number => {
    const num = parseFloat(wr.replace("%", ""));
    return isNaN(num) ? 0 : num;
  };

  if (!ML_API_URL) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Brain className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-semibold mb-2">ML API Not Configured</h3>
        <p className="text-muted-foreground text-sm max-w-md mb-4">
          Add <code className="bg-muted px-1 rounded">VITE_ML_API_URL</code> to your .env file
          pointing to your ML Signal Filter API.
        </p>
        <code className="text-xs bg-muted p-2 rounded">
          VITE_ML_API_URL=https://your-ml-api.railway.app
        </code>
      </div>
    );
  }

  if (loading && !insights) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (error && !insights) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive/50 mb-4" />
        <h3 className="text-lg font-semibold mb-2">Error Loading Insights</h3>
        <p className="text-muted-foreground text-sm mb-4">{error}</p>
        <Button variant="outline" onClick={fetchInsights}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (!insights) {
    return null;
  }

  const edge = parseEdge(insights.filter_edge);
  const approvedWR = parseWinRate(insights.approved.win_rate);
  const rejectedWR = parseWinRate(insights.rejected.win_rate);

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="h-6 w-6 text-accent" />
          <div>
            <h2 className="text-lg font-semibold">ML Learning Insights</h2>
            <p className="text-sm text-muted-foreground">
              {insights.total_signals_with_outcomes} signals with outcomes
              {lastUpdated && (
                <span className="ml-2 text-xs">
                  Updated {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchInsights} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Main Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Approved Signals */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="h-5 w-5 text-success" />
            <h3 className="font-medium">Approved Signals</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Total</span>
              <span className="font-bold text-lg">{insights.approved.count}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Win Rate</span>
              <span className={cn(
                "font-bold text-lg",
                approvedWR >= 55 ? "text-success" : approvedWR >= 50 ? "text-warning" : "text-destructive"
              )}>
                {insights.approved.win_rate}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-success">{insights.approved.wins}W</span>
              <span className="text-destructive">{insights.approved.losses}L</span>
            </div>
          </div>
        </Card>

        {/* Rejected Signals */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="h-5 w-5 text-destructive" />
            <h3 className="font-medium">Rejected Signals</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Total</span>
              <span className="font-bold text-lg">{insights.rejected.count}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Win Rate</span>
              <span className={cn(
                "font-bold text-lg",
                rejectedWR <= 45 ? "text-success" : rejectedWR <= 50 ? "text-warning" : "text-destructive"
              )}>
                {insights.rejected.win_rate}
              </span>
            </div>
            <p className="text-xs text-muted-foreground italic">
              {insights.rejected.note}
            </p>
          </div>
        </Card>

        {/* Filter Edge */}
        <Card className={cn(
          "p-4 border-2",
          edge > 10 ? "border-success/50 bg-success/5" :
          edge > 0 ? "border-warning/50 bg-warning/5" :
          "border-destructive/50 bg-destructive/5"
        )}>
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-5 w-5" />
            <h3 className="font-medium">Filter Edge</h3>
          </div>
          <div className="text-center py-2">
            <span className={cn(
              "font-bold text-3xl",
              edge > 10 ? "text-success" :
              edge > 0 ? "text-warning" :
              "text-destructive"
            )}>
              {insights.filter_edge}
            </span>
            <p className="text-xs text-muted-foreground mt-2">
              {edge > 10 ? "Filter is working great!" :
               edge > 0 ? "Filter has some edge" :
               "Filter may be rejecting winners"}
            </p>
          </div>
        </Card>
      </div>

      {/* Breakdowns */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* By Level */}
        <Card className="p-4">
          <h3 className="font-medium mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            By Level
          </h3>
          <div className="space-y-2">
            {Object.entries(insights.by_level).map(([level, data]) => (
              <div key={level} className="flex justify-between items-center text-sm">
                <span className="font-medium">{level}</span>
                <div className="flex gap-3">
                  <span className="text-muted-foreground">{data.count}</span>
                  <span className={cn(
                    "font-medium w-14 text-right",
                    parseWinRate(data.win_rate) >= 55 ? "text-success" :
                    parseWinRate(data.win_rate) >= 50 ? "text-foreground" :
                    "text-destructive"
                  )}>
                    {data.win_rate}
                  </span>
                </div>
              </div>
            ))}
            {Object.keys(insights.by_level).length === 0 && (
              <p className="text-sm text-muted-foreground">Not enough data</p>
            )}
          </div>
        </Card>

        {/* By Session */}
        <Card className="p-4">
          <h3 className="font-medium mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            By Session
          </h3>
          <div className="space-y-2">
            {Object.entries(insights.by_session).map(([session, data]) => (
              <div key={session} className="flex justify-between items-center text-sm">
                <span className="font-medium">{session}</span>
                <div className="flex gap-3">
                  <span className="text-muted-foreground">{data.count}</span>
                  <span className={cn(
                    "font-medium w-14 text-right",
                    parseWinRate(data.win_rate) >= 55 ? "text-success" :
                    parseWinRate(data.win_rate) >= 50 ? "text-foreground" :
                    "text-destructive"
                  )}>
                    {data.win_rate}
                  </span>
                </div>
              </div>
            ))}
            {Object.keys(insights.by_session).length === 0 && (
              <p className="text-sm text-muted-foreground">Not enough data</p>
            )}
          </div>
        </Card>

        {/* By Instrument */}
        <Card className="p-4">
          <h3 className="font-medium mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4" />
            By Instrument
          </h3>
          <div className="space-y-2">
            {Object.entries(insights.by_instrument).map(([inst, data]) => (
              <div key={inst} className="flex justify-between items-center text-sm">
                <span className="font-medium">{inst}</span>
                <div className="flex gap-3">
                  <span className="text-muted-foreground">{data.count}</span>
                  <span className={cn(
                    "font-medium w-14 text-right",
                    parseWinRate(data.win_rate) >= 55 ? "text-success" :
                    parseWinRate(data.win_rate) >= 50 ? "text-foreground" :
                    "text-destructive"
                  )}>
                    {data.win_rate}
                  </span>
                </div>
              </div>
            ))}
            {Object.keys(insights.by_instrument).length === 0 && (
              <p className="text-sm text-muted-foreground">Not enough data</p>
            )}
          </div>
        </Card>
      </div>

      {/* Mistakes Analysis */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Missed Wins */}
        <Card className="p-4">
          <h3 className="font-medium mb-3 flex items-center gap-2 text-warning">
            <TrendingUp className="h-4 w-4" />
            Missed Wins (Rejected but Won)
          </h3>
          {insights.recent_mistakes.missed_wins.length > 0 ? (
            <div className="space-y-2">
              {insights.recent_mistakes.missed_wins.map((m, i) => (
                <div key={i} className="flex justify-between items-center text-sm p-2 rounded bg-warning/10">
                  <div>
                    <span className="font-medium">{m.ticker}</span>
                    <span className="text-muted-foreground ml-2">{m.level}</span>
                    <span className="text-muted-foreground ml-2">{m.session}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-warning">{m.confidence}</span>
                    {m.rsi && <span className="text-muted-foreground ml-2">RSI: {m.rsi.toFixed(0)}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No missed wins - great filtering!</p>
          )}
        </Card>

        {/* Bad Approvals */}
        <Card className="p-4">
          <h3 className="font-medium mb-3 flex items-center gap-2 text-destructive">
            <TrendingDown className="h-4 w-4" />
            Bad Approvals (Approved but Lost)
          </h3>
          {insights.recent_mistakes.bad_approvals.length > 0 ? (
            <div className="space-y-2">
              {insights.recent_mistakes.bad_approvals.map((m, i) => (
                <div key={i} className="flex justify-between items-center text-sm p-2 rounded bg-destructive/10">
                  <div>
                    <span className="font-medium">{m.ticker}</span>
                    <span className="text-muted-foreground ml-2">{m.level}</span>
                    <span className="text-muted-foreground ml-2">{m.session}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-destructive">{m.confidence}</span>
                    {m.rsi && <span className="text-muted-foreground ml-2">RSI: {m.rsi.toFixed(0)}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No bad approvals - great filtering!</p>
          )}
        </Card>
      </div>

      {/* Recommendations */}
      {insights.recommendations.length > 0 && (
        <Card className="p-4 border-accent/50 bg-accent/5">
          <h3 className="font-medium mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-accent" />
            Recommendations
          </h3>
          <ul className="space-y-2">
            {insights.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-accent mt-1">•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Actions */}
      <Card className="p-4">
        <h3 className="font-medium mb-3">Actions</h3>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={triggerRetrain}
            disabled={retraining || retrainStatus?.running}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", (retraining || retrainStatus?.running) && "animate-spin")} />
            {retraining || retrainStatus?.running ? "Retraining..." : "Retrain Model"}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`${ML_API_URL}/status`} target="_blank" rel="noopener noreferrer">
              View API Status
            </a>
          </Button>
        </div>

        {/* Retrain Status */}
        {retrainStatus && (
          <div className="mt-3 p-3 rounded bg-muted/30 text-sm">
            <div className="flex items-center gap-2">
              {retrainStatus.running ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-accent" />
                  <span>Retraining in progress...</span>
                </>
              ) : retrainStatus.last_result === "success" ? (
                <>
                  <CheckCircle className="h-4 w-4 text-success" />
                  <span>Last retrain successful</span>
                </>
              ) : retrainStatus.last_result === "failed" ? (
                <>
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span>Last retrain failed</span>
                </>
              ) : null}
              {retrainStatus.last_run && (
                <span className="text-muted-foreground text-xs ml-auto">
                  {new Date(retrainStatus.last_run).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-3">
          Retraining pulls live outcomes from Supabase and updates the model weights.
          Run weekly or after 50+ new outcomes for best results.
        </p>
      </Card>
    </div>
  );
}
