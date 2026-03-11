import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider } from "@/context/AuthContext";
import { BotProvider } from "@/context/BotContext";
import { JournalProvider } from "@/context/JournalContext";

// Pages
import Dashboard from "./pages/Dashboard";
import TradeJournal from "./pages/TradeJournal";
import Reports from "./pages/Reports";
import NotFound from "./pages/NotFound";
import BigMitchWorldPage from "./pages/BigMitchWorld";

// Bot pages
import Bots from "./pages/Bots";
import BotDetail from "./pages/BotDetail";
import BotAccounts from "./pages/BotAccounts";
import BotTrades from "./pages/BotTrades";
import BotCalendar from "./pages/BotCalendar";
import BotAnalytics from "./pages/BotAnalytics";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <BotProvider>
        <JournalProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <HashRouter>
              <Routes>
                {/* Redirect root to dashboard */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />

                {/* Bot tracking routes */}
                <Route
                  path="/dashboard"
                  element={
                    <AppLayout>
                      <Dashboard />
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
                  path="/bot-calendar"
                  element={
                    <AppLayout>
                      <BotCalendar />
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

                {/* Personal journal route */}
                <Route
                  path="/trade-journal"
                  element={
                    <AppLayout>
                      <TradeJournal />
                    </AppLayout>
                  }
                />
                <Route
                  path="/trade-journal/*"
                  element={
                    <AppLayout>
                      <TradeJournal />
                    </AppLayout>
                  }
                />
                <Route
                  path="/reports"
                  element={
                    <AppLayout>
                      <Reports />
                    </AppLayout>
                  }
                />

                {/* Standalone Big Mitch's World - full screen, no layout */}
                <Route path="/big-mitch" element={<BigMitchWorldPage />} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </HashRouter>
          </TooltipProvider>
        </JournalProvider>
      </BotProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
