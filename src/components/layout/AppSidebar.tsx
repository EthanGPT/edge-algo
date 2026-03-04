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
  FlaskConical,
  ExternalLink,
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
import { useJournal, SyncStatus } from "@/context/JournalContext";
import { cn } from "@/lib/utils";

// Bot tracking - main navigation
const botNav = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Bots", url: "/bots", icon: Bot },
  { title: "Accounts", url: "/bot-accounts", icon: Wallet },
  { title: "Trades", url: "/bot-trades", icon: ArrowRightLeft },
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

      <SidebarFooter className="px-4 pb-4 space-y-3">
        {/* Sync Status */}
        <button
          onClick={syncStatus !== 'disabled' ? triggerSync : undefined}
          disabled={syncStatus === 'disabled' || syncStatus === 'syncing'}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors",
            syncStatus !== 'disabled'
              ? "hover:bg-sidebar-accent cursor-pointer"
              : "cursor-default opacity-60"
          )}
        >
          <SyncIcon className={cn("h-3.5 w-3.5", sync.color, syncStatus === 'syncing' && "animate-spin")} />
          <span className={sync.color}>{sync.label}</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
