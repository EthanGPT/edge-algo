/**
 * TradovateConnect - Connect and sync Tradovate accounts
 */

import { useState, useEffect } from 'react';
import { Loader2, Link2, Unlink, RefreshCw, CheckCircle2, AlertCircle, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useBots } from '@/context/BotContext';
import {
  createTradovateClient,
  testTradovateConnection,
  type TradovateCredentials,
  type TradovateAccount,
} from '@/lib/tradovate';
import type { BotAccount, BrokerEnvironment } from '@/types/bots';

interface TradovateConnectProps {
  onTradesImported?: (count: number) => void;
}

interface ConnectionState {
  isConnecting: boolean;
  isConnected: boolean;
  isSyncing: boolean;
  error: string | null;
  tradovateAccounts: TradovateAccount[];
  lastSync: Date | null;
}

export function TradovateConnect({ onTradesImported }: TradovateConnectProps) {
  const { botAccounts, addBotTrade, bots } = useBots();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [state, setState] = useState<ConnectionState>({
    isConnecting: false,
    isConnected: false,
    isSyncing: false,
    error: null,
    tradovateAccounts: [],
    lastSync: null,
  });

  // Form state
  const [credentials, setCredentials] = useState<TradovateCredentials>({
    name: '',
    username: '',
    password: '',
    environment: 'demo',
  });

  // Mapping state: which Tradovate account maps to which bot account
  const [accountMappings, setAccountMappings] = useState<Record<number, string>>({});

  // Stored credentials (in localStorage for now - in production use Supabase Vault)
  const [storedCredentials, setStoredCredentials] = useState<TradovateCredentials | null>(null);

  // Load stored credentials on mount
  useEffect(() => {
    const stored = localStorage.getItem('tradovate_credentials');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setStoredCredentials(parsed);
        setCredentials(parsed);
      } catch (e) {
        console.error('Failed to parse stored credentials');
      }
    }

    const storedMappings = localStorage.getItem('tradovate_mappings');
    if (storedMappings) {
      try {
        setAccountMappings(JSON.parse(storedMappings));
      } catch (e) {
        console.error('Failed to parse stored mappings');
      }
    }
  }, []);

  // Test connection and get accounts
  const handleConnect = async () => {
    setState(s => ({ ...s, isConnecting: true, error: null }));

    try {
      const result = await testTradovateConnection(credentials);

      if (result.success && result.accounts) {
        setState(s => ({
          ...s,
          isConnecting: false,
          isConnected: true,
          tradovateAccounts: result.accounts || [],
        }));

        // Store credentials (encrypted in production)
        localStorage.setItem('tradovate_credentials', JSON.stringify(credentials));
        setStoredCredentials(credentials);
        setDialogOpen(false);
      } else {
        setState(s => ({
          ...s,
          isConnecting: false,
          error: result.error || 'Connection failed',
        }));
      }
    } catch (e) {
      setState(s => ({
        ...s,
        isConnecting: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      }));
    }
  };

  // Disconnect and clear credentials
  const handleDisconnect = () => {
    localStorage.removeItem('tradovate_credentials');
    localStorage.removeItem('tradovate_mappings');
    setStoredCredentials(null);
    setCredentials({
      name: '',
      username: '',
      password: '',
      environment: 'demo',
    });
    setState({
      isConnecting: false,
      isConnected: false,
      isSyncing: false,
      error: null,
      tradovateAccounts: [],
      lastSync: null,
    });
    setAccountMappings({});
  };

  // Save account mapping
  const handleMappingChange = (tradovateAccountId: number, botAccountId: string) => {
    const newMappings = { ...accountMappings, [tradovateAccountId]: botAccountId };
    setAccountMappings(newMappings);
    localStorage.setItem('tradovate_mappings', JSON.stringify(newMappings));
  };

  // Sync trades from Tradovate
  const handleSync = async () => {
    if (!storedCredentials) return;

    setState(s => ({ ...s, isSyncing: true, error: null }));

    try {
      const client = createTradovateClient(storedCredentials);
      await client.authenticate();

      let totalImported = 0;

      // Sync each mapped account
      for (const [tradovateAccountId, botAccountId] of Object.entries(accountMappings)) {
        if (!botAccountId) continue;

        const botAccount = botAccounts.find(a => a.id === botAccountId);
        if (!botAccount) continue;

        // Find the bot for this account
        const bot = bots.find(b => b.id === botAccount.bot_id);
        if (!bot) continue;

        // Fetch trades since last sync (or last 7 days)
        const sinceDate = state.lastSync || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const trades = await client.fetchTrades(parseInt(tradovateAccountId), sinceDate);

        // Import each trade
        for (const trade of trades) {
          // Check if trade already exists (by Tradovate fill ID)
          // For now, we'll just import all - in production check for duplicates

          await addBotTrade({
            bot_id: bot.id,
            bot_account_id: botAccountId,
            external_id: `tradovate-${trade.tradovate_fill_id}`,
            timestamp: trade.timestamp,
            instrument: trade.instrument,
            direction: trade.direction,
            entry_price: trade.entry_price,
            exit_price: trade.exit_price,
            contracts: trade.contracts,
            pnl: trade.pnl,
            commission: trade.commission,
            status: trade.status,
            source: 'webhook',
            raw_payload: {
              tradovate_fill_id: trade.tradovate_fill_id,
              tradovate_order_id: trade.tradovate_order_id,
              tradovate_account_id: trade.tradovate_account_id,
            },
          });

          totalImported++;
        }
      }

      setState(s => ({
        ...s,
        isSyncing: false,
        lastSync: new Date(),
      }));

      if (onTradesImported) {
        onTradesImported(totalImported);
      }
    } catch (e) {
      setState(s => ({
        ...s,
        isSyncing: false,
        error: e instanceof Error ? e.message : 'Sync failed',
      }));
    }
  };

  // Reconnect on mount if we have stored credentials
  useEffect(() => {
    if (storedCredentials && !state.isConnected && !state.isConnecting) {
      testTradovateConnection(storedCredentials).then(result => {
        if (result.success && result.accounts) {
          setState(s => ({
            ...s,
            isConnected: true,
            tradovateAccounts: result.accounts || [],
          }));
        }
      });
    }
  }, [storedCredentials]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Tradovate Integration
        </CardTitle>
        <CardDescription>
          Connect your Tradovate accounts to auto-import trades
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {state.isConnected ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-sm text-success">Connected</span>
                <span className="text-xs text-muted-foreground">
                  ({storedCredentials?.environment} - {storedCredentials?.username})
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Not connected</span>
              </>
            )}
          </div>

          <div className="flex gap-2">
            {state.isConnected ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={state.isSyncing || Object.keys(accountMappings).length === 0}
                >
                  {state.isSyncing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Sync Trades
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDisconnect}>
                  <Unlink className="h-4 w-4 mr-1" />
                  Disconnect
                </Button>
              </>
            ) : (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Connect
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Connect Tradovate</DialogTitle>
                    <DialogDescription>
                      Enter your Tradovate credentials to sync trades automatically.
                      Credentials are stored locally (encrypted in production).
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Connection Name</Label>
                      <Input
                        placeholder="e.g., Apex Account 1"
                        value={credentials.name}
                        onChange={e => setCredentials(c => ({ ...c, name: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Environment</Label>
                      <Select
                        value={credentials.environment}
                        onValueChange={(v: BrokerEnvironment) =>
                          setCredentials(c => ({ ...c, environment: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="demo">Demo</SelectItem>
                          <SelectItem value="live">Live</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Username</Label>
                      <Input
                        placeholder="Tradovate username"
                        value={credentials.username}
                        onChange={e => setCredentials(c => ({ ...c, username: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Password</Label>
                      <Input
                        type="password"
                        placeholder="Tradovate password"
                        value={credentials.password}
                        onChange={e => setCredentials(c => ({ ...c, password: e.target.value }))}
                      />
                    </div>

                    {state.error && (
                      <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                        {state.error}
                      </div>
                    )}
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleConnect}
                      disabled={state.isConnecting || !credentials.username || !credentials.password}
                    >
                      {state.isConnecting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                      Connect
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Error Display */}
        {state.error && !dialogOpen && (
          <div className="text-sm text-destructive bg-destructive/10 p-2 rounded flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            {state.error}
          </div>
        )}

        {/* Account Mappings */}
        {state.isConnected && state.tradovateAccounts.length > 0 && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Map Tradovate Accounts to Bot Accounts</Label>
            <p className="text-xs text-muted-foreground">
              Link each Tradovate account to a bot account for auto-import
            </p>

            {state.tradovateAccounts.map(account => (
              <div
                key={account.id}
                className="flex items-center gap-3 p-2 rounded bg-muted/30"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium">{account.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {account.accountType} - ID: {account.id}
                  </p>
                </div>
                <Select
                  value={accountMappings[account.id] || ''}
                  onValueChange={v => handleMappingChange(account.id, v)}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select bot account..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Not mapped</SelectItem>
                    {botAccounts.map(ba => (
                      <SelectItem key={ba.id} value={ba.id}>
                        {ba.account_name} ({ba.prop_firm})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}

        {/* Last Sync Info */}
        {state.lastSync && (
          <p className="text-xs text-muted-foreground">
            Last synced: {state.lastSync.toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default TradovateConnect;
