import {
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
  useGetRecentActivity,
  getGetRecentActivityQueryKey,
  useListReminders,
  getListRemindersQueryKey,
  useProcessReminders,
  useListBookings,
  getListBookingsQueryKey,
  useSendBookingReminder,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function Dashboard() {
  const salonId = 1;
  const queryClient = useQueryClient();
  const [processingAll, setProcessingAll] = useState(false);
  const [processResult, setProcessResult] = useState<{ sent: number } | null>(null);
  const [reminderSending, setReminderSending] = useState<Record<number, boolean>>({});
  const [reminderJustSent, setReminderJustSent] = useState<Set<number>>(new Set());

  const { data: summary, isLoading, error } = useGetDashboardSummary(salonId, {
    query: { queryKey: getGetDashboardSummaryQueryKey(salonId) },
  });

  const { data: activity } = useGetRecentActivity(salonId, { limit: 10 }, {
    query: { queryKey: getGetRecentActivityQueryKey(salonId, { limit: 10 }) },
  });

  const { data: reminders } = useListReminders(salonId, {
    query: { queryKey: getListRemindersQueryKey(salonId) },
  });

  const { data: allBookings } = useListBookings({ salonId }, {
    query: { queryKey: [...getListBookingsQueryKey(), { salonId }] },
  });

  const processReminders = useProcessReminders();
  const sendReminder = useSendBookingReminder();

  const now = new Date();
  const sentBookingIds = new Set([
    ...(reminders?.map((r) => r.bookingId) ?? []),
    ...Array.from(reminderJustSent),
  ]);

  const reminderQueue = (allBookings ?? []).filter((b) => {
    if (b.status !== "confirmed" && b.status !== "pending") return false;
    const appt = new Date(b.appointmentAt);
    const hoursUntil = (appt.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntil > 0 && hoursUntil <= 25 && !sentBookingIds.has(b.id);
  });

  const handleProcessAll = () => {
    setProcessingAll(true);
    setProcessResult(null);
    processReminders.mutate(
      { salonId },
      {
        onSuccess: (data) => {
          setProcessingAll(false);
          setProcessResult({ sent: data.sent });
          data.reminders.forEach((r) => {
            setReminderJustSent((prev) => new Set([...prev, r.bookingId]));
          });
          queryClient.invalidateQueries({ queryKey: getListRemindersQueryKey(salonId) });
        },
        onError: () => setProcessingAll(false),
      },
    );
  };

  const handleSendOne = (bookingId: number) => {
    setReminderSending((p) => ({ ...p, [bookingId]: true }));
    sendReminder.mutate(
      { id: bookingId, data: { type: "manual" } },
      {
        onSuccess: () => {
          setReminderSending((p) => ({ ...p, [bookingId]: false }));
          setReminderJustSent((prev) => new Set([...prev, bookingId]));
          queryClient.invalidateQueries({ queryKey: getListRemindersQueryKey(salonId) });
        },
        onError: () => setReminderSending((p) => ({ ...p, [bookingId]: false })),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return <div className="text-red-500">Failed to load dashboard</div>;
  }

  const todayReminders = (reminders ?? []).filter((r) => {
    const d = new Date(r.sentAt);
    return d.toDateString() === now.toDateString();
  }).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Today's Overview</h1>
        <p className="text-muted-foreground mt-1">Here is what's happening at your salon today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.todayBookings}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">Ksh {summary.todayRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Deposits Held</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">Ksh {summary.depositsHeld.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">No-Show Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{summary.noShowRate}%</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Appointments</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.upcomingBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming bookings today.</p>
            ) : (
              <div className="space-y-4">
                {summary.upcomingBookings.map((booking) => (
                  <div key={booking.id} className="flex justify-between items-center p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{booking.clientName}</p>
                      <p className="text-sm text-muted-foreground">{booking.serviceName} • {booking.staffName}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{format(new Date(booking.appointmentAt), "h:mm a")}</p>
                      <p className="text-xs text-muted-foreground">{booking.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {!activity || activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity.</p>
            ) : (
              <div className="space-y-4">
                {activity.map((item) => (
                  <div key={item.id} className="flex justify-between items-start border-b pb-3 last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium text-sm">
                        {item.type === "booking_created" && "New Booking"}
                        {item.type === "booking_confirmed" && "Booking Confirmed"}
                        {item.type === "booking_completed" && "Booking Completed"}
                        {item.type === "booking_cancelled" && "Booking Cancelled"}
                        {item.type === "no_show" && <span className="text-destructive">No-Show</span>}
                        {item.type === "deposit_received" && <span className="text-emerald-600">Deposit Received</span>}
                        {item.type === "refund_issued" && "Refund Issued"}
                        {item.type === "reminder_sent" && <span className="text-blue-600">📱 Reminder Sent</span>}
                        {item.type === "deposit_nudge_sent" && <span className="text-amber-600">💳 Deposit Request Sent</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{item.clientName} • {item.serviceName}</p>
                    </div>
                    <div className="text-right">
                      {item.amount && <p className="text-sm font-semibold">Ksh {item.amount}</p>}
                      <p className="text-[10px] text-muted-foreground">{format(new Date(item.occurredAt), "h:mm a")}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* WhatsApp Reminder Queue */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                📱 WhatsApp Reminder Queue
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {reminderQueue.length > 0
                  ? `${reminderQueue.length} booking${reminderQueue.length === 1 ? "" : "s"} due for a reminder in the next 25 hours`
                  : "No reminders due right now"}
                {todayReminders > 0 && ` · ${todayReminders} sent today`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {processResult && (
                <span className="text-sm text-emerald-600 font-medium">
                  ✓ {processResult.sent} reminder{processResult.sent !== 1 ? "s" : ""} sent
                </span>
              )}
              <Button
                variant="default"
                size="sm"
                disabled={processingAll || reminderQueue.length === 0}
                onClick={handleProcessAll}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {processingAll ? (
                  <>
                    <span className="animate-spin mr-1.5">⏳</span> Processing…
                  </>
                ) : (
                  <>⚡ Process All ({reminderQueue.length})</>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {reminderQueue.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              {sentBookingIds.size > 0
                ? "All upcoming bookings have reminders sent. ✅"
                : "No confirmed bookings due for reminders in the next 25 hours."}
            </div>
          ) : (
            <div className="divide-y">
              {reminderQueue.map((booking) => {
                const appt = new Date(booking.appointmentAt);
                const hoursUntil = (appt.getTime() - now.getTime()) / (1000 * 60 * 60);
                const isSending = reminderSending[booking.id];

                return (
                  <div key={booking.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{booking.clientName}</p>
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          in {Math.round(hoursUntil)}h
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {booking.serviceName} • {format(appt, "EEE, MMM d")} at {format(appt, "h:mm a")}
                      </p>
                      <p className="text-xs text-muted-foreground">{booking.clientPhone}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-green-500 text-green-700 hover:bg-green-50"
                      disabled={isSending}
                      onClick={() => handleSendOne(booking.id)}
                    >
                      {isSending ? "Sending…" : "📱 Send"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
