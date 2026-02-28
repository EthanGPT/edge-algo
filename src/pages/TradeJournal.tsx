import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  CrosshairIcon,
  LineChart,
  CalendarDays,
  Wallet,
  DollarSign,
  BarChart3,
} from "lucide-react";

// Import all the tracker components
import Trades from "./Trades";
import Analytics from "./Analytics";
import Calendar from "./Calendar";
import Accounts from "./Accounts";
import Financials from "./Financials";
import Reports from "./Reports";

const tabs = [
  { id: "trades", label: "Trades", icon: CrosshairIcon },
  { id: "analytics", label: "Analytics", icon: LineChart },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "accounts", label: "Accounts", icon: Wallet },
  { id: "financials", label: "Financials", icon: DollarSign },
  { id: "reports", label: "Reports", icon: BarChart3 },
];

export default function TradeJournal() {
  const [activeTab, setActiveTab] = useState("trades");

  const renderContent = () => {
    switch (activeTab) {
      case "trades":
        return <Trades />;
      case "analytics":
        return <Analytics />;
      case "calendar":
        return <Calendar />;
      case "accounts":
        return <Accounts />;
      case "financials":
        return <Financials />;
      case "reports":
        return <Reports />;
      default:
        return <Trades />;
    }
  };

  return (
    <div>
      {/* Tab Navigation */}
      <div className="mb-6 border-b border-border">
        <div className="flex gap-1 overflow-x-auto pb-px">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                  isActive
                    ? "border-accent text-accent"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div>{renderContent()}</div>
    </div>
  );
}
