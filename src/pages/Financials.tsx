import { useState } from "react";
import { format } from "date-fns";
import { Plus, Download, Pencil, Trash2 } from "lucide-react";
import { useJournal } from "@/context/JournalContext";
import { PAYOUT_METHODS, EXPENSE_CATEGORIES, Payout, Expense } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const Financials = () => {
  const {
    payouts, propFirms, addPayout, updatePayout, deletePayout,
    expenses, addExpense, updateExpense, deleteExpense,
  } = useJournal();

  const [tab, setTab] = useState<"payouts" | "expenses">("payouts");
  const [isPayoutDialogOpen, setIsPayoutDialogOpen] = useState(false);
  const [editingPayout, setEditingPayout] = useState<Payout | null>(null);
  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [filterFirm, setFilterFirm] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  const totalPayouts = payouts.reduce((sum, p) => sum + p.amount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const net = totalPayouts - totalExpenses;

  // Payouts
  const filteredPayouts = filterFirm === "all"
    ? payouts
    : payouts.filter((p) => p.propFirm === filterFirm);
  const sortedPayouts = [...filteredPayouts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Expenses
  const filteredExpenses = filterCategory === "all"
    ? expenses
    : expenses.filter((e) => e.category === filterCategory);
  const sortedExpenses = [...filteredExpenses].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const handleExportCSV = () => {
    if (tab === "payouts") {
      const headers = ["Date", "Amount", "Prop Firm", "Method", "Notes"];
      const rows = sortedPayouts.map((p) => [
        p.date, p.amount.toString(), p.propFirm, p.method, p.notes || "",
      ]);
      const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "payouts.csv";
      a.click();
    } else {
      const headers = ["Date", "Amount", "Category", "Prop Firm", "Notes"];
      const rows = sortedExpenses.map((e) => [
        e.date, e.amount.toString(), e.category, e.propFirm || "", e.notes || "",
      ]);
      const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "expenses.csv";
      a.click();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Financials</h1>
          <p className="page-subtitle">Payouts and expenses</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          {tab === "payouts" ? (
            <Button
              size="sm"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => { setEditingPayout(null); setIsPayoutDialogOpen(true); }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Payout
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => { setEditingExpense(null); setIsExpenseDialogOpen(true); }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Expense
            </Button>
          )}
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card p-4">
          <p className="section-label">Payouts</p>
          <p className="text-xl font-bold text-success tabular-nums">${totalPayouts.toLocaleString()}</p>
        </div>
        <div className="stat-card p-4">
          <p className="section-label">Expenses</p>
          <p className="text-xl font-bold text-destructive tabular-nums">${totalExpenses.toLocaleString()}</p>
        </div>
        <div className="stat-card p-4">
          <p className="section-label">Net</p>
          <p className={cn("text-xl font-bold tabular-nums", net >= 0 ? "text-success" : "text-destructive")}>
            {net >= 0 ? "+" : "-"}${Math.abs(net).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Tab Switcher + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "payouts" | "expenses")}>
          <TabsList>
            <TabsTrigger value="payouts">Payouts</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "payouts" ? (
          <div className="w-44">
            <Select value={filterFirm} onValueChange={setFilterFirm}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by firm" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Firms</SelectItem>
                {propFirms.map((f) => (
                  <SelectItem key={f.id} value={f.name}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="w-44">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="stat-card overflow-x-auto p-0">
        {tab === "payouts" ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Prop Firm</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPayouts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No payouts yet
                  </TableCell>
                </TableRow>
              ) : (
                sortedPayouts.map((p) => (
                  <TableRow key={p.id} className="group">
                    <TableCell>{format(new Date(p.date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-medium">{p.propFirm}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {PAYOUT_METHODS.find((m) => m.value === p.method)?.label}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">{p.notes || "-"}</TableCell>
                    <TableCell className="text-right font-bold text-success">+${p.amount.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingPayout(p); setIsPayoutDialogOpen(true); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deletePayout(p.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
              {sortedPayouts.length > 0 && (
                <TableRow className="border-t font-semibold hover:bg-transparent">
                  <TableCell colSpan={4}>Total</TableCell>
                  <TableCell className="text-right text-success">${totalPayouts.toLocaleString()}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Prop Firm</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedExpenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No expenses yet
                  </TableCell>
                </TableRow>
              ) : (
                sortedExpenses.map((e) => (
                  <TableRow key={e.id} className="group">
                    <TableCell>{format(new Date(e.date), "MMM d, yyyy")}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.label}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{e.propFirm || "-"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">{e.notes || "-"}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">-${e.amount.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingExpense(e); setIsExpenseDialogOpen(true); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteExpense(e.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
              {sortedExpenses.length > 0 && (
                <TableRow className="border-t font-semibold hover:bg-transparent">
                  <TableCell colSpan={4}>Total</TableCell>
                  <TableCell className="text-right text-destructive">${totalExpenses.toLocaleString()}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Payout Dialog */}
      <Dialog open={isPayoutDialogOpen} onOpenChange={(open) => { setIsPayoutDialogOpen(open); if (!open) setEditingPayout(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPayout ? "Edit Payout" : "Add Payout"}</DialogTitle>
          </DialogHeader>
          <PayoutForm
            propFirms={propFirms}
            initialData={editingPayout}
            onSave={(p) => {
              if (editingPayout) updatePayout(p);
              else addPayout(p);
              setIsPayoutDialogOpen(false);
              setEditingPayout(null);
            }}
            onClose={() => { setIsPayoutDialogOpen(false); setEditingPayout(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Expense Dialog */}
      <Dialog open={isExpenseDialogOpen} onOpenChange={(open) => { setIsExpenseDialogOpen(open); if (!open) setEditingExpense(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingExpense ? "Edit Expense" : "Add Expense"}</DialogTitle>
          </DialogHeader>
          <ExpenseForm
            propFirms={propFirms}
            initialData={editingExpense}
            onSave={(e) => {
              if (editingExpense) updateExpense(e);
              else addExpense(e);
              setIsExpenseDialogOpen(false);
              setEditingExpense(null);
            }}
            onClose={() => { setIsExpenseDialogOpen(false); setEditingExpense(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Payout Form ─────────────────────────────────────────────

interface PayoutFormProps {
  propFirms: { id: string; name: string }[];
  initialData?: Payout | null;
  onSave: (payout: Payout) => void;
  onClose: () => void;
}

function PayoutForm({ propFirms, initialData, onSave, onClose }: PayoutFormProps) {
  const [formData, setFormData] = useState<Partial<Payout>>(
    initialData || { date: new Date().toISOString().split("T")[0], amount: 0, propFirm: "", method: "bank_transfer", notes: "" }
  );
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(formData as Payout); };
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Date</Label>
          <Input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} required />
        </div>
        <div className="space-y-1">
          <Label>Amount ($)</Label>
          <Input type="number" min="0" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })} required />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Prop Firm</Label>
          <Select value={formData.propFirm} onValueChange={(v) => setFormData({ ...formData, propFirm: v })}>
            <SelectTrigger><SelectValue placeholder="Select firm" /></SelectTrigger>
            <SelectContent>
              {propFirms.map((f) => <SelectItem key={f.id} value={f.name}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Method</Label>
          <Select value={formData.method} onValueChange={(v) => setFormData({ ...formData, method: v as Payout["method"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYOUT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Notes</Label>
        <Textarea rows={2} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional..." />
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90">{initialData ? "Update" : "Add"}</Button>
      </div>
    </form>
  );
}

// ── Expense Form ────────────────────────────────────────────

interface ExpenseFormProps {
  propFirms: { id: string; name: string }[];
  initialData?: Expense | null;
  onSave: (expense: Expense) => void;
  onClose: () => void;
}

function ExpenseForm({ propFirms, initialData, onSave, onClose }: ExpenseFormProps) {
  const [formData, setFormData] = useState<Partial<Expense>>(
    initialData || { date: new Date().toISOString().split("T")[0], amount: 0, category: "challenge_fee", propFirm: "", notes: "" }
  );
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(formData as Expense); };
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Date</Label>
          <Input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} required />
        </div>
        <div className="space-y-1">
          <Label>Amount ($)</Label>
          <Input type="number" min="0" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })} required />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Category</Label>
          <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v as Expense["category"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Prop Firm (optional)</Label>
          <Select value={formData.propFirm || "none"} onValueChange={(v) => setFormData({ ...formData, propFirm: v === "none" ? undefined : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {propFirms.map((f) => <SelectItem key={f.id} value={f.name}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Notes</Label>
        <Textarea rows={2} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional..." />
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90">{initialData ? "Update" : "Add"}</Button>
      </div>
    </form>
  );
}

export default Financials;
