import { useState } from "react";
import { useListServices, getListServicesQueryKey, useCreateService, useUpdateService, useDeleteService } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export default function Services() {
  const salonId = 1;
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingService, setEditingService] = useState<any | null>(null);

  const { data: services, isLoading } = useListServices(salonId, {
    query: {
      queryKey: getListServicesQueryKey(salonId)
    }
  });

  const filteredServices = services?.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Services</h1>
          <p className="text-muted-foreground mt-1">Manage your service catalogue.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-[250px]">
            <Input 
              placeholder="Search services..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button onClick={() => setIsAdding(true)}>Add Service</Button>
        </div>
      </div>

      <div className="border rounded-md bg-card">
        {isLoading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !filteredServices || filteredServices.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            No services found.
          </div>
        ) : (
          <div className="divide-y">
            <div className="grid grid-cols-6 p-4 font-medium text-sm text-muted-foreground bg-muted/30">
              <div className="col-span-2">Service</div>
              <div>Duration</div>
              <div>Price</div>
              <div>Deposit</div>
              <div className="text-right">Status</div>
            </div>
            {filteredServices.map(service => (
              <div 
                key={service.id} 
                className="grid grid-cols-6 p-4 items-center hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => setEditingService(service)}
              >
                <div className="col-span-2">
                  <p className="font-medium">{service.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{service.description}</p>
                </div>
                <div className="text-sm">{service.durationMinutes} min</div>
                <div className="text-sm font-medium">Ksh {service.price.toLocaleString()}</div>
                <div className="text-sm text-amber-600 font-medium">Ksh {service.depositAmount.toLocaleString()}</div>
                <div className="text-right">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${service.isActive ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                    {service.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ServiceFormDialog 
        salonId={salonId}
        open={isAdding} 
        onClose={() => setIsAdding(false)} 
      />

      {editingService && (
        <ServiceFormDialog 
          salonId={salonId}
          open={true} 
          service={editingService}
          onClose={() => setEditingService(null)} 
        />
      )}
    </div>
  );
}

function ServiceFormDialog({ salonId, open, onClose, service }: { salonId: number, open: boolean, onClose: () => void, service?: any }) {
  const queryClient = useQueryClient();
  const createService = useCreateService();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();

  const [formData, setFormData] = useState(service || {
    name: "",
    description: "",
    price: "",
    depositAmount: "",
    durationMinutes: "60",
    isActive: true
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload = {
      name: formData.name,
      description: formData.description || null,
      price: Number(formData.price),
      depositAmount: Number(formData.depositAmount),
      durationMinutes: Number(formData.durationMinutes),
      isActive: formData.isActive
    };

    if (service) {
      updateService.mutate(
        { salonId, id: service.id, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListServicesQueryKey(salonId) });
            onClose();
          }
        }
      );
    } else {
      createService.mutate(
        { salonId, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListServicesQueryKey(salonId) });
            onClose();
          }
        }
      );
    }
  };

  const handleDelete = () => {
    if (service && confirm("Are you sure you want to delete this service?")) {
      deleteService.mutate(
        { salonId, id: service.id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListServicesQueryKey(salonId) });
            onClose();
          }
        }
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{service ? 'Edit Service' : 'Add Service'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Service Name</Label>
            <Input 
              id="name" 
              required
              value={formData.name} 
              onChange={(e) => setFormData({...formData, name: e.target.value})} 
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Price (Ksh)</Label>
              <Input 
                id="price" 
                type="number"
                required
                min="0"
                value={formData.price} 
                onChange={(e) => setFormData({...formData, price: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="depositAmount">Deposit (Ksh)</Label>
              <Input 
                id="depositAmount" 
                type="number"
                required
                min="0"
                value={formData.depositAmount} 
                onChange={(e) => setFormData({...formData, depositAmount: e.target.value})} 
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="durationMinutes">Duration (Minutes)</Label>
            <Input 
              id="durationMinutes" 
              type="number"
              required
              min="5"
              step="5"
              value={formData.durationMinutes} 
              onChange={(e) => setFormData({...formData, durationMinutes: e.target.value})} 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea 
              id="description" 
              rows={2}
              value={formData.description || ""} 
              onChange={(e) => setFormData({...formData, description: e.target.value})} 
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <Label htmlFor="isActive" className="cursor-pointer">Active</Label>
            <Switch 
              id="isActive" 
              checked={formData.isActive}
              onCheckedChange={(checked) => setFormData({...formData, isActive: checked})}
            />
          </div>

          <DialogFooter className="mt-6 flex justify-between sm:justify-between items-center w-full">
            {service ? (
              <Button type="button" variant="destructive" onClick={handleDelete}>Delete</Button>
            ) : (
              <div></div>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={createService.isPending || updateService.isPending}>
                {service ? 'Save Changes' : 'Add Service'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
