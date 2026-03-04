import { useState } from "react";
import { Plus, Pencil, Trash2, ExternalLink, Star } from "lucide-react";
import { useJournal } from "@/context/JournalContext";
import { PropFirm } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const PropFirms = () => {
  const { propFirms, addPropFirm, updatePropFirm, deletePropFirm } = useJournal();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFirm, setEditingFirm] = useState<PropFirm | null>(null);

  const renderStars = (rating: number = 0) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn("h-4 w-4", star <= rating ? "fill-warning text-warning" : "text-muted-foreground/30")}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Prop Firms</h1>
          <p className="page-subtitle">Your prop firm directory</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Plus className="mr-2 h-4 w-4" />
              Add Firm
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingFirm ? 'Edit Prop Firm' : 'Add New Prop Firm'}</DialogTitle>
            </DialogHeader>
            <FirmForm
              onClose={() => { setIsDialogOpen(false); setEditingFirm(null); }}
              onSave={(firm) => {
                if (editingFirm) {
                  updatePropFirm(firm);
                } else {
                  addPropFirm(firm);
                }
                setIsDialogOpen(false);
                setEditingFirm(null);
              }}
              initialData={editingFirm}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {propFirms.map((firm) => (
          <div key={firm.id} className="stat-card group relative">
            <div className="absolute right-4 top-4 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              <Button variant="ghost" size="icon" onClick={() => { setEditingFirm(firm); setIsDialogOpen(true); }}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => deletePropFirm(firm.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>

            <div className="mb-4">
              <h3 className="text-lg font-semibold">{firm.name}</h3>
              {renderStars(firm.rating)}
            </div>

            <div className="mb-4">
              <p className="section-label">Total Payouts</p>
              <p className="text-2xl font-semibold text-success">${firm.totalPayouts.toLocaleString()}</p>
            </div>

            {firm.website && (
              <a href={firm.website} target="_blank" rel="noopener noreferrer" className="mb-4 flex items-center gap-2 text-sm text-accent hover:underline">
                <ExternalLink className="h-4 w-4" />
                Visit Website
              </a>
            )}

            {firm.notes && (
              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground">{firm.notes}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

interface FirmFormProps {
  onClose: () => void;
  onSave: (firm: PropFirm) => void;
  initialData?: PropFirm | null;
}

function FirmForm({ onClose, onSave, initialData }: FirmFormProps) {
  const [formData, setFormData] = useState<Partial<PropFirm>>(
    initialData || { name: '', website: '', notes: '', rating: 3, totalPayouts: 0 }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData as PropFirm);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Firm Name</Label>
        <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="website">Website URL</Label>
        <Input id="website" type="url" value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} placeholder="https://" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="rating">Rating</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button key={star} type="button" onClick={() => setFormData({ ...formData, rating: star })} className="rounded p-1 hover:bg-secondary">
              <Star className={cn("h-6 w-6 transition-colors", star <= (formData.rating || 0) ? "fill-warning text-warning" : "text-muted-foreground/30")} />
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Your thoughts on this firm..." />
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90">
          {initialData ? 'Update' : 'Add'} Firm
        </Button>
      </div>
    </form>
  );
}

export default PropFirms;
