import {
  useListBookings,
  getListBookingsQueryKey,
  useUpdateBookingStatus,
  useSendBookingReminder,
  useListReminders,
  getListRemindersQueryKey,
  useSendDepositNudge,
  useSimulateMpesaPayment,
  useCreateBooking,
  useCancelBooking,
  useAssignBookingStaff,
  useListServices,
  getListServicesQueryKey,
  useListStaff,
  getListStaffQueryKey,
  useRescheduleBooking,
  useGetWaitlist,
  getGetWaitlistQueryKey,
  useRemoveFromWaitlist,
  useMarkWaitlistNotified,
} from "@workspace/api-client-react";
import type { WaitlistEntry } from "@workspace/api-client-react";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

type BookingRow = NonNullable<ReturnType<typeof useListBookings>["data"]>[number];

const HOUR_HEIGHT = 64;
const DAY_START = 8;
const DAY_END = 21;
const HOURS = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-900/40 dark:border-amber-600 dark:text-amber-100",
  confirmed: "bg-blue-100 border-blue-400 text-blue-900 dark:bg-blue-900/40 dark:border-blue-600 dark:text-blue-100",
  arrived: "bg-indigo-100 border-indigo-400 text-indigo-900 dark:bg-indigo-900/40 dark:border-indigo-600 dark:text-indigo-100",
  completed: "bg-emerald-100 border-emerald-400 text-emerald-900 dark:bg-emerald-900/40 dark:border-emerald-600 dark:text-emerald-100",
  no_show: "bg-red-100 border-red-400 text-red-900 dark:bg-red-900/40 dark:border-red-600 dark:text-red-100",
  cancelled: "bg-muted border-border text-muted-foreground",
};

function getWeekStart(d: Date): Date {
  return startOfWeek(d, { weekStartsOn: 1 });
}

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

function bookingTopPx(appointmentAt: Date): number {
  const h = appointmentAt.getHours();
  const m = appointmentAt.getMinutes();
  return (h - DAY_START + m / 60) * HOUR_HEIGHT;
}

function bookingHeightPx(durationMinutes: number | null | undefined): number {
  return Math.max(((durationMinutes ?? 60) / 60) * HOUR_HEIGHT, 30);
}

