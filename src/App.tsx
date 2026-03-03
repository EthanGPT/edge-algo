import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataProvider } from "@/context/DataContext";
import { MembershipProvider } from "@/context/MembershipContext";
import { AuthProvider } from "@/context/AuthContext";
import { BotProvider } from "@/context/BotContext";
import { Paywall } from "@/components/Paywall";

// Public pages
import Landing from "./pages/Landing";
import Backtest from "./pages/Backtest";
import EdgeCourse from "./pages/EdgeCourse";

// Member pages
import MemberHub from "./pages/MemberHub";
import TradeJournal from "./pages/TradeJournal";
import Financials from "./pages/Financials";
import Accounts from "./pages/Accounts";
import PropFirms from "./pages/PropFirms";
import Reports from "./pages/Reports";
import Calendar from "./pages/Calendar";
import EconomicCalendar from "./pages/EconomicCalendar";
import Trades from "./pages/Trades";
import Analytics from "./pages/Analytics";
import Journal from "./pages/Journal";
import NotFound from "./pages/NotFound";

// Bot pages
import Bots from "./pages/Bots";
import BotDetail from "./pages/BotDetail";
import BotAccounts from "./pages/BotAccounts";
import BotTrades from "./pages/BotTrades";
import BotAnalytics from "./pages/BotAnalytics";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <BotProvider>
        <DataProvider>
          <MembershipProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <HashRouter>
                <Routes>
              {/* Public routes - no sidebar */}
              <Route path="/" element={<Landing />} />
              <Route path="/backtest" element={<Backtest />} />

              {/* Member routes - with sidebar */}
              <Route
                path="/dashboard"
                element={
                  <AppLayout>
                    <MemberHub />
                  </AppLayout>
                }
              />
              <Route
                path="/trade-journal"
                element={
                  <AppLayout>
                    <Paywall title="Trade Journal is a Member Benefit" description="Track your trades, analyze performance, and manage your prop firm accounts.">
                      <TradeJournal />
                    </Paywall>
                  </AppLayout>
                }
              />
              <Route
                path="/trades"
                element={
                  <AppLayout>
                    <Paywall title="Trade Journal is a Member Benefit" description="Log trades, track your P&L, and analyze your performance with the full Trade Journal.">
                      <Trades />
                    </Paywall>
                  </AppLayout>
                }
              />
              <Route
                path="/analytics"
                element={
                  <AppLayout>
                    <Paywall title="Analytics is a Member Benefit" description="Deep dive into your trading performance with charts, metrics, and insights.">
                      <Analytics />
                    </Paywall>
                  </AppLayout>
                }
              />
              <Route
                path="/journal"
                element={
                  <AppLayout>
                    <Paywall title="Trade Journal is a Member Benefit" description="Track your trades, review your progress, and share with your mentor.">
                      <Journal />
                    </Paywall>
                  </AppLayout>
                }
              />
              <Route
                path="/calendar"
                element={
                  <AppLayout>
                    <Paywall title="P&L Calendar is a Member Benefit" description="Visualize your daily and weekly trading performance at a glance.">
                      <Calendar />
                    </Paywall>
                  </AppLayout>
                }
              />
              <Route
                path="/course"
                element={
                  <AppLayout>
                    <Paywall title="Strategy Guide is a Member Benefit" description="Get the complete KLBS strategy with optimized parameters and verified backtest results.">
                      <EdgeCourse />
                    </Paywall>
                  </AppLayout>
                }
              />
              <Route
                path="/economic-calendar"
                element={
                  <AppLayout>
                    <Paywall title="Economic Calendar is a Member Benefit" description="Stay ahead of market-moving events with our curated economic calendar.">
                      <EconomicCalendar />
                    </Paywall>
                  </AppLayout>
                }
              />
              <Route
                path="/prop-firms"
                element={
                  <AppLayout>
                    <PropFirms />
                  </AppLayout>
                }
              />
              <Route
                path="/accounts"
                element={
                  <AppLayout>
                    <Paywall title="Account Tracking is a Member Benefit" description="Track your prop firm accounts, evaluations, and funded status.">
                      <Accounts />
                    </Paywall>
                  </AppLayout>
                }
              />
              <Route
                path="/financials"
                element={
                  <AppLayout>
                    <Paywall title="Financials is a Member Benefit" description="Track payouts, expenses, and your overall trading business P&L.">
                      <Financials />
                    </Paywall>
                  </AppLayout>
                }
              />
              <Route
                path="/reports"
                element={
                  <AppLayout>
                    <Paywall title="Reports is a Member Benefit" description="Generate detailed reports of your trading performance.">
                      <Reports />
                    </Paywall>
                  </AppLayout>
                }
              />
              <Route
                path="/bots"
                element={
                  <AppLayout>
                    <Bots />
                  </AppLayout>
                }
              />
              <Route
                path="/bots/:id"
                element={
                  <AppLayout>
                    <BotDetail />
                  </AppLayout>
                }
              />
              <Route
                path="/bot-accounts"
                element={
                  <AppLayout>
                    <BotAccounts />
                  </AppLayout>
                }
              />
              <Route
                path="/bot-trades"
                element={
                  <AppLayout>
                    <BotTrades />
                  </AppLayout>
                }
              />
              <Route
                path="/bot-analytics"
                element={
                  <AppLayout>
                    <BotAnalytics />
                  </AppLayout>
                }
              />
              <Route path="*" element={<NotFound />} />
                </Routes>
              </HashRouter>
            </TooltipProvider>
          </MembershipProvider>
        </DataProvider>
      </BotProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
