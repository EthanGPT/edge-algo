import { useState, useMemo } from "react";
import { format, parseISO, isWithinInterval, startOfYear, startOfMonth, subDays } from "date-fns";
import { Download } from "lucide-react";
import { useJournal } from "@/context/JournalContext";
import { EXPENSE_CATEGORIES } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, Line, LineChart,
} from "recharts";

type DateRange = 'all_time' | 'this_year' | 'this_month' | 'last_30' | 'last_90' | 'custom';

const today = () => new Date().toISOString().split('T')[0];

function getPresetDates(range: DateRange): { from: string; to: string } {
  const now = new Date();
  const to = today();
  switch (range) {
    case 'this_year':
      return { from: format(startOfYear(now), 'yyyy-MM-dd'), to };
    case 'this_month':
      return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to };
    case 'last_30':
      return { from: format(subDays(now, 30), 'yyyy-MM-dd'), to };
    case 'last_90':
      return { from: format(subDays(now, 90), 'yyyy-MM-dd'), to };
    default:
      return { from: '', to };
  }
}

const Reports = () => {
  const { payouts, expenses, propFirms } = useJournal();
  const [dateRange, setDateRange] = useState<DateRange>('all_time');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState(today());
  const [filterFirm, setFilterFirm] = useState<string>("all");

  const handleRangeChange = (range: DateRange) => {
    setDateRange(range);
    if (range === 'all_time') {
      setDateFrom('');
      setDateTo(today());
    } else if (range === 'custom') {
      if (!dateFrom) setDateFrom('2024-01-01');
      setDateTo(today());
    } else {
      const { from, to } = getPresetDates(range);
      setDateFrom(from);
      setDateTo(to);
    }
  };

  const isFiltered = dateRange !== 'all_time' && dateFrom && dateTo;

  const filteredPayouts = useMemo(() => {
    let result = payouts;
    if (isFiltered) {
      result = result.filter(p =>
        isWithinInterval(parseISO(p.date), { start: parseISO(dateFrom), end: parseISO(dateTo) })
      );
    }
    if (filterFirm !== "all") {
      result = result.filter(p => p.propFirm === filterFirm);
    }
    return result;
  }, [payouts, dateFrom, dateTo, filterFirm, isFiltered]);

  const filteredExpenses = useMemo(() => {
    let result = expenses;
    if (isFiltered) {
      result = result.filter(e =>
        isWithinInterval(parseISO(e.date), { start: parseISO(dateFrom), end: parseISO(dateTo) })
      );
    }
    if (filterFirm !== "all") {
      result = result.filter(e => e.propFirm === filterFirm);
    }
    return result;
  }, [expenses, dateFrom, dateTo, filterFirm, isFiltered]);

  const payoutsByFirm = useMemo(() => {
    const map = filteredPayouts.reduce((acc, p) => {
      acc[p.propFirm] = (acc[p.propFirm] || 0) + p.amount;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(map).map(([name, amount]) => ({ name, amount }));
  }, [filteredPayouts]);

  const expensesByCategory = useMemo(() => {
    const map = filteredExpenses.reduce((acc, e) => {
      const label = EXPENSE_CATEGORIES.find(c => c.value === e.category)?.label || e.category;
      acc[label] = (acc[label] || 0) + e.amount;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(map).map(([name, amount]) => ({ name, amount }));
  }, [filteredExpenses]);

  const monthlyData = useMemo(() => {
    const months: Record<string, { payouts: number; expenses: number }> = {};
    filteredPayouts.forEach(p => {
      const key = format(parseISO(p.date), 'MMM yy');
      if (!months[key]) months[key] = { payouts: 0, expenses: 0 };
      months[key].payouts += p.amount;
    });
    filteredExpenses.forEach(e => {
      const key = format(parseISO(e.date), 'MMM yy');
      if (!months[key]) months[key] = { payouts: 0, expenses: 0 };
      months[key].expenses += e.amount;
    });
    return Object.entries(months)
      .sort((a, b) => {
        const da = parseISO(filteredPayouts.find(p => format(parseISO(p.date), 'MMM yy') === a[0])?.date || filteredExpenses.find(e => format(parseISO(e.date), 'MMM yy') === a[0])?.date || '2024-01-01');
        const db = parseISO(filteredPayouts.find(p => format(parseISO(p.date), 'MMM yy') === b[0])?.date || filteredExpenses.find(e => format(parseISO(e.date), 'MMM yy') === b[0])?.date || '2024-01-01');
        return da.getTime() - db.getTime();
      })
      .map(([month, data]) => ({ month, ...data }));
  }, [filteredPayouts, filteredExpenses]);

  const totalPayouts = filteredPayouts.reduce((sum, p) => sum + p.amount, 0);
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalPayouts - totalExpenses;

  const handleExportCSV = () => {
    const lines = [
      '=== PROP TRADING REPORT ===', '',
      'SUMMARY',
      `Total Payouts,${totalPayouts}`,
      `Total Expenses,${totalExpenses}`,
      `Net Profit,${netProfit}`,
      '', 'PAYOUTS BY FIRM',
      ...payoutsByFirm.map(d => `${d.name},${d.amount}`),
      '', 'EXPENSES BY CATEGORY',
      ...expensesByCategory.map(d => `${d.name},${d.amount}`),
    ];
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trading-report.csv';
    a.click();
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Analytics and performance reports</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label>Date Range</Label>
            <Select value={dateRange} onValueChange={(v) => handleRangeChange(v as DateRange)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_time">All Time</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_30">Last 30 Days</SelectItem>
                <SelectItem value="last_90">Last 90 Days</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {dateRange === 'custom' && (
            <>
              <div className="space-y-2">
                <Label>From</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>To</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label>Prop Firm</Label>
            <Select value={filterFirm} onValueChange={setFilterFirm}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by firm" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Firms</SelectItem>
                {propFirms.map((firm) => (
                  <SelectItem key={firm.id} value={firm.name}>{firm.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <div className="stat-card text-center">
          <p className="text-sm text-muted-foreground">Total Payouts</p>
          <p className="text-3xl font-bold text-success">${totalPayouts.toLocaleString()}</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-sm text-muted-foreground">Total Expenses</p>
          <p className="text-3xl font-bold text-destructive">${totalExpenses.toLocaleString()}</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-sm text-muted-foreground">Net Profit</p>
          <p className={`text-3xl font-bold ${netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
            ${netProfit.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="stat-card">
          <h3 className="mb-6 text-lg font-semibold">Payouts by Firm</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={payoutsByFirm} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" tickFormatter={(v) => `$${v / 1000}k`} />
                <YAxis type="category" dataKey="name" width={80} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="tooltip-card">
                          <p className="text-sm font-medium">{payload[0].payload.name}</p>
                          <p className="text-lg font-bold text-success">${payload[0].value?.toLocaleString()}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="amount" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="stat-card">
          <h3 className="mb-6 text-lg font-semibold">Expenses by Category</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expensesByCategory} layout="vertical" margin={{ left: 100 }}>
                <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" width={100} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="tooltip-card">
                          <p className="text-sm font-medium">{payload[0].payload.name}</p>
                          <p className="text-lg font-bold text-destructive">${payload[0].value?.toLocaleString()}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="amount" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="mb-6 text-lg font-semibold">Monthly Performance</h3>
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyData}>
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(v) => `$${v / 1000}k`} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="tooltip-card">
                        <p className="mb-2 text-sm font-medium">{label}</p>
                        <p className="text-sm text-success">Payouts: ${payload[0].value?.toLocaleString()}</p>
                        <p className="text-sm text-destructive">Expenses: ${payload[1]?.value?.toLocaleString()}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="payouts" stroke="hsl(var(--success))" strokeWidth={1.5} dot={{ fill: 'hsl(var(--success))' }} name="Payouts" />
              <Line type="monotone" dataKey="expenses" stroke="hsl(var(--destructive))" strokeWidth={1.5} dot={{ fill: 'hsl(var(--destructive))' }} name="Expenses" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Reports;
