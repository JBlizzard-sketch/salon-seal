import {
  useListBookings,
  getListBookingsQueryKey,
  useUpdateBookingStatus,
  useSendBookingReminder,
  useListReminders,
  getListRemindersQueryKey,
  useSendDepositNudge,
  useCreateBooking,
  useCancelBooking,
  useListServices,
  getListServicesQueryKey,
  useListStaff,
  getListStaffQueryKey,
} from "@workspace/api-client-react";
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
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
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
  const queryClient = useQueryClient();

  const { data: bookings, isLoading } = useListBookings(
    { salonId, status: statusFilter === "all" ? undefined : statusFilter },
    { query: { queryKey: [...getListBookingsQueryKey(), { salonId, statusFilter }] } },
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

  const handleStatusUpdate = (id: number, status: string) => {
    updateStatus.mutate(
      { id, data: { status: status as "arrived" | "completed" | "no_show" | "cancelled" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
          setCalDetailBooking(null);
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
          </div>

          <Button onClick={() => setShowNewBooking(true)}>+ New Booking</Button>
        </div>
      </div>

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
                        <p className="text-xs text-muted-foreground">{booking.staffName || "No staff"}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{format(new Date(booking.appointmentAt), "MMM d, yyyy")}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(booking.appointmentAt), "h:mm a")}</p>
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
                          {booking.depositPaid ? (
                            <span className="text-emerald-600">✓ Deposit paid</span>
                          ) : booking.status !== "cancelled" ? (
                            <span className="text-amber-600">⏳ Ksh {booking.depositAmount} pending</span>
                          ) : null}
                        </span>
                        {alreadySent && <span className="text-xs text-blue-600 font-medium">📱 Reminder sent</span>}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
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
  sentBookingIds: Set<number>;
  reminderSending: Record<number, boolean>;
  nudgeSending: Record<number, boolean>;
  onSendReminder: (id: number) => void;
  onSendNudge: (id: number) => void;
  onStatusUpdate: (id: number, status: string) => void;
  onCancel: (b: BookingRow) => void;
  onClose: () => void;
}) {
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
            <div className="pt-1 space-y-0.5">
              <p className="font-medium">{booking.serviceName}</p>
              {booking.staffName && <p className="text-muted-foreground">with {booking.staffName}</p>}
              <p className="text-muted-foreground">{format(appt, "EEEE, MMM d")} at {format(appt, "h:mm a")}</p>
              {booking.durationMinutes && <p className="text-muted-foreground">{booking.durationMinutes} min</p>}
            </div>
            <div className="pt-1">
              {booking.depositPaid ? (
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
  const [result, setResult] = useState<{ refundEligible: boolean; message: string } | null>(null);
  const cancelBooking = useCancelBooking();

  const handleConfirm = () => {
    cancelBooking.mutate(
      { id: booking.id, data: { reason: reason || null } },
      {
        onSuccess: (data) => {
          setResult({ refundEligible: data.refundEligible, message: data.message });
          onCancelled();
        },
        onError: () => {
          setResult({ refundEligible: false, message: "Failed to cancel booking. Please try again." });
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
                {booking.depositPaid && (
                  <p className="text-muted-foreground">
                    Deposit paid: <span className="font-medium text-foreground">Ksh {booking.depositAmount.toLocaleString()}</span>
                  </p>
                )}
              </div>
              {booking.depositPaid && (
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
  });
  const [error, setError] = useState<string | null>(null);

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
        },
      },
      {
        onSuccess: () => {
          setForm({ clientName: "", clientPhone: "", serviceId: "", staffId: "", date: defaultDate, time: defaultTime, notes: "" });
          onCreated();
        },
        onError: (err: any) => setError(err?.message ?? "Failed to create booking."),
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

          {selectedService && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm">
              <span className="font-medium">Deposit required: </span>
              <span className="text-amber-700 dark:text-amber-400 font-bold">Ksh {selectedService.depositAmount.toLocaleString()}</span>
              <span className="text-muted-foreground"> (client will be sent an M-Pesa request)</span>
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
