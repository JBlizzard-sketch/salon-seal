import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  useListReminders,
  getListRemindersQueryKey,
  useListBookings,
  getListBookingsQueryKey,
  useSendBookingReminder,
  useProcessReminders,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, RefreshCw, Send, Clock, CheckCircle2, AlertCircle } from "lucide-react";

const salonId = 1;

function typeBadge(type: "24h" | "2h" | "manual") {
  if (type === "24h")
    return <Badge variant="outline" className="text-blue-600 border-blue-300">24h</Badge>;
  if (type === "2h")
    return <Badge variant="outline" className="text-amber-600 border-amber-300">2h</Badge>;
  return <Badge variant="outline" className="text-purple-600 border-purple-300">Manual</Badge>;
}

function statusBadge(status: "sent" | "failed") {
  if (status === "sent")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
        <CheckCircle2 className="w-3 h-3" /> Sent
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium">
      <AlertCircle className="w-3 h-3" /> Failed
    </span>
  );
}

export default function Reminders() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [processingAll, setProcessingAll] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: reminders, isLoading: remindersLoading } = useListReminders(salonId, {
    query: { queryKey: getListRemindersQueryKey(salonId) },
  });

  const { data: upcomingBookings, isLoading: bookingsLoading } = useListBookings(
    { salonId, status: "confirmed" },
    { query: { queryKey: [...getListBookingsQueryKey({ salonId, status: "confirmed" })] } },
  );

  const processReminders = useProcessReminders();
  const sendReminder = useSendBookingReminder();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListRemindersQueryKey(salonId) });
    queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey({ salonId, status: "confirmed" }) });
  };

  const handleProcessAll = () => {
    setProcessingAll(true);
    processReminders.mutate(
      { salonId },
      {
        onSuccess: (data) => {
          setProcessingAll(false);
          invalidate();
          if (data.sent === 0) {
            toast({ title: "No reminders due", description: "No bookings are in the 24h or 2h window right now." });
          } else {
            toast({ title: `${data.sent} reminder${data.sent !== 1 ? "s" : ""} sent`, description: "Auto-processed all due reminders." });
          }
        },
        onError: () => {
          setProcessingAll(false);
          toast({ title: "Error", description: "Failed to process reminders.", variant: "destructive" });
        },
      },
    );
  };

  const handleManualSend = (bookingId: number) => {
    setSendingId(bookingId);
    sendReminder.mutate(
      { id: bookingId, data: { type: "manual" } },
      {
        onSuccess: () => {
          setSendingId(null);
          invalidate();
          toast({ title: "Reminder sent", description: "WhatsApp reminder queued for this booking." });
        },
        onError: () => {
          setSendingId(null);
          toast({ title: "Error", description: "Could not send reminder.", variant: "destructive" });
        },
      },
    );
  };

  // Partition: bookings that already have at least one reminder sent
  const sentBookingIds = new Set((reminders ?? []).map((r) => r.bookingId));

  const upcoming = (upcomingBookings ?? []).filter((b) => new Date(b.appointmentAt) > new Date());
  const needsReminder = upcoming.filter((b) => !sentBookingIds.has(b.id));
  const alreadyReminded = upcoming.filter((b) => sentBookingIds.has(b.id));

  const totalSent = (reminders ?? []).length;
  const sent24h = (reminders ?? []).filter((r) => r.type === "24h").length;
  const sent2h = (reminders ?? []).filter((r) => r.type === "2h").length;
  const sentManual = (reminders ?? []).filter((r) => r.type === "manual").length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reminders</h1>
          <p className="text-muted-foreground mt-1">WhatsApp appointment reminders for your clients.</p>
        </div>
        <Button onClick={handleProcessAll} disabled={processingAll} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${processingAll ? "animate-spin" : ""}`} />
          {processingAll ? "Processing…" : "Process Due Reminders"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Sent" value={totalSent} icon={<Bell className="w-4 h-4" />} loading={remindersLoading} />
        <StatCard label="24h Reminders" value={sent24h} icon={<Clock className="w-4 h-4 text-blue-500" />} loading={remindersLoading} accent="blue" />
        <StatCard label="2h Reminders" value={sent2h} icon={<Clock className="w-4 h-4 text-amber-500" />} loading={remindersLoading} accent="amber" />
        <StatCard label="Manual Sends" value={sentManual} icon={<Send className="w-4 h-4 text-purple-500" />} loading={remindersLoading} accent="purple" />
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">
            Upcoming
            {needsReminder.length > 0 && (
              <span className="ml-1.5 bg-primary text-primary-foreground text-xs rounded-full w-4 h-4 inline-flex items-center justify-center">
                {needsReminder.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History ({totalSent})</TabsTrigger>
        </TabsList>

        {/* ── Upcoming tab ── */}
        <TabsContent value="upcoming" className="space-y-4 mt-4">
          {bookingsLoading ? (
            <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
          ) : upcoming.length === 0 ? (
            <EmptyState icon={<Calendar />} text="No confirmed upcoming bookings." />
          ) : (
            <>
              {needsReminder.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">No reminder sent yet</p>
                  <div className="border rounded-md divide-y bg-card">
                    {needsReminder.map((b) => (
                      <UpcomingRow
                        key={b.id}
                        booking={b}
                        reminded={false}
                        sending={sendingId === b.id}
                        onSend={() => handleManualSend(b.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {alreadyReminded.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">Reminder already sent</p>
                  <div className="border rounded-md divide-y bg-card">
                    {alreadyReminded.map((b) => (
                      <UpcomingRow
                        key={b.id}
                        booking={b}
                        reminded={true}
                        sending={sendingId === b.id}
                        onSend={() => handleManualSend(b.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── History tab ── */}
        <TabsContent value="history" className="mt-4">
          {remindersLoading ? (
            <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
          ) : !reminders || reminders.length === 0 ? (
            <EmptyState icon={<Bell />} text="No reminders have been sent yet." />
          ) : (
            <div className="border rounded-md divide-y bg-card">
              {[...reminders].reverse().map((r) => (
                <div key={r.id} className="p-4">
                  <div
                    className="flex items-start justify-between gap-3 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{r.clientName}</span>
                        {typeBadge(r.type)}
                        {statusBadge(r.status)}
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                        {r.serviceName} · {format(new Date(r.appointmentAt), "MMM d, h:mm a")}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(r.sentAt), { addSuffix: true })}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.phoneNumber}</p>
                    </div>
                  </div>
                  {expandedId === r.id && (
                    <div className="mt-3 p-3 bg-muted rounded-md text-sm whitespace-pre-wrap text-muted-foreground border-l-4 border-primary/40">
                      {r.message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UpcomingRow({
  booking,
  reminded,
  sending,
  onSend,
}: {
  booking: { id: number; clientName: string; clientPhone: string; serviceName: string; appointmentAt: string | Date; staffName?: string | null };
  reminded: boolean;
  sending: boolean;
  onSend: () => void;
}) {
  const apptDate = new Date(booking.appointmentAt);
  const hoursUntil = (apptDate.getTime() - Date.now()) / (1000 * 60 * 60);
  const urgency = hoursUntil <= 3 ? "text-red-500" : hoursUntil <= 26 ? "text-amber-600" : "text-muted-foreground";

  return (
    <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{booking.clientName}</span>
          {reminded && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3 h-3" /> Reminded
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{booking.serviceName}{booking.staffName ? ` · ${booking.staffName}` : ""}</p>
        <p className={`text-xs font-medium mt-0.5 ${urgency}`}>
          {format(apptDate, "MMM d, h:mm a")} · {formatDistanceToNow(apptDate, { addSuffix: true })}
        </p>
      </div>
      <Button
        size="sm"
        variant={reminded ? "outline" : "default"}
        disabled={sending}
        onClick={onSend}
        className="gap-1.5 shrink-0"
      >
        <Send className="w-3.5 h-3.5" />
        {sending ? "Sending…" : reminded ? "Re-send" : "Send Reminder"}
      </Button>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  loading,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  loading: boolean;
  accent?: "blue" | "amber" | "purple";
}) {
  const valueClass =
    accent === "blue" ? "text-blue-600 dark:text-blue-400" :
    accent === "amber" ? "text-amber-600 dark:text-amber-400" :
    accent === "purple" ? "text-purple-600 dark:text-purple-400" :
    "text-foreground";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        {loading ? <Skeleton className="h-8 w-12" /> : (
          <p className={`text-3xl font-bold ${valueClass}`}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon: _icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-3">
      <Bell className="w-10 h-10 opacity-30" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function Calendar() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
}
