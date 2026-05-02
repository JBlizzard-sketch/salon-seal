import { useListBookings, getListBookingsQueryKey, useUpdateBookingStatus } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function Bookings() {
  const salonId = 1;
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const queryClient = useQueryClient();

  const { data: bookings, isLoading } = useListBookings({ salonId, status: statusFilter === "all" ? undefined : statusFilter }, {
    query: {
      queryKey: [...getListBookingsQueryKey(), { salonId, statusFilter }]
    }
  });

  const updateStatus = useUpdateBookingStatus();

  const handleStatusUpdate = (id: number, status: any) => {
    updateStatus.mutate({ id, data: { status } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bookings</h1>
          <p className="text-muted-foreground mt-1">Manage your appointments.</p>
        </div>
        <div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Bookings</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="arrived">Arrived</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="no_show">No Show</SelectItem>
            </SelectContent>
          </Select>
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
          <div className="p-12 text-center text-muted-foreground">
            No bookings found.
          </div>
        ) : (
          <div className="divide-y">
            {bookings.map(booking => (
              <div key={booking.id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                <div className="grid grid-cols-4 w-full items-center gap-4">
                  <div>
                    <p className="font-medium">{booking.clientName}</p>
                    <p className="text-xs text-muted-foreground">{booking.clientPhone}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{booking.serviceName}</p>
                    <p className="text-xs text-muted-foreground">{booking.staffName || "No staff assigned"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{format(new Date(booking.appointmentAt), "MMM d, yyyy")}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(booking.appointmentAt), "h:mm a")}</p>
                  </div>
                  <div className="flex flex-col items-start gap-1">
                    <Badge variant={booking.status === "completed" ? "default" : booking.status === "no_show" ? "destructive" : "secondary"}>
                      {booking.status.replace('_', ' ')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Deposit: {booking.depositPaid ? "Paid" : "Pending"} (Ksh {booking.depositAmount})
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {booking.status === "confirmed" && (
                    <Button size="sm" variant="outline" onClick={() => handleStatusUpdate(booking.id, "arrived")}>Mark Arrived</Button>
                  )}
                  {booking.status === "arrived" && (
                    <Button size="sm" variant="default" onClick={() => handleStatusUpdate(booking.id, "completed")}>Complete</Button>
                  )}
                  {(booking.status === "confirmed" || booking.status === "pending") && (
                    <Button size="sm" variant="destructive" onClick={() => handleStatusUpdate(booking.id, "no_show")}>No Show</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
