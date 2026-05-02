import { useState } from "react";
import { useListClients, getListClientsQueryKey, useGetClient, getGetClientQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

export default function Clients() {
  const salonId = 1;
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);

  const { data: clients, isLoading } = useListClients(salonId, {
    query: {
      queryKey: getListClientsQueryKey(salonId)
    }
  });

  const filteredClients = clients?.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage your client relationships.</p>
        </div>
        <div className="w-[300px]">
          <Input 
            placeholder="Search clients..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="border rounded-md bg-card">
        {isLoading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !filteredClients || filteredClients.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            No clients found.
          </div>
        ) : (
          <div className="divide-y">
            <div className="grid grid-cols-5 p-4 font-medium text-sm text-muted-foreground bg-muted/30">
              <div className="col-span-2">Client</div>
              <div>Visits</div>
              <div>No-Shows</div>
              <div className="text-right">Total Spent</div>
            </div>
            {filteredClients.map(client => (
              <div 
                key={client.id} 
                className="grid grid-cols-5 p-4 items-center hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => setSelectedClientId(client.id)}
              >
                <div className="col-span-2">
                  <p className="font-medium">{client.name}</p>
                  <p className="text-xs text-muted-foreground">{client.phone}</p>
                </div>
                <div>{client.totalVisits}</div>
                <div>
                  <span className={client.noShowCount > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
                    {client.noShowCount}
                  </span>
                </div>
                <div className="text-right font-medium">Ksh {client.totalSpent.toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ClientDetailDialog 
        clientId={selectedClientId} 
        onClose={() => setSelectedClientId(null)} 
      />
    </div>
  );
}

function ClientDetailDialog({ clientId, onClose }: { clientId: number | null, onClose: () => void }) {
  const salonId = 1;
  const { data: client, isLoading } = useGetClient(salonId, clientId || 0, {
    query: {
      enabled: !!clientId,
      queryKey: getGetClientQueryKey(salonId, clientId || 0)
    }
  });

  return (
    <Dialog open={!!clientId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Client Details</DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !client ? (
          <div className="text-center p-8 text-muted-foreground">Client not found</div>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold">{client.name}</h2>
                <p className="text-muted-foreground">{client.phone}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Last Visit</p>
                <p className="font-medium">{client.lastVisitAt ? format(new Date(client.lastVisitAt), "MMM d, yyyy") : "Never"}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-muted p-4 rounded-md">
                <p className="text-sm text-muted-foreground">Total Visits</p>
                <p className="text-2xl font-bold">{client.totalVisits}</p>
              </div>
              <div className="bg-muted p-4 rounded-md">
                <p className="text-sm text-muted-foreground">Total Spent</p>
                <p className="text-2xl font-bold text-emerald-600">Ksh {client.totalSpent.toLocaleString()}</p>
              </div>
              <div className="bg-muted p-4 rounded-md">
                <p className="text-sm text-muted-foreground">No-Shows</p>
                <p className={`text-2xl font-bold ${client.noShowCount > 0 ? "text-destructive" : ""}`}>{client.noShowCount}</p>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-3">Booking History</h3>
              {client.recentBookings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bookings found.</p>
              ) : (
                <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                  {client.recentBookings.map(booking => (
                    <div key={booking.id} className="p-3 text-sm flex justify-between items-center">
                      <div>
                        <p className="font-medium">{booking.serviceName}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(booking.appointmentAt), "MMM d, yyyy h:mm a")}</p>
                      </div>
                      <div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          booking.status === 'completed' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          booking.status === 'no_show' ? 'bg-destructive/10 text-destructive dark:bg-destructive/20' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {booking.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
