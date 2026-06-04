import { useState } from "react";
import {
  useListStaff,
  getListStaffQueryKey,
  useCreateStaffMember,
  useUpdateStaffMember,
  useDeleteStaffMember,
  useListStaffBlocks,
  useCreateStaffBlock,
  useDeleteStaffBlock,
  getListStaffBlocksQueryKey,
  useGetStaffPerformance,
  getGetStaffPerformanceQueryKey,
} from "@workspace/api-client-react";
import type { StaffBlock, StaffPerformanceEntry } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { format } from "date-fns";

const PERIOD_LABELS: Record<string, string> = {
  week: "Last 7 days",
  month: "Last 30 days",
  "3months": "Last 3 months",
  "6months": "Last 6 months",
  all: "All time",
};

const CHART_COLORS = ["#f97316", "#fb923c", "#fdba74", "#fed7aa", "#ffedd5"];

export default function Staff() {
  const salonId = 1;
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any | null>(null);
  const [blocksStaff, setBlocksStaff] = useState<any | null>(null);
  const [perfPeriod, setPerfPeriod] = useState("month");

  const { data: staff, isLoading } = useListStaff(salonId, {
    query: {
      queryKey: getListStaffQueryKey(salonId)
    }
  });

  const filteredStaff = staff?.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const { data: perfData, isLoading: perfLoading } = useGetStaffPerformance(salonId, { period: perfPeriod }, {
    query: { queryKey: getGetStaffPerformanceQueryKey(salonId, { period: perfPeriod }) },
  });

  const perfEntries: StaffPerformanceEntry[] = perfData?.entries ?? [];
  const maxRevenue = Math.max(...perfEntries.map(e => e.totalRevenue), 1);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff Roster</h1>
          <p className="text-muted-foreground mt-1">Manage your team members.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-[250px]">
            <Input
              placeholder="Search staff..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button onClick={() => setIsAdding(true)}>Add Staff</Button>
        </div>
      </div>

      <div className="border rounded-md bg-card">
        {isLoading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !filteredStaff || filteredStaff.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            No staff members found.
          </div>
        ) : (
          <div className="divide-y">
            <div className="grid grid-cols-5 p-4 font-medium text-sm text-muted-foreground bg-muted/30">
              <div className="col-span-2">Name</div>
              <div>Role</div>
              <div>Status</div>
              <div className="text-right">Actions</div>
            </div>
            {filteredStaff.map(member => (
              <div
                key={member.id}
                className="grid grid-cols-5 p-4 items-center hover:bg-muted/50 transition-colors"
              >
                <div
                  className="col-span-2 flex items-center gap-3 cursor-pointer"
                  onClick={() => setEditingStaff(member)}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.phone || "No phone"}</p>
                  </div>
                </div>
                <div className="text-sm cursor-pointer" onClick={() => setEditingStaff(member)}>
                  {member.role}
                </div>
                <div className="cursor-pointer" onClick={() => setEditingStaff(member)}>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${member.isActive ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                    {member.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={(e) => { e.stopPropagation(); setBlocksStaff(member); }}
                  >
                    📅 Time Off
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Performance Panel ─────────────────────────────────────────── */}
      <div className="border rounded-md bg-card">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-semibold text-lg">Staff Performance</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Revenue &amp; bookings per team member</p>
          </div>
          <Select value={perfPeriod} onValueChange={setPerfPeriod}>
            <SelectTrigger className="w-[150px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PERIOD_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {perfLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        ) : perfEntries.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No data for this period.</p>
        ) : (
          <div className="p-4 space-y-6">
            {/* Revenue bar chart */}
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perfEntries} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <XAxis dataKey="staffName" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v / 1000}k`} width={40} />
                  <Tooltip
                    formatter={(value: number) => [`Ksh ${value.toLocaleString()}`, "Revenue"]}
                    labelStyle={{ fontSize: 12 }}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="totalRevenue" radius={[4, 4, 0, 0]}>
                    {perfEntries.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Leaderboard table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left pb-2 font-medium w-6">#</th>
                    <th className="text-left pb-2 font-medium">Name</th>
                    <th className="text-right pb-2 font-medium">Bookings</th>
                    <th className="text-right pb-2 font-medium">Completed</th>
                    <th className="text-right pb-2 font-medium">Revenue</th>
                    <th className="text-right pb-2 font-medium">Avg Value</th>
                    <th className="text-right pb-2 font-medium">No-shows</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {perfEntries.map((e, i) => (
                    <tr key={e.staffId} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pr-2 text-muted-foreground font-medium text-xs">{i + 1}</td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                            {e.staffName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium leading-tight">{e.staffName}</p>
                            <p className="text-xs text-muted-foreground">{e.role}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 text-right">{e.totalBookings}</td>
                      <td className="py-2.5 text-right text-emerald-600 font-medium">{e.completedBookings}</td>
                      <td className="py-2.5 text-right font-semibold">
                        <div className="flex items-center justify-end gap-2">
                          <div
                            className="h-1.5 rounded-full bg-orange-400 shrink-0"
                            style={{ width: `${Math.round((e.totalRevenue / maxRevenue) * 60)}px` }}
                          />
                          Ksh {e.totalRevenue.toLocaleString()}
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-muted-foreground">Ksh {e.avgBookingValue.toLocaleString()}</td>
                      <td className="py-2.5 text-right">
                        {e.noShowCount > 0 ? (
                          <span className="text-red-600 font-medium">{e.noShowCount} <span className="text-muted-foreground font-normal text-xs">({e.noShowRate}%)</span></span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <StaffFormDialog
        salonId={salonId}
        open={isAdding}
        onClose={() => setIsAdding(false)}
      />

      {editingStaff && (
        <StaffFormDialog
          salonId={salonId}
          open={true}
          staffMember={editingStaff}
          onClose={() => setEditingStaff(null)}
        />
      )}

      {blocksStaff && (
        <StaffBlocksDialog
          salonId={salonId}
          staffMember={blocksStaff}
          onClose={() => setBlocksStaff(null)}
        />
      )}
    </div>
  );
}

function StaffBlocksDialog({ salonId, staffMember, onClose }: { salonId: number; staffMember: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const tomorrowStr = format(new Date(now.getTime() + 86400000), "yyyy-MM-dd");

  const [startDate, setStartDate] = useState(todayStr);
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(tomorrowStr);
  const [endTime, setEndTime] = useState("18:00");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState("");

  const { data, isLoading } = useListStaffBlocks(salonId, staffMember.id, {}, {
    query: { queryKey: getListStaffBlocksQueryKey(salonId, staffMember.id) }
  });

  const createBlock = useCreateStaffBlock();
  const deleteBlock = useDeleteStaffBlock();

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    const startAt = new Date(`${startDate}T${startTime}:00`).toISOString();
    const endAt = new Date(`${endDate}T${endTime}:00`).toISOString();
    if (new Date(endAt) <= new Date(startAt)) {
      setFormError("End must be after start.");
      return;
    }
    createBlock.mutate(
      { salonId, staffId: staffMember.id, data: { startAt, endAt, reason: reason || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListStaffBlocksQueryKey(salonId, staffMember.id) });
          setReason("");
          setStartDate(todayStr);
          setStartTime("09:00");
          setEndDate(tomorrowStr);
          setEndTime("18:00");
        },
        onError: (err: any) => setFormError(err?.message ?? "Failed to create block"),
      }
    );
  };

  const handleDelete = (blockId: number) => {
    deleteBlock.mutate(
      { salonId, staffId: staffMember.id, blockId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListStaffBlocksQueryKey(salonId, staffMember.id) });
        },
      }
    );
  };

  const blocks: StaffBlock[] = data?.blocks ?? [];

  return (
    <Dialog open onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>📅 Time-Off Blocks — {staffMember.name}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleCreate} className="space-y-3 border rounded-md p-4 bg-muted/30">
          <p className="text-sm font-medium">Add new block</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Start date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Start time</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End time</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reason (optional)</Label>
            <Input placeholder="e.g. Sick leave, Training..." value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          {formError && <p className="text-xs text-destructive">{formError}</p>}
          <Button type="submit" size="sm" disabled={createBlock.isPending} className="w-full">
            {createBlock.isPending ? "Saving…" : "Add Block"}
          </Button>
        </form>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : blocks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No time-off blocks set.</p>
          ) : (
            blocks.map(block => (
              <div key={block.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">
                    {format(new Date(block.startAt), "dd MMM yyyy HH:mm")} → {format(new Date(block.endAt), "dd MMM yyyy HH:mm")}
                  </p>
                  {block.reason && <p className="text-xs text-muted-foreground">{block.reason}</p>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                  disabled={deleteBlock.isPending}
                  onClick={() => handleDelete(block.id)}
                >
                  ✕
                </Button>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StaffFormDialog({ salonId, open, onClose, staffMember }: { salonId: number, open: boolean, onClose: () => void, staffMember?: any }) {
  const queryClient = useQueryClient();
  const createStaff = useCreateStaffMember();
  const updateStaff = useUpdateStaffMember();
  const deleteStaff = useDeleteStaffMember();

  const [formData, setFormData] = useState(staffMember || {
    name: "",
    role: "Barber",
    phone: "",
    isActive: true
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      name: formData.name,
      role: formData.role,
      phone: formData.phone || null,
      isActive: formData.isActive
    };

    if (staffMember) {
      updateStaff.mutate(
        { salonId, id: staffMember.id, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListStaffQueryKey(salonId) });
            onClose();
          }
        }
      );
    } else {
      createStaff.mutate(
        { salonId, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListStaffQueryKey(salonId) });
            onClose();
          }
        }
      );
    }
  };

  const handleDelete = () => {
    if (staffMember && confirm("Are you sure you want to delete this staff member?")) {
      deleteStaff.mutate(
        { salonId, id: staffMember.id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListStaffQueryKey(salonId) });
            onClose();
          }
        }
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{staffMember ? 'Edit Staff Member' : 'Add Staff Member'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={formData.role}
              onValueChange={(val) => setFormData({...formData, role: val})}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Barber">Barber</SelectItem>
                <SelectItem value="Stylist">Stylist</SelectItem>
                <SelectItem value="Colorist">Colorist</SelectItem>
                <SelectItem value="Nail Technician">Nail Technician</SelectItem>
                <SelectItem value="Manager">Manager</SelectItem>
                <SelectItem value="Receptionist">Receptionist</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number (Optional)</Label>
            <Input
              id="phone"
              value={formData.phone || ""}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
            />
          </div>

          {staffMember && (
            <div className="flex items-center justify-between pt-2">
              <Label htmlFor="isActive" className="cursor-pointer">Active Status</Label>
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({...formData, isActive: checked})}
              />
            </div>
          )}

          <DialogFooter className="mt-6 flex justify-between sm:justify-between items-center w-full">
            {staffMember ? (
              <Button type="button" variant="destructive" onClick={handleDelete}>Delete</Button>
            ) : (
              <div></div>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={createStaff.isPending || updateStaff.isPending}>
                {staffMember ? 'Save Changes' : 'Add Staff'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
