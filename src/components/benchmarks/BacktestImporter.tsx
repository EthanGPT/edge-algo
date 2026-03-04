/**
 * BacktestImporter
 *
 * File upload component for importing backtest trade CSV files.
 * Provides preview, validation, and batch import to Supabase.
 */

import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useBots } from '@/context/BotContext';
import {
  parseBacktestCSV,
  readFileAsText,
  extractInstrumentFromFilename,
} from '@/lib/backtestImport';
import type { BotBacktestTradeFormData, Bot } from '@/types/bots';

interface BacktestImporterProps {
  onImportComplete?: () => void;
}

type ImportState = 'idle' | 'parsing' | 'preview' | 'importing' | 'success' | 'error';

export function BacktestImporter({ onImportComplete }: BacktestImporterProps) {
  const { bots, importBacktestTrades, deleteBacktestTradesForBot, getBacktestTradesForBot } = useBots();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<ImportState>('idle');
  const [selectedBotId, setSelectedBotId] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedTrades, setParsedTrades] = useState<BotBacktestTradeFormData[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ inserted: number; errors: string[] } | null>(null);

  // Get selected bot
  const selectedBot = bots.find(b => b.id === selectedBotId);

  // Get existing backtest count for selected bot
  const existingTradeCount = selectedBotId ? getBacktestTradesForBot(selectedBotId).length : 0;

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file);
    setError(null);
    setState('parsing');

    try {
      const content = await readFileAsText(file);

      // Auto-detect instrument from filename if bot not selected
      const detectedInstrument = extractInstrumentFromFilename(file.name);

      // If no bot selected but we detected instrument, try to find matching bot
      if (!selectedBotId && detectedInstrument) {
        const matchingBot = bots.find(b => b.instrument === detectedInstrument);
        if (matchingBot) {
          setSelectedBotId(matchingBot.id);
        }
      }

      // Use selected bot's instrument or detected instrument
      const instrument = selectedBot?.instrument || detectedInstrument || 'UNKNOWN';
      const botId = selectedBotId || 'pending';

      const trades = parseBacktestCSV(content, botId, instrument, file.name);

      if (trades.length === 0) {
        throw new Error('No valid trades found in CSV file');
      }

      setParsedTrades(trades);
      setState('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse CSV file');
      setState('error');
    }
  }, [selectedBotId, selectedBot, bots]);

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // Handle import
  const handleImport = useCallback(async () => {
    if (!selectedBotId || parsedTrades.length === 0) return;

    setState('importing');
    setImportProgress(0);
    setError(null);

    try {
      // Update trades with correct bot_id (in case it was set to 'pending')
      const tradesToImport = parsedTrades.map(t => ({
        ...t,
        bot_id: selectedBotId,
        instrument: selectedBot?.instrument || t.instrument,
      }));

      const result = await importBacktestTrades(
        tradesToImport,
        (current, total) => {
          setImportProgress(Math.round((current / total) * 100));
        }
      );

      setImportResult(result);
      setState(result.errors.length > 0 ? 'error' : 'success');

      if (result.errors.length === 0 && onImportComplete) {
        onImportComplete();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
      setState('error');
    }
  }, [selectedBotId, selectedBot, parsedTrades, importBacktestTrades, onImportComplete]);

  // Handle delete existing trades
  const handleDeleteExisting = useCallback(async () => {
    if (!selectedBotId) return;

    try {
      await deleteBacktestTradesForBot(selectedBotId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete existing trades');
    }
  }, [selectedBotId, deleteBacktestTradesForBot]);

  // Reset to initial state
  const handleReset = useCallback(() => {
    setState('idle');
    setSelectedFile(null);
    setParsedTrades([]);
    setImportProgress(0);
    setError(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Preview stats
  const previewStats = parsedTrades.length > 0 ? {
    total: parsedTrades.length,
    wins: parsedTrades.filter(t => t.outcome === 'WIN').length,
    losses: parsedTrades.filter(t => t.outcome === 'LOSS').length,
    netPnl: parsedTrades.reduce((s, t) => s + (t.pnl_usd || 0), 0),
    years: [...new Set(parsedTrades.map(t => t.year))].sort(),
  } : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Import Backtest Trades
        </CardTitle>
        <CardDescription>
          Upload CSV files from your backtest system to enable monthly benchmarks
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Bot Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Target Bot</label>
          <Select value={selectedBotId} onValueChange={setSelectedBotId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a bot..." />
            </SelectTrigger>
            <SelectContent>
              {bots.map(bot => (
                <SelectItem key={bot.id} value={bot.id}>
                  {bot.name} {bot.version} ({bot.instrument})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {existingTradeCount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {existingTradeCount.toLocaleString()} existing backtest trades
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive h-7">
                    <Trash2 className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Backtest Trades?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {existingTradeCount.toLocaleString()} backtest trades
                      for {selectedBot?.name}. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground"
                      onClick={handleDeleteExisting}
                    >
                      Delete All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        {/* File Upload Area */}
        {state === 'idle' || state === 'error' ? (
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
              'hover:border-accent hover:bg-accent/5',
              error && 'border-destructive'
            )}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
            <FileText className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm font-medium mb-1">
              Drop your backtest CSV here or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              Expected columns: date, outcome, pnl_usd, direction, level, etc.
            </p>
          </div>
        ) : null}

        {/* Parsing State */}
        {state === 'parsing' && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-accent mr-2" />
            <span>Parsing CSV...</span>
          </div>
        )}

        {/* Preview State */}
        {state === 'preview' && previewStats && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{selectedFile?.name}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-bold">{previewStats.total.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Trades</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-bold text-success">{previewStats.wins.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Wins</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-bold text-destructive">{previewStats.losses.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Losses</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className={cn('text-2xl font-bold', previewStats.netPnl >= 0 ? 'text-success' : 'text-destructive')}>
                  ${Math.abs(previewStats.netPnl).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Net P&L</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Years: {previewStats.years.join(', ')}
            </p>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleReset}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-accent text-accent-foreground"
                onClick={handleImport}
                disabled={!selectedBotId}
              >
                Import {previewStats.total.toLocaleString()} Trades
              </Button>
            </div>
          </div>
        )}

        {/* Importing State */}
        {state === 'importing' && (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
              <span>Importing trades...</span>
            </div>
            <Progress value={importProgress} className="h-2" />
            <p className="text-xs text-center text-muted-foreground">
              {importProgress}% complete
            </p>
          </div>
        )}

        {/* Success State */}
        {state === 'success' && importResult && (
          <div className="text-center py-4 space-y-4">
            <CheckCircle2 className="h-12 w-12 mx-auto text-success" />
            <div>
              <p className="font-medium">Import Complete!</p>
              <p className="text-sm text-muted-foreground">
                Successfully imported {importResult.inserted.toLocaleString()} trades
              </p>
            </div>
            <Button onClick={handleReset}>Import Another File</Button>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Import Error</p>
              <p>{error}</p>
              {importResult?.errors && importResult.errors.length > 0 && (
                <ul className="mt-2 list-disc list-inside text-xs">
                  {importResult.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {importResult.errors.length > 5 && (
                    <li>...and {importResult.errors.length - 5} more errors</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default BacktestImporter;
