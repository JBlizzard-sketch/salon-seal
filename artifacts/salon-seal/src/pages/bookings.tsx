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
import { format } from "date-fns";
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
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

type BookingRow = NonNullable<ReturnType<typeof useListBookings>["data"]>[number];

export default function Bookings() {
  const salonId = 1;
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [reminderSending, setReminderSending] = useState<Record<number, boolean>>({});
  const [reminderSent, setReminderSent] = useState<Record<number, boolean>>({});
  const [nudgeSending, setNudgeSending] = useState<Record<number, boolean>>({});
  const [nudgeResult, setNudgeResult] = useState<{ id: number; message: string; waId: string } | null>(null);
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const queryClient = useQueryClient();

  const { data: bookings, isLoading } = useListBookings(
    { salonId, status: statusFilter === "all" ? undefined : statusFilter },
    { query: { queryKey: [...getListBookingsQueryKey(), { salonId, statusFilter }] } },
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
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() }) },
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bookings</h1>
          <p className="text-muted-foreground mt-1">Manage your appointments.</p>
        </div>
        <div className="flex items-center gap-3">
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
          <Button onClick={() => setShowNewBooking(true)}>+ New Booking</Button>
        </div>
      </div>

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
              const canRemind =
                isUpcoming && (booking.status === "confirmed" || booking.status === "pending");
              const alreadySent = sentBookingIds.has(booking.id);
              const canNudge =
                isUpcoming && !booking.depositPaid && booking.status === "pending";
              const canCancel =
                booking.status === "pending" || booking.status === "confirmed";

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
                      <p className="text-xs text-muted-foreground">
                        {booking.staffName || "No staff"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {format(new Date(booking.appointmentAt), "MMM d, yyyy")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(booking.appointmentAt), "h:mm a")}
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-1">
                      <Badge
                        variant={
                          booking.status === "completed"
                            ? "default"
                            : booking.status === "no_show"
                              ? "destructive"
                              : booking.status === "cancelled"
                                ? "outline"
                                : "secondary"
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
                      {alreadySent && (
                        <span className="text-xs text-blue-600 font-medium">📱 Reminder sent</span>
                      )}
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
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => handleStatusUpdate(booking.id, "arrived")}
                      >
                        Check In
                      </Button>
                    )}
                    {booking.status === "arrived" && (
                      <Button
                        size="sm"
                        variant="default"
                        className="text-xs"
                        onClick={() => handleStatusUpdate(booking.id, "completed")}
                      >
                        Complete
                      </Button>
                    )}
                    {(booking.status === "confirmed" || booking.status === "arrived") && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-xs"
                        onClick={() => handleStatusUpdate(booking.id, "no_show")}
                      >
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
              <Button
                variant="destructive"
                disabled={cancelBooking.isPending}
                onClick={handleConfirm}
              >
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
          setForm({
            clientName: "",
            clientPhone: "",
            serviceId: "",
            staffId: "",
            date: defaultDate,
            time: defaultTime,
            notes: "",
          });
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
              <Input
                id="nb-name"
                required
                placeholder="Grace Wanjiru"
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-phone">Phone (M-Pesa)</Label>
              <Input
                id="nb-phone"
                required
                placeholder="07XX XXX XXX"
                value={form.clientPhone}
                onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Service</Label>
            <Select
              value={form.serviceId}
              onValueChange={(v) => setForm({ ...form, serviceId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select service…" />
              </SelectTrigger>
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
            <Select
              value={form.staffId}
              onValueChange={(v) => setForm({ ...form, staffId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Any available" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any available</SelectItem>
                {activeStaff.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name} · {s.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="nb-date">Date</Label>
              <Input
                id="nb-date"
                type="date"
                required
                min={defaultDate}
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-time">Time</Label>
              <Input
                id="nb-time"
                type="time"
                required
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nb-notes">Notes (Optional)</Label>
            <Textarea
              id="nb-notes"
              rows={2}
              placeholder="Any special requests or notes…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          {selectedService && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm">
              <span className="font-medium">Deposit required: </span>
              <span className="text-amber-700 dark:text-amber-400 font-bold">
                Ksh {selectedService.depositAmount.toLocaleString()}
              </span>
              <span className="text-muted-foreground">
                {" "}(client will be sent an M-Pesa request)
              </span>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createBooking.isPending}>
              {createBooking.isPending ? "Creating…" : "Create Booking"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
