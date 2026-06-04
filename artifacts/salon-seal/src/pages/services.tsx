import { useState } from "react";
import { useListServices, getListServicesQueryKey, useCreateService, useUpdateService, useDeleteService } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PRESET_CATEGORIES = ["Hair", "Nails", "Skin & Facials", "Braids & Locs", "Makeup", "Massage", "Eyebrows & Lashes", "Other"];

const CATEGORY_COLORS: Record<string, string> = {
  "Hair": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  "Nails": "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  "Skin & Facials": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "Braids & Locs": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "Makeup": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  "Massage": "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  "Eyebrows & Lashes": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  "Other": "bg-muted text-muted-foreground",
};

function categoryBadge(category: string | null | undefined) {
  if (!category) return null;
  const cls = CATEGORY_COLORS[category] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
      {category}
    </span>
  );
}

export default function Services() {
  const salonId = 1;
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [isAdding, setIsAdding] = useState(false);
  const [editingService, setEditingService] = useState<any | null>(null);

  const { data: services, isLoading } = useListServices(salonId, {
    query: { queryKey: getListServicesQueryKey(salonId) },
  });

  const categories = Array.from(new Set((services ?? []).map(s => s.category).filter(Boolean))) as string[];

  const filteredServices = (services ?? []).filter(s => {
    const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = filterCategory === "all" || s.category === filterCategory || (filterCategory === "uncategorised" && !s.category);
    return matchSearch && matchCat;
  });

  const grouped: Record<string, typeof filteredServices> = {};
  const uncategorised: typeof filteredServices = [];
  for (const s of filteredServices) {
    if (!s.category) { uncategorised.push(s); }
    else {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push(s);
    }
  }
  const groupKeys = Object.keys(grouped).sort();
  if (uncategorised.length > 0) groupKeys.push("__uncategorised__");

  const totalActive = (services ?? []).filter(s => s.isActive).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Services</h1>
          <p className="text-muted-foreground mt-1">
            {isLoading ? "" : `${services?.length ?? 0} services · ${totalActive} active`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Input
            placeholder="Search services..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-[200px]"
          />
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
              {(services ?? []).some(s => !s.category) && (
                <SelectItem value="uncategorised">Uncategorised</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button onClick={() => setIsAdding(true)}>+ Add Service</Button>
        </div>
      </div>

      <div className="space-y-6">
        {isLoading ? (
          <div className="border rounded-md bg-card p-8 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="border rounded-md bg-card p-12 text-center text-muted-foreground">
            No services found.
          </div>
        ) : (
          groupKeys.map(key => {
            const list = key === "__uncategorised__" ? uncategorised : grouped[key];
            const label = key === "__uncategorised__" ? "Uncategorised" : key;
            return (
              <div key={key}>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{label}</h2>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">{list.length}</span>
                </div>
                <div className="border rounded-md bg-card divide-y">
                  <div className="grid grid-cols-6 p-3 font-medium text-xs text-muted-foreground bg-muted/30">
                    <div className="col-span-2">Service</div>
                    <div>Duration</div>
                    <div>Price</div>
                    <div>Deposit</div>
                    <div className="text-right">Status</div>
                  </div>
                  {list.map(service => (
                    <div
                      key={service.id}
                      className={`grid grid-cols-6 p-4 items-center hover:bg-muted/50 transition-colors cursor-pointer ${!service.isActive ? "opacity-60" : ""}`}
                      onClick={() => setEditingService(service)}
                    >
                      <div className="col-span-2 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{service.name}</p>
                          {service.category && categoryBadge(service.category)}
                        </div>
                        {service.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{service.description}</p>
                        )}
                      </div>
                      <div className="text-sm">{service.durationMinutes} min</div>
                      <div className="text-sm font-medium">Ksh {service.price.toLocaleString()}</div>
                      <div className="text-sm text-amber-600 font-medium">
                        Ksh {service.depositAmount.toLocaleString()}
                        {service.depositPercent != null && (
                          <span className="ml-1 text-xs text-muted-foreground">({service.depositPercent}%)</span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${service.isActive ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                          {service.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <ServiceFormDialog salonId={salonId} open={isAdding} onClose={() => setIsAdding(false)} />
      {editingService && (
        <ServiceFormDialog salonId={salonId} open={true} service={editingService} onClose={() => setEditingService(null)} />
      )}
    </div>
  );
}

function ServiceFormDialog({ salonId, open, onClose, service }: { salonId: number; open: boolean; onClose: () => void; service?: any }) {
  const queryClient = useQueryClient();
  const createService = useCreateService();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();

  const [formData, setFormData] = useState(service
    ? { ...service, category: service.category ?? "" }
    : { name: "", description: "", category: "", price: "", depositAmount: "", depositPercent: "", durationMinutes: "60", isActive: true }
  );
  const [depositMode, setDepositMode] = useState<"flat" | "percent">(
    service?.depositPercent != null ? "percent" : "flat"
  );
  const [customCategory, setCustomCategory] = useState(
    service?.category && !PRESET_CATEGORIES.includes(service.category) ? service.category : ""
  );
  const [useCustom, setUseCustom] = useState(
    !!(service?.category && !PRESET_CATEGORIES.includes(service.category))
  );

  const effectiveCategory = useCustom ? customCategory : (formData.category || null);

  const handlePriceChange = (val: string) => {
    const price = Number(val) || 0;
    const pct = Number(formData.depositPercent) || 0;
    if (depositMode === "percent" && pct > 0) {
      setFormData({ ...formData, price: val, depositAmount: String(Math.round(price * pct / 100)) });
    } else {
      setFormData({ ...formData, price: val });
    }
  };

  const handlePercentChange = (val: string) => {
    const pct = Number(val) || 0;
    const price = Number(formData.price) || 0;
    setFormData({
      ...formData,
      depositPercent: val,
      depositAmount: pct > 0 && price > 0 ? String(Math.round(price * pct / 100)) : formData.depositAmount,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: formData.name,
      description: formData.description || null,
      category: effectiveCategory || null,
      price: Number(formData.price),
      depositAmount: Number(formData.depositAmount),
      depositPercent: depositMode === "percent" && formData.depositPercent ? Number(formData.depositPercent) : null,
      durationMinutes: Number(formData.durationMinutes),
      isActive: formData.isActive,
    };

    if (service) {
      updateService.mutate(
        { salonId, id: service.id, data: payload },
        { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListServicesQueryKey(salonId) }); onClose(); } }
      );
    } else {
      createService.mutate(
        { salonId, data: payload },
        { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListServicesQueryKey(salonId) }); onClose(); } }
      );
    }
  };

  const handleDelete = () => {
    if (service && confirm("Are you sure you want to delete this service?")) {
      deleteService.mutate(
        { salonId, id: service.id },
        { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListServicesQueryKey(salonId) }); onClose(); } }
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{service ? "Edit Service" : "Add Service"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Service Name</Label>
            <Input id="name" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            {!useCustom ? (
              <Select
                value={formData.category || ""}
                onValueChange={(v) => {
                  if (v === "__custom__") { setUseCustom(true); }
                  else setFormData({ ...formData, category: v });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {PRESET_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  <SelectItem value="__custom__">+ Custom category…</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Custom category name"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => { setUseCustom(false); setCustomCategory(""); }}>
                  Presets
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">Price (Ksh)</Label>
            <Input id="price" type="number" required min="0" value={formData.price} onChange={(e) => handlePriceChange(e.target.value)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1">
              <Label>Deposit</Label>
              <div className="flex items-center text-xs border rounded-md overflow-hidden">
                <button
                  type="button"
                  className={`px-2.5 py-1 transition-colors ${depositMode === "flat" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  onClick={() => setDepositMode("flat")}
                >
                  Flat (Ksh)
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 transition-colors ${depositMode === "percent" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  onClick={() => setDepositMode("percent")}
                >
                  % of price
                </button>
              </div>
            </div>
            {depositMode === "flat" ? (
              <Input
                type="number"
                required
                min="0"
                value={formData.depositAmount}
                onChange={(e) => setFormData({ ...formData, depositAmount: e.target.value })}
                placeholder="e.g. 500"
              />
            ) : (
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={formData.depositPercent}
                    onChange={(e) => handlePercentChange(e.target.value)}
                    placeholder="e.g. 30"
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
                <div className="text-sm text-muted-foreground shrink-0">
                  = Ksh {Number(formData.depositAmount) > 0 ? Number(formData.depositAmount).toLocaleString() : "—"}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {depositMode === "percent"
                ? "Deposit auto-computes as a % of the service price."
                : "Fixed amount clients pay to secure their booking."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="durationMinutes">Duration (Minutes)</Label>
            <Input id="durationMinutes" type="number" required min="5" step="5" value={formData.durationMinutes} onChange={(e) => setFormData({ ...formData, durationMinutes: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea id="description" rows={2} value={formData.description || ""} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
          </div>

          <div className="flex items-center justify-between pt-2">
            <Label htmlFor="isActive" className="cursor-pointer">Active</Label>
            <Switch id="isActive" checked={formData.isActive} onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })} />
          </div>

          <DialogFooter className="mt-6 flex justify-between sm:justify-between items-center w-full">
            {service ? (
              <Button type="button" variant="destructive" onClick={handleDelete}>Delete</Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={createService.isPending || updateService.isPending}>
                {service ? "Save Changes" : "Add Service"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
