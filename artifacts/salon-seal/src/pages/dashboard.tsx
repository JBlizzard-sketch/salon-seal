import { useGetDashboardSummary, getGetDashboardSummaryQueryKey, useGetRecentActivity, getGetRecentActivityQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Dashboard() {
  const salonId = 1;
  const { data: summary, isLoading, error } = useGetDashboardSummary(salonId, {
    query: {
      enabled: true,
      queryKey: getGetDashboardSummaryQueryKey(salonId)
    }
  });

  const { data: activity } = useGetRecentActivity(salonId, { limit: 10 }, {
    query: {
      queryKey: getGetRecentActivityQueryKey(salonId, { limit: 10 })
    }
  });

  if (isLoading) {
    return <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>;
  }

  if (error || !summary) {
    return <div className="text-red-500">Failed to load dashboard</div>;
  }

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
                {summary.upcomingBookings.map(booking => (
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
                {activity.map(item => (
                  <div key={item.id} className="flex justify-between items-start border-b pb-3 last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium text-sm">
                        {item.type === 'booking_created' && 'New Booking'}
                        {item.type === 'booking_confirmed' && 'Booking Confirmed'}
                        {item.type === 'booking_completed' && 'Booking Completed'}
                        {item.type === 'booking_cancelled' && 'Booking Cancelled'}
                        {item.type === 'no_show' && <span className="text-destructive">No-Show</span>}
                        {item.type === 'deposit_received' && <span className="text-emerald-600">Deposit Received</span>}
                        {item.type === 'refund_issued' && 'Refund Issued'}
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
    </div>
  );
}