export default function Bookings() {
  const salonId = 1;
  const [viewMode, setViewMode] = useState<"list" | "calendar" | "waitlist">("list");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [exporting, setExporting] = useState(false);
  const [reminderSending, setReminderSending] = useState<Record<number, boolean>>({});
  const [reminderSent, setReminderSent] = useState<Record<number, boolean>>({});
  const [nudgeSending, setNudgeSending] = useState<Record<number, boolean>>({});
  const [nudgeResult, setNudgeResult] = useState<{ id: number; message: string; waId: string } | null>(null);
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [calWeekStart, setCalWeekStart] = useState(() => getWeekStart(new Date()));
  const [calDetailBooking, setCalDetailBooking] = useState<BookingRow | null>(null);
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [assigningStaffBooking, setAssigningStaffBooking] = useState<BookingRow | null>(null);
  const [reschedulingBooking, setReschedulingBooking] = useState<BookingRow | null>(null);
  const queryClient = useQueryClient();

  const { data: staff } = useListStaff(salonId, {
    query: { queryKey: getListStaffQueryKey(salonId) },
  });
  const activeStaffList = (staff ?? []).filter(s => s.isActive);

  const { data: waitlistData, refetch: refetchWaitlist } = useGetWaitlist(salonId, {
    query: { queryKey: getGetWaitlistQueryKey(salonId) },
  });
  const removeFromWaitlist = useRemoveFromWaitlist();
  const markWaitlistNotified = useMarkWaitlistNotified();
  const pendingWaitlist = (waitlistData?.entries ?? []).filter(e => !e.notified);

  const { data: bookings, isLoading } = useListBookings(
    { salonId, status: statusFilter === "all" ? undefined : statusFilter, staffId: staffFilter === "all" || staffFilter === "none" ? undefined : Number(staffFilter) },
    { query: { queryKey: [...getListBookingsQueryKey(), { salonId, statusFilter, staffFilter }] } },
  );

  const { data: allBookings } = useListBookings(
    { salonId },
    {
      query: {
        enabled: viewMode === "calendar",
        queryKey: [...getListBookingsQueryKey(), { salonId, all: true }],
      },
    },
  );

  const { data: reminders } = useListReminders(salonId, {
    query: { queryKey: getListRemindersQueryKey(salonId) },
  });

  const sentBookingIds = new Set([
    ...(reminders?.map((r) => r.bookingId) ?? []),
    ...Object.keys(reminderSent).map(Number),
  ]);

  const updateStatus = useUpdateBookingStatus();
  const sendReminder = useSendBookingReminder();
  const sendNudge = useSendDepositNudge();
  const confirmPayment = useSimulateMpesaPayment();
  const [confirmingPayment, setConfirmingPayment] = useState<Record<number, boolean>>({});

  const { toast } = useToast();

  const handleStatusUpdate = (id: number, status: string) => {
    updateStatus.mutate(
      { id, data: { status: status as "arrived" | "completed" | "no_show" | "cancelled" } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
          setCalDetailBooking(null);
          if (data.autoBlacklisted && data.autoBlacklistedName) {
            toast({
              title: "Client auto-blocked",
              description: `${data.autoBlacklistedName} has been automatically blocked after reaching the no-show limit.`,
              variant: "destructive",
            });
          }
        },
      },
    );
  };

  const handleSendReminder = (id: number) => {
    setReminderSending((p) => ({ ...p, [id]: true }));
    sendReminder.mutate(
      { id, data: { type: "manual" } },
      {
        onSuccess: () => {
          setReminderSending((p) => ({ ...p, [id]: false }));
          setReminderSent((p) => ({ ...p, [id]: true }));
          queryClient.invalidateQueries({ queryKey: getListRemindersQueryKey(salonId) });
        },
        onError: () => setReminderSending((p) => ({ ...p, [id]: false })),
      },
    );
  };

  const handleSendNudge = (id: number) => {
    setNudgeSending((p) => ({ ...p, [id]: true }));
    sendNudge.mutate(
      { id },
      {
        onSuccess: (data) => {
          setNudgeSending((p) => ({ ...p, [id]: false }));
          setNudgeResult({ id, message: data.message, waId: data.waMessageId });
          queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
        },
        onError: () => setNudgeSending((p) => ({ ...p, [id]: false })),
      },
    );
  };

  const handleConfirmPayment = (id: number) => {
    setConfirmingPayment((p) => ({ ...p, [id]: true }));
    confirmPayment.mutate(
      { id },
      {
        onSuccess: (data) => {
          setConfirmingPayment((p) => ({ ...p, [id]: false }));
          queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
          toast({ title: "Payment confirmed", description: `M-Pesa ref: ${data.mpesaRef}` });
        },
        onError: () => setConfirmingPayment((p) => ({ ...p, [id]: false })),
      },
    );
  };

  const now = new Date();

  const handleExportCsv = () => {
    if (!bookings || bookings.length === 0) return;
    setExporting(true);
    try {
      const header = ["ID", "Client", "Phone", "Service", "Staff", "Date", "Time", "Status", "Deposit Paid", "Deposit Amount (Ksh)", "Notes"];
      const rows = bookings.map(b => [
        b.id,
        b.clientName,
        b.clientPhone,
        b.serviceName,
        b.staffName || "",
        format(new Date(b.appointmentAt), "yyyy-MM-dd"),
        format(new Date(b.appointmentAt), "HH:mm"),
        b.status,
        b.depositPaid ? "Yes" : "No",
        b.depositAmount,
        (b.notes || "").replace(/,/g, ";"),
      ]);
      const csv = [header, ...rows].map(r => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bookings-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const weekDays = getWeekDays(calWeekStart);
  const calBookings = (allBookings ?? []).filter((b) => {
    const d = new Date(b.appointmentAt);
    return d >= calWeekStart && d < addDays(calWeekStart, 7);
  });

  const calBookingsByDay: Record<number, BookingRow[]> = {};
  for (const b of calBookings) {
    const day = new Date(b.appointmentAt).getDay();
    const idx = day === 0 ? 6 : day - 1;
    if (!calBookingsByDay[idx]) calBookingsByDay[idx] = [];
    calBookingsByDay[idx].push(b);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bookings</h1>
          <p className="text-muted-foreground mt-1">Manage your appointments.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {viewMode === "list" && (
            <>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Bookings</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="arrived">Arrived</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="no_show">No Show</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={staffFilter} onValueChange={setStaffFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All Staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  {activeStaffList.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={handleExportCsv}
                disabled={exporting || !bookings || bookings.length === 0}
              >
                ↓ Export CSV
              </Button>
            </>
          )}

          {viewMode === "calendar" && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCalWeekStart(w => addDays(w, -7))}>‹</Button>
              <span className="text-sm font-medium min-w-[160px] text-center">
                {format(calWeekStart, "MMM d")} – {format(addDays(calWeekStart, 6), "MMM d, yyyy")}
              </span>
              <Button variant="outline" size="sm" onClick={() => setCalWeekStart(w => addDays(w, 7))}>›</Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => setCalWeekStart(getWeekStart(new Date()))}
              >
                Today
              </Button>
            </div>
          )}

          <div className="flex rounded-md border overflow-hidden">
            <button
              className={`px-3 py-1.5 text-sm transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setViewMode("list")}
            >
              ☰ List
            </button>
            <button
              className={`px-3 py-1.5 text-sm border-l transition-colors ${viewMode === "calendar" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setViewMode("calendar")}
            >
              🗓 Calendar
            </button>
            <button
              className={`relative px-3 py-1.5 text-sm border-l transition-colors ${viewMode === "waitlist" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setViewMode("waitlist")}
            >
              ⏳ Waitlist
              {pendingWaitlist.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {pendingWaitlist.length}
                </span>
              )}
            </button>
          </div>

          <Button onClick={() => setShowNewBooking(true)}>+ New Booking</Button>
        </div>
      </div>

      {viewMode === "waitlist" && (
        <div className="border rounded-md bg-card">
          {pendingWaitlist.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <p className="font-medium">No one on the waitlist</p>
              <p className="text-sm mt-1">Clients who join when a slot is fully booked will appear here.</p>
            </div>
          ) : (
            <div className="divide-y">
              {(waitlistData?.entries ?? []).map((entry) => (
                <div key={entry.id} className={`p-4 flex items-start justify-between gap-4 ${entry.notified ? "opacity-50" : ""}`}>
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{entry.clientName}</p>
                      {entry.notified && <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">Notified</span>}
                    </div>
                    <p className="text-sm text-muted-foreground">{entry.clientPhone}</p>
                    <p className="text-sm">{entry.serviceName}{entry.staffName ? ` · ${entry.staffName}` : ""}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(entry.appointmentAt), "EEE, MMM d 'at' h:mm a")}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {!entry.notified && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                        disabled={markWaitlistNotified.isPending}
                        onClick={() => markWaitlistNotified.mutate({ salonId, id: entry.id }, { onSuccess: () => refetchWaitlist() })}
                      >
                        ✓ Mark Notified
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-muted-foreground hover:text-destructive"
                      disabled={removeFromWaitlist.isPending}
                      onClick={() => removeFromWaitlist.mutate({ salonId, id: entry.id }, { onSuccess: () => refetchWaitlist() })}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {viewMode === "list" ? (
        <div className="border rounded-md bg-card">
          {isLoading ? (
            <div className="p-8 space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !bookings || bookings.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No bookings found.</div>
          ) : (
            <div className="divide-y">
              {bookings.map((booking) => {
                const isUpcoming = new Date(booking.appointmentAt) > now;
                const canRemind = isUpcoming && (booking.status === "confirmed" || booking.status === "pending");
                const alreadySent = sentBookingIds.has(booking.id);
                const canNudge = isUpcoming && !booking.depositPaid && booking.status === "pending";
                const canCancel = booking.status === "pending" || booking.status === "confirmed";

                return (
                  <div
                    key={booking.id}
                    className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors gap-4"
                  >
                    <div className="grid grid-cols-4 flex-1 items-center gap-4 min-w-0">
                      <div>
                        <p className="font-medium truncate">{booking.clientName}</p>
                        <p className="text-xs text-muted-foreground">{booking.clientPhone}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium truncate">{booking.serviceName}</p>
                        <button
                          className="text-xs text-muted-foreground hover:text-primary underline-offset-2 hover:underline text-left transition-colors"
                          onClick={(e) => { e.stopPropagation(); setAssigningStaffBooking(booking); }}
                          title="Click to assign or reassign staff"
                        >
                          {booking.staffName || "Assign staff…"}
                        </button>
                      </div>
                      <div>
                        {(booking.status === "pending" || booking.status === "confirmed" || booking.status === "arrived") ? (
                          <button
                            className="text-left group"
                            title="Click to reschedule"
                            onClick={(e) => { e.stopPropagation(); setReschedulingBooking(booking); }}
                          >
                            <p className="text-sm font-medium group-hover:text-primary transition-colors">{format(new Date(booking.appointmentAt), "MMM d, yyyy")}</p>
                            <p className="text-xs text-muted-foreground group-hover:text-primary/70 transition-colors flex items-center gap-1">
                              {format(new Date(booking.appointmentAt), "h:mm a")}
                              <span className="opacity-0 group-hover:opacity-100 text-[10px] text-primary">✎</span>
                            </p>
                          </button>
                        ) : (
                          <>
                            <p className="text-sm font-medium">{format(new Date(booking.appointmentAt), "MMM d, yyyy")}</p>
                            <p className="text-xs text-muted-foreground">{format(new Date(booking.appointmentAt), "h:mm a")}</p>
                          </>
                        )}
                      </div>
                      <div className="flex flex-col items-start gap-1">
                        <Badge
                          variant={
                            booking.status === "completed" ? "default" :
                            booking.status === "no_show" ? "destructive" :
                            booking.status === "cancelled" ? "outline" : "secondary"
                          }
                        >
                          {booking.status.replace("_", " ")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {booking.depositWaived ? (
                            <span className="text-emerald-600">✓ Deposit waived</span>
                          ) : booking.depositPaid ? (
                            <span className="text-emerald-600">✓ Deposit paid</span>
                          ) : booking.status !== "cancelled" ? (
                            <span className="text-amber-600">⏳ Ksh {booking.depositAmount} pending</span>
                          ) : null}
                        </span>
                        {booking.recurringGroupId && <span className="text-xs text-violet-600 font-medium">🔁 Recurring</span>}
                        {alreadySent && <span className="text-xs text-blue-600 font-medium">📱 Reminder sent</span>}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                      {!booking.depositPaid && !booking.depositWaived && booking.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-green-600 text-green-700 hover:bg-green-50 text-xs"
                          disabled={confirmingPayment[booking.id]}
                          onClick={() => handleConfirmPayment(booking.id)}
                        >
                          {confirmingPayment[booking.id] ? "Confirming…" : "✅ Confirm Payment"}
                        </Button>
                      )}
                      {canNudge && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-500 text-amber-700 hover:bg-amber-50 text-xs"
                          disabled={nudgeSending[booking.id]}
                          onClick={() => handleSendNudge(booking.id)}
                        >
                          {nudgeSending[booking.id] ? "Sending…" : "💳 Request Deposit"}
                        </Button>
                      )}
                      {canRemind && !alreadySent && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-green-500 text-green-700 hover:bg-green-50 text-xs"
                          disabled={reminderSending[booking.id]}
                          onClick={() => handleSendReminder(booking.id)}
                        >
                          {reminderSending[booking.id] ? "Sending…" : "📱 Remind"}
                        </Button>
                      )}
                      {booking.status === "confirmed" && (
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => handleStatusUpdate(booking.id, "arrived")}>
                          Check In
                        </Button>
                      )}
                      {booking.status === "arrived" && (
                        <Button size="sm" variant="default" className="text-xs" onClick={() => handleStatusUpdate(booking.id, "completed")}>
                          Complete
                        </Button>
                      )}
                      {(booking.status === "confirmed" || booking.status === "arrived") && (
                        <Button size="sm" variant="destructive" className="text-xs" onClick={() => handleStatusUpdate(booking.id, "no_show")}>
                          No Show
                        </Button>
                      )}
                      {canCancel && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => setCancelTarget(booking)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="border rounded-md bg-card overflow-hidden">
          {/* Day header row */}
          <div className="grid border-b" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
            <div className="border-r" />
            {weekDays.map((day, i) => {
              const isToday = isSameDay(day, new Date());
              return (
                <div
                  key={i}
                  className={`py-3 text-center border-r last:border-r-0 ${isToday ? "bg-primary/5" : ""}`}
                >
                  <p className={`text-xs font-medium uppercase tracking-wide ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {DAY_LABELS[i]}
                  </p>
                  <p className={`text-lg font-semibold leading-tight ${isToday ? "text-primary" : ""}`}>
                    {format(day, "d")}
                  </p>
                  <p className={`text-xs ${isToday ? "text-primary/70" : "text-muted-foreground"}`}>
                    {format(day, "MMM")}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
            <div className="grid" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
              {/* Time labels */}
              <div className="relative" style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}>
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute w-full flex items-start justify-end pr-2"
                    style={{ top: `${(h - DAY_START) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                  >
                    <span className="text-[10px] text-muted-foreground leading-none mt-1">
                      {h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`}
                    </span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((day, colIdx) => {
                const isToday = isSameDay(day, new Date());
                const dayBookings = calBookingsByDay[colIdx] ?? [];

                return (
                  <div
                    key={colIdx}
                    className={`relative border-l ${isToday ? "bg-primary/[0.02]" : ""}`}
                    style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}
                  >
                    {/* Hour grid lines */}
                    {HOURS.map((h) => (
                      <div
                        key={h}
                        className="absolute w-full border-t border-border/50"
                        style={{ top: `${(h - DAY_START) * HOUR_HEIGHT}px` }}
                      />
                    ))}

                    {/* Current time indicator */}
                    {isToday && (() => {
                      const now = new Date();
                      const top = bookingTopPx(now);
                      if (top < 0 || top > HOURS.length * HOUR_HEIGHT) return null;
                      return (
                        <div
                          className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                          style={{ top: `${top}px` }}
                        >
                          <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 flex-shrink-0" />
                          <div className="flex-1 h-px bg-red-500" />
                        </div>
                      );
                    })()}

                    {/* Booking cards */}
                    {dayBookings.map((b) => {
                      const appt = new Date(b.appointmentAt);
                      const top = bookingTopPx(appt);
                      const height = bookingHeightPx(b.durationMinutes);
                      const colorClass = STATUS_COLORS[b.status] ?? STATUS_COLORS.pending;

                      if (top < 0 || top > HOURS.length * HOUR_HEIGHT) return null;

                      return (
                        <button
                          key={b.id}
                          className={`absolute left-0.5 right-0.5 rounded border-l-2 px-1.5 py-0.5 text-left overflow-hidden z-10 hover:brightness-95 transition-all cursor-pointer ${colorClass}`}
                          style={{ top: `${top}px`, height: `${height}px` }}
                          onClick={() => setCalDetailBooking(b)}
                        >
                          <p className="text-[11px] font-semibold leading-tight truncate">{b.clientName}</p>
                          {height >= 44 && (
                            <p className="text-[10px] leading-tight truncate opacity-80">{b.serviceName}</p>
                          )}
                          {height >= 56 && (
                            <p className="text-[10px] leading-tight truncate opacity-70">{format(appt, "h:mm a")}{b.staffName ? ` · ${b.staffName}` : ""}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Calendar booking detail dialog */}
      {calDetailBooking && (
        <CalendarBookingDialog
          booking={calDetailBooking}
          salonId={salonId}
          sentBookingIds={sentBookingIds}
          reminderSending={reminderSending}
          nudgeSending={nudgeSending}
          onSendReminder={handleSendReminder}
          onSendNudge={handleSendNudge}
          onStatusUpdate={handleStatusUpdate}
          onCancel={(b) => { setCalDetailBooking(null); setCancelTarget(b); }}
          onClose={() => setCalDetailBooking(null)}
        />
      )}

      {/* New Booking Dialog */}
      <NewBookingDialog
        salonId={salonId}
        open={showNewBooking}
        onClose={() => setShowNewBooking(false)}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
          setShowNewBooking(false);
        }}
      />

      {/* Cancel Booking Dialog */}
      {cancelTarget && (
        <CancelBookingDialog
          booking={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelled={() => {
            setCancelTarget(null);
            queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
          }}
        />
      )}

      {/* Staff Assign Dialog */}
      {assigningStaffBooking && (
        <StaffAssignDialog
          booking={assigningStaffBooking}
          salonId={salonId}
          onClose={() => setAssigningStaffBooking(null)}
          onAssigned={() => {
            setAssigningStaffBooking(null);
            queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
          }}
        />
      )}

      {/* Reschedule Dialog */}
      {reschedulingBooking && (
        <RescheduleDialog
          booking={reschedulingBooking}
          onClose={() => setReschedulingBooking(null)}
          onRescheduled={() => {
            setReschedulingBooking(null);
            queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
          }}
        />
      )}

      {/* Deposit Nudge Preview */}
      <Dialog open={!!nudgeResult} onOpenChange={(o) => !o && setNudgeResult(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>💳 Deposit Request Sent</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              WhatsApp message sent · Ref:{" "}
              <span className="font-mono text-xs">{nudgeResult?.waId}</span>
            </p>
            <div className="bg-[#dcf8c6] dark:bg-emerald-900/20 rounded-xl p-4 text-sm whitespace-pre-wrap font-sans leading-relaxed border border-emerald-200 dark:border-emerald-800">
              {nudgeResult?.message}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNudgeResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CalendarBookingDialog({
  booking,
  salonId,
  sentBookingIds,
  reminderSending,
  nudgeSending,
  onSendReminder,
  onSendNudge,
  onStatusUpdate,
  onCancel,
  onClose,
}: {
  booking: BookingRow;
  salonId: number;
  sentBookingIds: Set<number>;
  reminderSending: Record<number, boolean>;
  nudgeSending: Record<number, boolean>;
  onSendReminder: (id: number) => void;
  onSendNudge: (id: number) => void;
  onStatusUpdate: (id: number, status: string) => void;
  onCancel: (b: BookingRow) => void;
  onClose: () => void;
}) {
  const [showReassign, setShowReassign] = useState(false);
  const [reassignStaffId, setReassignStaffId] = useState<string>(booking.staffId ? String(booking.staffId) : "");
  const { data: staffData } = useListStaff(salonId, { query: { queryKey: getListStaffQueryKey(salonId) } });
  const calActiveStaff = (staffData ?? []).filter(s => s.isActive);
  const assignStaff = useAssignBookingStaff();
  const qc = useQueryClient();

  const handleReassign = () => {
    assignStaff.mutate(
      { id: booking.id, data: { staffId: reassignStaffId ? Number(reassignStaffId) : null } },
      { onSuccess: () => { qc.invalidateQueries({ queryKey: getListBookingsQueryKey() }); setShowReassign(false); onClose(); } }
    );
  };

  const now = new Date();
  const appt = new Date(booking.appointmentAt);
  const isUpcoming = appt > now;
  const canRemind = isUpcoming && (booking.status === "confirmed" || booking.status === "pending");
  const alreadySent = sentBookingIds.has(booking.id);
  const canNudge = isUpcoming && !booking.depositPaid && booking.status === "pending";
  const canCancel = booking.status === "pending" || booking.status === "confirmed";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Booking Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-2 text-sm">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-base">{booking.clientName}</p>
                <p className="text-muted-foreground">{booking.clientPhone}</p>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${STATUS_COLORS[booking.status] ?? ""}`}>
                {booking.status.replace("_", " ")}
              </span>
            </div>
            <div className="pt-1 space-y-1">
              <p className="font-medium">{booking.serviceName}</p>
              {!showReassign ? (
                <div className="flex items-center gap-2">
                  <p className="text-muted-foreground text-sm">{booking.staffName ? `with ${booking.staffName}` : "No stylist assigned"}</p>
                  <button className="text-xs text-primary hover:underline" onClick={() => setShowReassign(true)}>Change</button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-1">
                  <Select value={reassignStaffId} onValueChange={setReassignStaffId}>
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue placeholder="Any available" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any available</SelectItem>
                      {calActiveStaff.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name} · {s.role}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-7 text-xs px-2" onClick={handleReassign} disabled={assignStaff.isPending}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setShowReassign(false)}>✕</Button>
                </div>
              )}
              <p className="text-muted-foreground">{format(appt, "EEEE, MMM d")} at {format(appt, "h:mm a")}</p>
              {booking.durationMinutes && <p className="text-muted-foreground">{booking.durationMinutes} min</p>}
            </div>
            <div className="pt-1">
              {booking.depositWaived ? (
                <span className="text-emerald-600 text-xs font-medium">✓ Deposit waived</span>
              ) : booking.depositPaid ? (
                <span className="text-emerald-600 text-xs font-medium">✓ Deposit paid · Ksh {booking.depositAmount.toLocaleString()}</span>
              ) : (
                <span className="text-amber-600 text-xs font-medium">⏳ Deposit pending · Ksh {booking.depositAmount.toLocaleString()}</span>
              )}
            </div>
            {booking.notes && <p className="text-muted-foreground italic text-xs border-t pt-2">{booking.notes}</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            {canNudge && (
              <Button size="sm" variant="outline" className="border-amber-500 text-amber-700 hover:bg-amber-50 text-xs" disabled={nudgeSending[booking.id]} onClick={() => onSendNudge(booking.id)}>
                {nudgeSending[booking.id] ? "Sending…" : "💳 Request Deposit"}
              </Button>
            )}
            {canRemind && !alreadySent && (
              <Button size="sm" variant="outline" className="border-green-500 text-green-700 hover:bg-green-50 text-xs" disabled={reminderSending[booking.id]} onClick={() => onSendReminder(booking.id)}>
                {reminderSending[booking.id] ? "Sending…" : "📱 Remind"}
              </Button>
            )}
            {alreadySent && <span className="text-xs text-blue-600 font-medium self-center">📱 Reminder sent</span>}
            {booking.status === "confirmed" && (
              <Button size="sm" variant="outline" className="text-xs" onClick={() => onStatusUpdate(booking.id, "arrived")}>Check In</Button>
            )}
            {booking.status === "arrived" && (
              <Button size="sm" variant="default" className="text-xs" onClick={() => onStatusUpdate(booking.id, "completed")}>Complete</Button>
            )}
            {(booking.status === "confirmed" || booking.status === "arrived") && (
              <Button size="sm" variant="destructive" className="text-xs" onClick={() => onStatusUpdate(booking.id, "no_show")}>No Show</Button>
            )}
            {canCancel && (
              <Button size="sm" variant="ghost" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => onCancel(booking)}>Cancel</Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelBookingDialog({
  booking,
  onClose,
  onCancelled,
}: {
  booking: BookingRow;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{
    refundEligible: boolean;
    message: string;
    waitlistedClients: WaitlistEntry[];
    autoPromoted: boolean;
    autoPromotedClientName: string | null;
    autoPromotedPhone: string | null;
    autoPromotedMessage: string | null;
  } | null>(null);
  const cancelBooking = useCancelBooking();

  const handleConfirm = () => {
    cancelBooking.mutate(
      { id: booking.id, data: { reason: reason || null } },
      {
        onSuccess: (data) => {
          setResult({
            refundEligible: data.refundEligible,
            message: data.message,
            waitlistedClients: data.waitlistedClients,
            autoPromoted: data.autoPromoted,
            autoPromotedClientName: data.autoPromotedClientName ?? null,
            autoPromotedPhone: data.autoPromotedPhone ?? null,
            autoPromotedMessage: data.autoPromotedMessage ?? null,
          });
          onCancelled();
        },
        onError: () => {
          setResult({ refundEligible: false, message: "Failed to cancel booking. Please try again.", waitlistedClients: [], autoPromoted: false, autoPromotedClientName: null, autoPromotedPhone: null, autoPromotedMessage: null });
        },
      },
    );
  };

  const apptDate = new Date(booking.appointmentAt);
  const hoursUntil = (apptDate.getTime() - Date.now()) / (1000 * 60 * 60);
  const likelyRefund = hoursUntil >= 24;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {result.refundEligible ? "✅ Booking Cancelled — Refund Issued" : "Booking Cancelled"}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{result.message}</p>

            {result.autoPromoted && result.autoPromotedClientName && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
                    📲 Waitlist auto-notified
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{result.autoPromotedClientName}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{result.autoPromotedPhone}</span>
                  </div>
                  <span className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-medium">WhatsApp sent</span>
                </div>
                {result.autoPromotedMessage && (
                  <div className="bg-[#dcf8c6] dark:bg-emerald-900/30 rounded-xl p-3 text-xs whitespace-pre-wrap font-sans leading-relaxed border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100">
                    {result.autoPromotedMessage}
                  </div>
                )}
              </div>
            )}

            {result.waitlistedClients.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 space-y-2">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  ⏳ {result.waitlistedClients.length} more client{result.waitlistedClients.length > 1 ? "s" : ""} on the waitlist
                </p>
                {result.waitlistedClients.map(wl => (
                  <div key={wl.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">{wl.clientName}</span>
                      <span className="text-muted-foreground ml-2">{wl.clientPhone}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Cancel Booking</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-1 text-sm">
                <p className="font-semibold">{booking.clientName}</p>
                <p className="text-muted-foreground">
                  {booking.serviceName} · {format(apptDate, "EEE, MMM d")} at {format(apptDate, "h:mm a")}
                </p>
                {(booking.depositPaid || booking.depositWaived) && (
                  <p className="text-muted-foreground">
                    {booking.depositWaived
                      ? <span className="text-emerald-600 font-medium">Deposit waived</span>
                      : <>Deposit paid: <span className="font-medium text-foreground">Ksh {booking.depositAmount.toLocaleString()}</span></>}
                  </p>
                )}
              </div>
              {booking.depositPaid && !booking.depositWaived && (
                <div className={`rounded-lg p-3 text-sm border ${likelyRefund ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300" : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300"}`}>
                  {likelyRefund
                    ? `✅ More than 24 hours away — deposit of Ksh ${booking.depositAmount.toLocaleString()} will be refunded via M-Pesa.`
                    : `⚠️ Less than 24 hours away — deposit of Ksh ${booking.depositAmount.toLocaleString()} will be forfeited per cancellation policy.`}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="cancel-reason">Reason (optional)</Label>
                <Textarea
                  id="cancel-reason"
                  rows={2}
                  placeholder="e.g. Client requested cancellation"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Keep Booking</Button>
              <Button variant="destructive" disabled={cancelBooking.isPending} onClick={handleConfirm}>
                {cancelBooking.isPending ? "Cancelling…" : "Confirm Cancel"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewBookingDialog({
  salonId,
  open,
  onClose,
  onCreated,
}: {
  salonId: number;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { data: services } = useListServices(salonId, {
    query: { queryKey: getListServicesQueryKey(salonId) },
  });
  const { data: staff } = useListStaff(salonId, {
    query: { queryKey: getListStaffQueryKey(salonId) },
  });
  const createBooking = useCreateBooking();

  const today = new Date();
  const defaultDate = format(today, "yyyy-MM-dd");
  const defaultTime = "10:00";

  const [form, setForm] = useState({
    clientName: "",
    clientPhone: "",
    serviceId: "",
    staffId: "",
    date: defaultDate,
    time: defaultTime,
    notes: "",
    depositWaived: false,
    recurrenceRule: "" as "" | "weekly" | "biweekly" | "monthly",
    recurrenceCount: "4",
  });
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const activeServices = (services ?? []).filter((s) => s.isActive);
  const activeStaff = (staff ?? []).filter((s) => s.isActive);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.serviceId) {
      setError("Please select a service.");
      return;
    }
    const appointmentAt = new Date(`${form.date}T${form.time}:00`);
    if (isNaN(appointmentAt.getTime()) || appointmentAt < new Date()) {
      setError("Please choose a future date and time.");
      return;
    }
    createBooking.mutate(
      {
        data: {
          salonId,
          serviceId: Number(form.serviceId),
          staffId: form.staffId ? Number(form.staffId) : null,
          clientName: form.clientName,
          clientPhone: form.clientPhone,
          appointmentAt: appointmentAt.toISOString() as unknown as Date,
          notes: form.notes || null,
          depositWaived: form.depositWaived,
          recurrenceRule: form.recurrenceRule || undefined,
          recurrenceCount: form.recurrenceRule ? Number(form.recurrenceCount) : undefined,
        },
      },
      {
        onSuccess: (data) => {
          const total = 1 + (data.additionalBookings?.length ?? 0);
          setForm({ clientName: "", clientPhone: "", serviceId: "", staffId: "", date: defaultDate, time: defaultTime, notes: "", depositWaived: false, recurrenceRule: "", recurrenceCount: "4" });
          onCreated();
          if (total > 1) {
            toast({
              title: `${total} recurring appointments created`,
              description: `${form.clientName}'s ${form.recurrenceRule} series has been scheduled.`,
            });
          }
        },
        onError: (err: any) => {
          const serverError = err?.response?.data?.error;
          const serverMsg = err?.response?.data?.message;
          if (serverError === "STAFF_CONFLICT") {
            setError(serverMsg ?? "That staff member is already booked at this time. Please choose a different time.");
          } else {
            setError(err?.message ?? "Failed to create booking.");
          }
        },
      },
    );
  };

  const selectedService = activeServices.find((s) => s.id === Number(form.serviceId));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Booking</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="nb-name">Client Name</Label>
              <Input id="nb-name" required placeholder="Grace Wanjiru" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-phone">Phone (M-Pesa)</Label>
              <Input id="nb-phone" required placeholder="07XX XXX XXX" value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Service</Label>
            <Select value={form.serviceId} onValueChange={(v) => setForm({ ...form, serviceId: v })}>
              <SelectTrigger><SelectValue placeholder="Select service…" /></SelectTrigger>
              <SelectContent>
                {activeServices.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name} — Ksh {s.price.toLocaleString()} ({s.durationMinutes}min)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Staff (Optional)</Label>
            <Select value={form.staffId} onValueChange={(v) => setForm({ ...form, staffId: v })}>
              <SelectTrigger><SelectValue placeholder="Any available" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any available</SelectItem>
                {activeStaff.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name} · {s.role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="nb-date">Date</Label>
              <Input id="nb-date" type="date" required min={defaultDate} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-time">Time</Label>
              <Input id="nb-time" type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nb-notes">Notes (Optional)</Label>
            <Textarea id="nb-notes" rows={2} placeholder="Any special requests or notes…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Repeat</Label>
              <Select value={form.recurrenceRule} onValueChange={(v) => setForm({ ...form, recurrenceRule: v as typeof form.recurrenceRule })}>
                <SelectTrigger className="w-[160px] h-8 text-sm">
                  <SelectValue placeholder="No repeat" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No repeat</SelectItem>
                  <SelectItem value="weekly">Every week</SelectItem>
                  <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                  <SelectItem value="monthly">Every month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.recurrenceRule && (
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Number of appointments</Label>
                <Select value={form.recurrenceCount} onValueChange={(v) => setForm({ ...form, recurrenceCount: v })}>
                  <SelectTrigger className="w-[100px] h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2,3,4,6,8,10,12].map(n => (
                      <SelectItem key={n} value={String(n)}>{n} appts</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.recurrenceRule && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                🔁 Will create <strong>{form.recurrenceCount} appointments</strong> starting {format(new Date(`${form.date}T${form.time}:00`), "MMM d")} — one {form.recurrenceRule === "weekly" ? "every week" : form.recurrenceRule === "biweekly" ? "every 2 weeks" : "every month"}
              </p>
            )}
          </div>

          {selectedService && (
            <div className={`rounded-lg border p-3 text-sm space-y-2 ${form.depositWaived ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">Deposit: </span>
                  {form.depositWaived ? (
                    <span className="line-through text-muted-foreground">Ksh {selectedService.depositAmount.toLocaleString()}</span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400 font-bold">Ksh {selectedService.depositAmount.toLocaleString()}</span>
                  )}
                  {form.depositWaived && <span className="ml-2 text-emerald-700 dark:text-emerald-400 font-semibold">Waived — booking confirmed immediately</span>}
                  {!form.depositWaived && <span className="text-muted-foreground"> (client will be sent an M-Pesa request)</span>}
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, depositWaived: !form.depositWaived })}
                  className={`text-xs font-medium px-2 py-1 rounded border transition-colors ${form.depositWaived ? "border-emerald-400 text-emerald-700 bg-emerald-100 hover:bg-emerald-200" : "border-muted-foreground/30 text-muted-foreground hover:bg-muted"}`}
                >
                  {form.depositWaived ? "Require deposit" : "Waive deposit"}
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createBooking.isPending}>
              {createBooking.isPending ? "Creating…" : "Create Booking"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StaffAssignDialog({
  booking,
  salonId,
  onClose,
  onAssigned,
}: {
  booking: BookingRow;
  salonId: number;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [selectedStaffId, setSelectedStaffId] = useState<string>(booking.staffId ? String(booking.staffId) : "");
  const { data: staff } = useListStaff(salonId, { query: { queryKey: getListStaffQueryKey(salonId) } });
  const activeStaff = (staff ?? []).filter(s => s.isActive);
  const assignStaff = useAssignBookingStaff();

  const handleSave = () => {
    assignStaff.mutate(
      { id: booking.id, data: { staffId: selectedStaffId ? Number(selectedStaffId) : null } },
      { onSuccess: onAssigned }
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign Staff</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border p-3 text-sm bg-muted/40">
            <p className="font-medium">{booking.clientName}</p>
            <p className="text-muted-foreground">{booking.serviceName} · {format(new Date(booking.appointmentAt), "MMM d, h:mm a")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Staff Member</Label>
            <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
              <SelectTrigger>
                <SelectValue placeholder="Any available" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any available</SelectItem>
                {activeStaff.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name} · {s.role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={assignStaff.isPending}>
            {assignStaff.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RescheduleDialog({
  booking,
  onClose,
  onRescheduled,
}: {
  booking: BookingRow;
  onClose: () => void;
  onRescheduled: () => void;
}) {
  const appt = new Date(booking.appointmentAt);
  const [dateVal, setDateVal] = useState(() => format(appt, "yyyy-MM-dd"));
  const [timeVal, setTimeVal] = useState(() => format(appt, "HH:mm"));
  const reschedule = useRescheduleBooking();

  const handleSave = () => {
    const appointmentAt = new Date(`${dateVal}T${timeVal}:00`).toISOString();
    reschedule.mutate(
      { id: booking.id, data: { appointmentAt } },
      { onSuccess: onRescheduled }
    );
  };

  const isUnchanged = dateVal === format(appt, "yyyy-MM-dd") && timeVal === format(appt, "HH:mm");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reschedule Booking</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border p-3 text-sm bg-muted/40">
            <p className="font-medium">{booking.clientName}</p>
            <p className="text-muted-foreground">{booking.serviceName}{booking.staffName ? ` · ${booking.staffName}` : ""}</p>
            <p className="text-muted-foreground mt-0.5">Currently: {format(appt, "EEE, MMM d yyyy 'at' h:mm a")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-date">New Date</Label>
              <Input
                id="reschedule-date"
                type="date"
                value={dateVal}
                min={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => setDateVal(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-time">New Time</Label>
              <Input
                id="reschedule-time"
                type="time"
                value={timeVal}
                onChange={(e) => setTimeVal(e.target.value)}
              />
            </div>
          </div>
          {!isUnchanged && (
            <p className="text-xs text-primary font-medium">
              Moving to: {format(new Date(`${dateVal}T${timeVal}:00`), "EEE, MMM d 'at' h:mm a")}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={reschedule.isPending || isUnchanged || !dateVal || !timeVal}>
            {reschedule.isPending ? "Saving…" : "Confirm Reschedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
