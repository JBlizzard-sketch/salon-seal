import { useState, useEffect } from "react";
import { useGetSalon, getGetSalonQueryKey, useUpdateSalon } from "@workspace/api-client-react";
import type { BusinessHours } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const DAYS = [
  { key: "monday",    label: "Monday" },
  { key: "tuesday",   label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday",  label: "Thursday" },
  { key: "friday",    label: "Friday" },
  { key: "saturday",  label: "Saturday" },
  { key: "sunday",    label: "Sunday" },
] as const;

type DayKey = typeof DAYS[number]["key"];

const DEFAULT_HOURS: BusinessHours = {
  monday:    { isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  tuesday:   { isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  wednesday: { isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  thursday:  { isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  friday:    { isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  saturday:  { isOpen: true,  openTime: "09:00", closeTime: "17:00" },
  sunday:    { isOpen: false, openTime: "09:00", closeTime: "17:00" },
};

export default function Settings() {
  const salonId = 1;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: salon, isLoading } = useGetSalon(salonId, {
    query: {
      queryKey: getGetSalonQueryKey(salonId)
    }
  });

  const updateSalon = useUpdateSalon();

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    phone: "",
    location: "",
    cancellationWindowHours: 24,
    monthlyRevenueGoal: 0,
    autoBlacklistThreshold: 0,
  });

  const [businessHours, setBusinessHours] = useState<BusinessHours>(DEFAULT_HOURS);
  const [hoursDirty, setHoursDirty] = useState(false);

  useEffect(() => {
    if (salon) {
      setFormData({
        name: salon.name || "",
        slug: salon.slug || "",
        description: salon.description || "",
        phone: salon.phone || "",
        location: salon.location || "",
        cancellationWindowHours: salon.cancellationWindowHours || 24,
        monthlyRevenueGoal: salon.monthlyRevenueGoal ?? 0,
        autoBlacklistThreshold: salon.autoBlacklistThreshold ?? 0,
      });
      setBusinessHours(salon.businessHours ?? DEFAULT_HOURS);
    }
  }, [salon]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSalon.mutate(
      {
        id: salonId,
        data: {
          name: formData.name,
          description: formData.description || null,
          phone: formData.phone,
          location: formData.location,
          cancellationWindowHours: Number(formData.cancellationWindowHours),
          monthlyRevenueGoal: formData.monthlyRevenueGoal > 0 ? formData.monthlyRevenueGoal : null,
          autoBlacklistThreshold: formData.autoBlacklistThreshold > 0 ? formData.autoBlacklistThreshold : null,
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSalonQueryKey(salonId) });
          toast({ title: "Settings updated", description: "Your salon settings have been saved." });
        }
      }
    );
  };

  const handleSaveHours = () => {
    updateSalon.mutate(
      { id: salonId, data: { businessHours } },
      {
        onSuccess: () => {
          setHoursDirty(false);
          queryClient.invalidateQueries({ queryKey: getGetSalonQueryKey(salonId) });
          toast({ title: "Business hours saved", description: "Your schedule has been updated." });
        }
      }
    );
  };

  const updateDay = (day: DayKey, field: "isOpen" | "openTime" | "closeTime", value: boolean | string) => {
    setHoursDirty(true);
    setBusinessHours(prev => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!salon) return <div className="text-destructive">Failed to load settings</div>;

  const publicUrl = `${window.location.origin}/book/${salon.slug}`;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Salon Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your business profile and preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Booking Link</CardTitle>
          <CardDescription>Share this link with clients to allow them to book online.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input readOnly value={publicUrl} className="bg-muted font-mono text-sm" />
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(publicUrl);
                toast({ title: "Link copied to clipboard" });
              }}
            >
              Copy
            </Button>
            <Button variant="outline" onClick={() => window.open(`/book/${salon.slug}`, '_blank')}>
              Visit
            </Button>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Business Profile</CardTitle>
            <CardDescription>Update your salon details and contact information.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Business Name</Label>
              <Input id="name" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Contact Phone</Label>
                <Input id="phone" required value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cancellationWindowHours">Cancellation Window (Hours)</Label>
                <Input
                  id="cancellationWindowHours"
                  type="number"
                  min="0"
                  required
                  value={formData.cancellationWindowHours}
                  onChange={(e) => setFormData({...formData, cancellationWindowHours: parseInt(e.target.value) || 0})}
                  aria-describedby="cancellation-desc"
                />
                <p id="cancellation-desc" className="text-xs text-muted-foreground">
                  Deposits are non-refundable if cancelled within this window.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="monthlyRevenueGoal">Monthly Revenue Goal (Ksh)</Label>
              <Input
                id="monthlyRevenueGoal"
                type="number"
                min="0"
                step="1000"
                placeholder="e.g. 150000"
                value={formData.monthlyRevenueGoal || ""}
                onChange={(e) => setFormData({ ...formData, monthlyRevenueGoal: parseInt(e.target.value) || 0 })}
                aria-describedby="goal-desc"
              />
              <p id="goal-desc" className="text-xs text-muted-foreground">
                Set a monthly revenue target to track progress on the dashboard. Leave blank to disable.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="autoBlacklistThreshold">Auto-block after N no-shows</Label>
              <Input
                id="autoBlacklistThreshold"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 3 (leave blank to disable)"
                value={formData.autoBlacklistThreshold || ""}
                onChange={(e) => setFormData({ ...formData, autoBlacklistThreshold: parseInt(e.target.value) || 0 })}
                aria-describedby="blacklist-desc"
              />
              <p id="blacklist-desc" className="text-xs text-muted-foreground">
                Clients will be automatically blocked once they reach this many no-shows. Leave blank to disable.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Physical Location</Label>
              <Input id="location" required value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">About the Salon</Label>
              <Textarea id="description" rows={4} value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end border-t p-6">
            <Button type="submit" disabled={updateSalon.isPending}>
              {updateSalon.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </CardFooter>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Business Hours</CardTitle>
          <CardDescription>
            Set your open days and hours. The public booking page will only show available slots within these times.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {DAYS.map(({ key, label }) => {
              const day = businessHours[key];
              return (
                <div key={key} className={`flex items-center gap-4 py-3 px-2 rounded-lg transition-colors ${day.isOpen ? "" : "opacity-50"}`}>
                  <div className="w-28 shrink-0">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`open-${key}`}
                        checked={day.isOpen}
                        onCheckedChange={(v) => updateDay(key, "isOpen", v)}
                      />
                      <Label htmlFor={`open-${key}`} className="cursor-pointer font-medium">{label}</Label>
                    </div>
                  </div>
                  {day.isOpen ? (
                    <div className="flex items-center gap-2 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground w-8">Open</span>
                        <Input
                          type="time"
                          value={day.openTime}
                          onChange={(e) => updateDay(key, "openTime", e.target.value)}
                          className="w-[120px] h-8 text-sm"
                        />
                      </div>
                      <span className="text-muted-foreground text-sm">–</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground w-10">Close</span>
                        <Input
                          type="time"
                          value={day.closeTime}
                          onChange={(e) => updateDay(key, "closeTime", e.target.value)}
                          className="w-[120px] h-8 text-sm"
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
        <CardFooter className="flex justify-end border-t p-6">
          <Button onClick={handleSaveHours} disabled={updateSalon.isPending || !hoursDirty}>
            {updateSalon.isPending ? "Saving…" : "Save Hours"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
