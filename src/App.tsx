import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataProvider } from "@/context/DataContext";
import { MembershipProvider } from "@/context/MembershipContext";
import { Paywall } from "@/components/Paywall";

// Public pages
import Landing from "./pages/Landing";
import Courses from "./pages/Courses";
import Purchase from "./pages/Purchase";
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
import Setups from "./pages/Setups";
import Analytics from "./pages/Analytics";
import Journal from "./pages/Journal";
import BookSession from "./pages/BookSession";
import Discord from "./pages/Discord";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <DataProvider>
      <MembershipProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <HashRouter>
            <Routes>
              {/* Public routes - no sidebar */}
              <Route path="/" element={<Landing />} />
              <Route path="/courses" element={<Courses />} />
              <Route path="/purchase" element={<Purchase />} />
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
                path="/discord"
                element={
                  <AppLayout>
                    <Discord />
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
                path="/book"
                element={
                  <AppLayout>
                    <Paywall
                      requiredTier="mentorship"
                      title="1-on-1 Sessions are a Mentorship Benefit"
                      description="Get direct access with weekly 30-minute sessions to review your trades and refine your execution."
                    >
                      <BookSession />
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
                path="/setups"
                element={
                  <AppLayout>
                    <Paywall title="Trade Setups is a Member Benefit" description="Define and track your trading setups to improve consistency.">
                      <Setups />
                    </Paywall>
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </HashRouter>
        </TooltipProvider>
      </MembershipProvider>
    </DataProvider>
  </QueryClientProvider>
);

export default App;
