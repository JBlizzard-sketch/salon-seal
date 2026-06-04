import { useState } from "react";
import {
  useGetSalonAnalytics,
  getGetSalonAnalyticsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Download } from "lucide-react";

type Period = "week" | "month" | "3months" | "6months" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  week: "Last 7 Days",
  month: "Last Month",
  "3months": "Last 3 Months",
  "6months": "Last 6 Months",
  all: "All Time",
};

const CHART_STYLE = {
  cartesianGrid: { strokeDasharray: "3 3", vertical: false, stroke: "hsl(var(--border))" } as const,
  axis: { stroke: "hsl(var(--muted-foreground))", fontSize: 12, tickLine: false, axisLine: false } as const,
  tooltip: { contentStyle: { backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: "8px" }, itemStyle: { color: "hsl(var(--foreground))" } } as const,
};

const STATUS_COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HEAT_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

function fmt(n: number) { return `Ksh ${n.toLocaleString()}`; }
function fmt12(h: number) { return h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`; }

export default function Analytics() {
  const salonId = 1;
  const [period, setPeriod] = useState<Period>("all");
  const [exporting, setExporting] = useState(false);

  const { data: analytics, isLoading } = useGetSalonAnalytics(
    salonId,
    { period },
    { query: { queryKey: [...getGetSalonAnalyticsQueryKey(salonId), period] } },
  );

  const monthLabels = (analytics?.monthlyRevenue ?? []).map(p => {
    const [yr, mo] = p.month.split("-");
    const d = new Date(Number(yr), Number(mo) - 1, 1);
    return { ...p, label: d.toLocaleString("default", { month: "short", year: "2-digit" }) };
  });

  const pieData = analytics
    ? [
        { name: "Completed", value: analytics.summary.completedBookings },
        { name: "No-Show", value: analytics.summary.noShowBookings },
        {
          name: "Other",
          value: Math.max(
            0,
            analytics.summary.totalBookings -
              analytics.summary.completedBookings -
              analytics.summary.noShowBookings,
          ),
        },
      ].filter(d => d.value > 0)
    : [];

  // Build heatmap: day(0-6) x hour grid
  const heatmapByDayHour: Record<string, number> = {};
  let heatmapMax = 0;
  for (const cell of analytics?.noShowHeatmap ?? []) {
    const key = `${cell.day}_${cell.hour}`;
    heatmapByDayHour[key] = cell.count;
    if (cell.count > heatmapMax) heatmapMax = cell.count;
  }
  const hasHeatmapData = heatmapMax > 0;

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/salons/${salonId}/analytics/export?period=${period}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `salon-analytics-${period}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent — user can retry
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">Insights into your salon's performance.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={exporting || isLoading}
            className="gap-1.5"
          >
            <Download className="w-4 h-4" />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Summary Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : analytics ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Revenue"
            value={fmt(analytics.summary.totalRevenue)}
            sub="from completed bookings"
            accent="emerald"
          />
          <StatCard
            label="Deposits Collected"
            value={fmt(analytics.summary.depositCollected)}
            sub={`${analytics.summary.depositCollectionRate}% collection rate`}
            accent="blue"
          />
          <StatCard
            label="Total Bookings"
            value={String(analytics.summary.totalBookings)}
            sub={`${analytics.summary.completedBookings} completed`}
            accent="purple"
          />
          <StatCard
            label="Completion Rate"
            value={`${analytics.summary.completionRate}%`}
            sub={`${analytics.summary.noShowRate}% no-show rate`}
            accent={analytics.summary.noShowRate >= 20 ? "red" : analytics.summary.noShowRate >= 10 ? "amber" : "emerald"}
          />
          <StatCard
            label="Completed"
            value={String(analytics.summary.completedBookings)}
            sub="successful appointments"
            accent="emerald"
            small
          />
          <StatCard
            label="No-Shows"
            value={String(analytics.summary.noShowBookings)}
            sub="missed appointments"
            accent="red"
            small
          />
          <StatCard
            label="Deposit Rate"
            value={`${analytics.summary.depositCollectionRate}%`}
            sub="paid before appointment"
            accent="blue"
            small
          />
          <StatCard
            label="No-Show Rate"
            value={`${analytics.summary.noShowRate}%`}
            sub="of non-cancelled bookings"
            accent={analytics.summary.noShowRate >= 20 ? "red" : analytics.summary.noShowRate >= 10 ? "amber" : "emerald"}
            small
          />
        </div>
      ) : null}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Revenue */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Monthly Revenue & Bookings</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthLabels} barGap={4}>
                  <CartesianGrid {...CHART_STYLE.cartesianGrid} />
                  <XAxis dataKey="label" {...CHART_STYLE.axis} />
                  <YAxis yAxisId="left" {...CHART_STYLE.axis} tickFormatter={v => `Ksh${(v/1000).toFixed(0)}k`} />
                  <YAxis yAxisId="right" orientation="right" {...CHART_STYLE.axis} />
                  <Tooltip
                    {...CHART_STYLE.tooltip}
                    formatter={(val: number, name: string) =>
                      name === "Revenue" ? [fmt(val), name] : [val, name]
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                  <Bar yAxisId="right" dataKey="bookings" name="Bookings" fill="hsl(var(--primary)/0.3)" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Weekly Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics?.weeklyTrend ?? []}>
                  <CartesianGrid {...CHART_STYLE.cartesianGrid} />
                  <XAxis dataKey="week" {...CHART_STYLE.axis} tickFormatter={v => v.slice(5)} />
                  <YAxis yAxisId="left" {...CHART_STYLE.axis} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <YAxis yAxisId="right" orientation="right" {...CHART_STYLE.axis} />
                  <Tooltip
                    {...CHART_STYLE.tooltip}
                    formatter={(val: number, name: string) =>
                      name === "Revenue" ? [fmt(val), name] : [val, name]
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="Revenue" />
                  <Line yAxisId="right" type="monotone" dataKey="bookings" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Bookings" />
                  <Line yAxisId="right" type="monotone" dataKey="noShows" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" name="No-Shows" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Peak Booking Days */}
        <Card>
          <CardHeader>
            <CardTitle>Peak Booking Days</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics?.peakDays ?? []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" {...CHART_STYLE.axis} />
                  <YAxis type="category" dataKey="day" {...CHART_STYLE.axis} width={80} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    {...CHART_STYLE.tooltip}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0,4,4,0]} name="Bookings" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Booking Outcomes Pie */}
        <Card>
          <CardHeader>
            <CardTitle>Booking Outcomes</CardTitle>
          </CardHeader>
          <CardContent className="h-72 flex items-center justify-center">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : pieData.length === 0 ? (
              <p className="text-muted-foreground text-sm">No data for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...CHART_STYLE.tooltip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* No-Show Heatmap */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>No-Show Heatmap</CardTitle>
            <p className="text-sm text-muted-foreground">Day × time slot density of missed appointments</p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : !hasHeatmapData ? (
              <p className="text-sm text-muted-foreground text-center py-10">No no-show data for this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[480px]">
                  {/* Hour axis header */}
                  <div className="flex ml-12 mb-1">
                    {HEAT_HOURS.map(h => (
                      <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground font-medium">
                        {fmt12(h)}
                      </div>
                    ))}
                  </div>
                  {/* Rows: one per day */}
                  {[0, 1, 2, 3, 4, 5, 6].map(day => (
                    <div key={day} className="flex items-center mb-1">
                      <div className="w-12 text-xs text-muted-foreground font-medium shrink-0 text-right pr-2">
                        {DAY_SHORT[day]}
                      </div>
                      {HEAT_HOURS.map(hour => {
                        const count = heatmapByDayHour[`${day}_${hour}`] ?? 0;
                        const intensity = heatmapMax > 0 ? count / heatmapMax : 0;
                        return (
                          <div
                            key={hour}
                            className="flex-1 mx-0.5 h-8 rounded-sm flex items-center justify-center text-[10px] font-medium transition-colors cursor-default"
                            style={{
                              backgroundColor: count === 0
                                ? "hsl(var(--muted))"
                                : `rgba(239, 68, 68, ${0.15 + intensity * 0.85})`,
                              color: intensity > 0.6 ? "white" : count > 0 ? "#ef4444" : "transparent",
                            }}
                            title={count > 0 ? `${DAY_SHORT[day]} ${fmt12(hour)}: ${count} no-show${count !== 1 ? "s" : ""}` : ""}
                          >
                            {count > 0 ? count : ""}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {/* Legend */}
                  <div className="flex items-center gap-2 mt-3 ml-12">
                    <span className="text-xs text-muted-foreground">Fewer</span>
                    {[0.1, 0.3, 0.5, 0.7, 0.9].map((v, i) => (
                      <div
                        key={i}
                        className="w-5 h-4 rounded-sm"
                        style={{ backgroundColor: `rgba(239, 68, 68, ${0.15 + v * 0.85})` }}
                      />
                    ))}
                    <span className="text-xs text-muted-foreground">More no-shows</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Staff Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Staff Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (analytics?.staffPerformance ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No staff data for this period.</p>
            ) : (
              <div className="space-y-3">
                {(analytics?.staffPerformance ?? []).map(staff => {
                  const rate = staff.bookings > 0 ? Math.round((staff.completed / staff.bookings) * 100) : 0;
                  return (
                    <div key={staff.staffId} className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                        {staff.staffName.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium truncate">{staff.staffName}</span>
                          <span className="text-muted-foreground shrink-0 ml-2">{staff.bookings} bookings</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className="bg-emerald-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                          <span>{rate}% completion</span>
                          {staff.noShows > 0 && <span className="text-red-500">{staff.noShows} no-show{staff.noShows !== 1 ? "s" : ""}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Busiest Hours */}
        <Card>
          <CardHeader>
            <CardTitle>Busiest Hours</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : !analytics?.peakHours?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.peakHours} barCategoryGap="20%">
                  <CartesianGrid {...CHART_STYLE.cartesianGrid} />
                  <XAxis dataKey="label" {...CHART_STYLE.axis} />
                  <YAxis {...CHART_STYLE.axis} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "hsl(var(--muted))" }} {...CHART_STYLE.tooltip} />
                  <Bar dataKey="count" name="Bookings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Popular Services */}
        <Card>
          <CardHeader>
            <CardTitle>Popular Services</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (analytics?.popularServices ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No service data for this period.</p>
            ) : (
              <div className="space-y-3">
                {(analytics?.popularServices ?? []).map((service, idx) => {
                  const maxCount = analytics!.popularServices[0].count;
                  const pct = maxCount > 0 ? (service.count / maxCount) * 100 : 0;
                  return (
                    <div key={service.serviceId} className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-4 shrink-0">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium truncate">{service.serviceName}</span>
                          <span className="text-muted-foreground shrink-0 ml-2">{service.count}× · {fmt(service.revenue)}</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type Accent = "emerald" | "blue" | "purple" | "red" | "amber";
const ACCENT_CLASSES: Record<Accent, string> = {
  emerald: "text-emerald-600 dark:text-emerald-400",
  blue: "text-blue-600 dark:text-blue-400",
  purple: "text-purple-600 dark:text-purple-400",
  red: "text-red-600 dark:text-red-400",
  amber: "text-amber-600 dark:text-amber-400",
};

function StatCard({
  label,
  value,
  sub,
  accent = "emerald",
  small = false,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: Accent;
  small?: boolean;
}) {
  return (
    <Card>
      <CardContent className={small ? "p-4" : "p-5"}>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
        <p className={`font-bold leading-tight ${ACCENT_CLASSES[accent]} ${small ? "text-xl" : "text-2xl"}`}>
          {value}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}
