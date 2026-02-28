import {
  LayoutDashboard,
  TrendingUp,
  Cloud,
  CloudOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Globe,
  Lock,
  PenLine,
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
import { useData, SyncStatus } from "@/context/DataContext";
import { useMembership } from "@/context/MembershipContext";
import { cn } from "@/lib/utils";

// Member Hub - always visible
const hubNav = [
  { title: "Results Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Trade Journal", url: "/trade-journal", icon: PenLine, requiresEdge: true },
];

// Tools - requires Edge
const toolsNav = [
  { title: "Econ Calendar", url: "/economic-calendar", icon: Globe, requiresEdge: true },
];

const syncConfig: Record<SyncStatus, { icon: typeof Cloud; label: string; color: string }> = {
  idle: { icon: Cloud, label: 'Cloud connected', color: 'text-sidebar-muted' },
  syncing: { icon: RefreshCw, label: 'Syncing...', color: 'text-sidebar-muted' },
  synced: { icon: CheckCircle2, label: 'Synced', color: 'text-success' },
  error: { icon: AlertCircle, label: 'Sync error', color: 'text-destructive' },
  disabled: { icon: CloudOff, label: 'Local only', color: 'text-sidebar-muted' },
};

interface NavItemType {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresEdge?: boolean;
  requiresMentorship?: boolean;
}

function NavItem({ item, isActive, showLock }: { item: NavItemType; isActive: boolean; showLock?: boolean }) {
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
          {showLock && <Lock className="ml-auto h-3 w-3 text-sidebar-muted" />}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const location = useLocation();
  const { syncStatus, triggerSync } = useData();
  const { tier, toggleMembership } = useMembership();
  const sync = syncConfig[syncStatus];
  const SyncIcon = sync.icon;

  const hasEdgeAccess = tier === 'edge' || tier === 'mentorship';
  const hasMentorshipAccess = tier === 'mentorship';

  const tierLabels = {
    free: 'Free Member',
    edge: 'Edge',
    mentorship: 'Mentorship',
  };

  const tierColors = {
    free: 'text-sidebar-muted',
    edge: 'text-green-400',
    mentorship: 'text-gold',
  };

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="p-5">
        <NavLink to="/" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
            <TrendingUp className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-sidebar-foreground">Edge</h1>
          </div>
        </NavLink>
      </SidebarHeader>

      <SidebarContent className="px-3">
        {/* Main */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {hubNav.map((item) => (
                <NavItem
                  key={item.title}
                  item={item}
                  isActive={location.pathname === item.url || (item.url === '/trade-journal' && location.pathname.startsWith('/trade-journal'))}
                  showLock={item.requiresEdge && !hasEdgeAccess}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Tools section */}
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-xs font-medium uppercase tracking-wider text-sidebar-muted">
            Tools
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {toolsNav.map((item) => (
                <NavItem
                  key={item.title}
                  item={item}
                  isActive={location.pathname === item.url}
                  showLock={item.requiresEdge && !hasEdgeAccess}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 pb-4 space-y-3">
        {/* Membership Status Card */}
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {tier !== 'free' && (
                <span className="flex h-2 w-2 rounded-full bg-green-400" />
              )}
              <span className={cn("text-xs font-medium", tierColors[tier])}>
                {tierLabels[tier]}
              </span>
            </div>
            {tier === 'free' && (
              <NavLink
                to="/purchase"
                className="text-xs font-medium text-accent hover:underline"
              >
                Upgrade →
              </NavLink>
            )}
          </div>
        </div>

        {/* Demo Toggle */}
        <button
          onClick={toggleMembership}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-sidebar-border px-3 py-2 text-[10px] text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          Demo: Toggle Tier [{tier.toUpperCase()}]
        </button>

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
