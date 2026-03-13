import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  TrendingUp,
  Cloud,
  CloudOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  PenLine,
  Bot,
  Wallet,
  BarChart3,
  ArrowRightLeft,
  FileText,
  ExternalLink,
  CalendarDays,
  Settings2,
  Loader2,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useJournal, SyncStatus } from "@/context/JournalContext";
import { cn } from "@/lib/utils";

const API_URL = "https://ml-api-phantom-production.up.railway.app";

// Bot tracking - main navigation
const botNav = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Bots", url: "/bots", icon: Bot },
  { title: "Accounts", url: "/bot-accounts", icon: Wallet },
  { title: "Trades", url: "/bot-trades", icon: ArrowRightLeft },
  { title: "Calendar", url: "/bot-calendar", icon: CalendarDays },
  { title: "Analytics", url: "/bot-analytics", icon: BarChart3 },
];

// Research links - external HTML reports
const researchLinks = [
  { title: "Backtest Report", url: "/klbs_backtest_report.html" },
  { title: "OOS Validation", url: "/klbs_oos_report.html" },
];

const syncConfig: Record<SyncStatus, { icon: typeof Cloud; label: string; color: string }> = {
  idle: { icon: Cloud, label: 'Cloud connected', color: 'text-sidebar-muted' },
  syncing: { icon: RefreshCw, label: 'Syncing...', color: 'text-sidebar-muted' },
  synced: { icon: CheckCircle2, label: 'Synced', color: 'text-success' },
  error: { icon: AlertCircle, label: 'Sync error', color: 'text-destructive' },
  not_configured: { icon: CloudOff, label: 'Not configured', color: 'text-sidebar-muted' },
  not_authenticated: { icon: CloudOff, label: 'Sign in to sync', color: 'text-sidebar-muted' },
};

interface NavItemType {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface Account {
  name: string;
  enabled: boolean;
}

function NavItem({ item, isActive }: { item: NavItemType; isActive: boolean }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className={cn(
          "h-10 rounded-lg transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-foreground font-medium"
            : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}
      >
        <NavLink to={item.url} className="flex items-center gap-3 px-3">
          <item.icon className="h-4 w-4" />
          <span className="text-sm font-medium">{item.title}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function ExternalLinkItem({ title, url }: { title: string; url: string }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className="h-10 rounded-lg transition-colors text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
      >
        <a
          href={`${import.meta.env.BASE_URL}${url.replace(/^\//, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3"
        >
          <FileText className="h-4 w-4" />
          <span className="text-sm font-medium">{title}</span>
          <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const location = useLocation();
  const { syncStatus, refreshData: triggerSync } = useJournal();
  const sync = syncConfig[syncStatus];
  const SyncIcon = sync.icon;

  // ML Settings modal state
  const [showSettings, setShowSettings] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState(false);

  const ML_PASSWORD = "klbs2024"; // Simple password

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/status`);
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.config?.accounts || []);
      }
    } catch (e) {
      console.error("Failed to fetch ML status");
    } finally {
      setLoading(false);
    }
  };

  const toggleAccount = async (name: string, enabled: boolean) => {
    try {
      setToggling(name);
      await fetch(`${API_URL}/toggle-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: name, enabled }),
      });
      setAccounts(prev => prev.map(a => a.name === name ? { ...a, enabled } : a));
    } catch (e) {
      console.error("Failed to toggle account");
    } finally {
      setToggling(null);
    }
  };

  useEffect(() => {
    if (showSettings && authenticated) fetchAccounts();
  }, [showSettings, authenticated]);

  const handleAuth = () => {
    if (password === ML_PASSWORD) {
      setAuthenticated(true);
      setAuthError(false);
      fetchAccounts();
    } else {
      setAuthError(true);
    }
  };

  const closeSettings = () => {
    setShowSettings(false);
    setAuthenticated(false);
    setPassword("");
    setAuthError(false);
  };

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="p-5">
        <NavLink to="/" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
            <TrendingUp className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-sidebar-foreground">Bot Tracker</h1>
          </div>
        </NavLink>
      </SidebarHeader>

      <SidebarContent className="px-3">
        {/* Bot Tracking - Main */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {botNav.map((item) => (
                <NavItem
                  key={item.title}
                  item={item}
                  isActive={location.pathname === item.url || location.pathname.startsWith(item.url + '/')}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Research Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-xs font-medium uppercase tracking-wider text-sidebar-muted">
            Research
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {researchLinks.map((link) => (
                <ExternalLinkItem key={link.title} title={link.title} url={link.url} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Personal Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-xs font-medium uppercase tracking-wider text-sidebar-muted">
            Personal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              <NavItem
                item={{ title: "My Trade Journal", url: "/trade-journal", icon: PenLine }}
                isActive={location.pathname === '/trade-journal' || location.pathname.startsWith('/trade-journal/')}
              />
              <NavItem
                item={{ title: "Reports", url: "/reports", icon: BarChart3 }}
                isActive={location.pathname === '/reports'}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 pb-4 space-y-2">
        {/* Settings gear icon */}
        <div className="flex items-center justify-between">
          <button
            onClick={syncStatus !== 'disabled' ? triggerSync : undefined}
            disabled={syncStatus === 'disabled' || syncStatus === 'syncing'}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors",
              syncStatus !== 'disabled'
                ? "hover:bg-sidebar-accent cursor-pointer"
                : "cursor-default opacity-60"
            )}
          >
            <SyncIcon className={cn("h-3.5 w-3.5", sync.color, syncStatus === 'syncing' && "animate-spin")} />
            <span className={sync.color}>{sync.label}</span>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors text-sidebar-muted"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>

      </SidebarFooter>

      {/* ML Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={closeSettings}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              {authenticated ? "Account Controls" : "Enter Password"}
            </DialogTitle>
          </DialogHeader>

          {!authenticated ? (
            <div className="space-y-3">
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                className={authError ? "border-destructive" : ""}
              />
              {authError && (
                <p className="text-xs text-destructive">Incorrect password</p>
              )}
              <Button onClick={handleAuth} className="w-full">
                Unlock
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {loading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                accounts.map((account) => (
                  <div
                    key={account.name}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border",
                      account.enabled ? "bg-card" : "bg-destructive/5 border-destructive/20 opacity-60"
                    )}
                  >
                    <span className="text-sm font-medium">{account.name}</span>
                    <Switch
                      checked={account.enabled}
                      disabled={toggling === account.name}
                      onCheckedChange={(checked) => toggleAccount(account.name, checked)}
                    />
                  </div>
                ))
              )}
              <p className="text-xs text-muted-foreground text-center pt-2">
                Changes apply immediately.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
