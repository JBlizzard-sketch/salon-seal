import { useState } from "react";
import { useGetSalonAnalytics, getGetSalonAnalyticsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

export default function Analytics() {
  const salonId = 1;
  const { data: analytics, isLoading } = useGetSalonAnalytics(salonId, {
    query: {
      queryKey: getGetSalonAnalyticsQueryKey(salonId)
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    );
  }

  if (!analytics) return <div className="text-destructive">Failed to load analytics</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-1">Insights into your salon's performance.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Weekly Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.weeklyTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `Ksh${value}`} />
                <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Revenue" />
                <Line yAxisId="right" type="monotone" dataKey="bookings" stroke="hsl(var(--secondary))" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Bookings" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Peak Booking Days</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.peakDays}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{ fill: 'hsl(var(--muted))' }}
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Bookings" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Staff Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.staffPerformance.map(staff => (
                <div key={staff.staffId} className="flex justify-between items-center border-b pb-4 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium">{staff.staffName}</p>
                    <p className="text-xs text-muted-foreground">{staff.bookings} total bookings</p>
                  </div>
                  <div className="flex gap-6 text-sm text-right">
                    <div>
                      <p className="text-muted-foreground">Completed</p>
                      <p className="font-semibold text-emerald-600">{staff.completed}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">No-Shows</p>
                      <p className={`font-semibold ${staff.noShows > 0 ? "text-destructive" : ""}`}>{staff.noShows}</p>
                    </div>
                  </div>
                </div>
              ))}
              {analytics.staffPerformance.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No staff data available.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Popular Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.popularServices.map(service => (
                <div key={service.serviceId} className="flex justify-between items-center border-b pb-4 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium">{service.serviceName}</p>
                    <p className="text-xs text-muted-foreground">{service.count} bookings</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Generated</p>
                    <p className="font-semibold">Ksh {service.revenue.toLocaleString()}</p>
                  </div>
                </div>
              ))}
              {analytics.popularServices.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No service data available.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
