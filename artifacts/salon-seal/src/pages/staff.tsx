import { useState } from "react";
import { useListStaff, getListStaffQueryKey, useCreateStaffMember, useUpdateStaffMember, useDeleteStaffMember } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Staff() {
  const salonId = 1;
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any | null>(null);

  const { data: staff, isLoading } = useListStaff(salonId, {
    query: {
      queryKey: getListStaffQueryKey(salonId)
    }
  });

  const filteredStaff = staff?.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff Roster</h1>
          <p className="text-muted-foreground mt-1">Manage your team members.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-[250px]">
            <Input 
              placeholder="Search staff..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button onClick={() => setIsAdding(true)}>Add Staff</Button>
        </div>
      </div>

      <div className="border rounded-md bg-card">
        {isLoading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !filteredStaff || filteredStaff.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            No staff members found.
          </div>
        ) : (
          <div className="divide-y">
            <div className="grid grid-cols-4 p-4 font-medium text-sm text-muted-foreground bg-muted/30">
              <div className="col-span-2">Name</div>
              <div>Role</div>
              <div className="text-right">Status</div>
            </div>
            {filteredStaff.map(member => (
              <div 
                key={member.id} 
                className="grid grid-cols-4 p-4 items-center hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => setEditingStaff(member)}
              >
                <div className="col-span-2 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.phone || "No phone"}</p>
                  </div>
                </div>
                <div className="text-sm">{member.role}</div>
                <div className="text-right">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${member.isActive ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                    {member.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <StaffFormDialog 
        salonId={salonId}
        open={isAdding} 
        onClose={() => setIsAdding(false)} 
      />

      {editingStaff && (
        <StaffFormDialog 
          salonId={salonId}
          open={true} 
          staffMember={editingStaff}
          onClose={() => setEditingStaff(null)} 
        />
      )}
    </div>
  );
}

function StaffFormDialog({ salonId, open, onClose, staffMember }: { salonId: number, open: boolean, onClose: () => void, staffMember?: any }) {
  const queryClient = useQueryClient();
  const createStaff = useCreateStaffMember();
  const updateStaff = useUpdateStaffMember();
  const deleteStaff = useDeleteStaffMember();

  const [formData, setFormData] = useState(staffMember || {
    name: "",
    role: "Barber",
    phone: "",
    isActive: true
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload = {
      name: formData.name,
      role: formData.role,
      phone: formData.phone || null,
      isActive: formData.isActive
    };

    if (staffMember) {
      updateStaff.mutate(
        { salonId, id: staffMember.id, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListStaffQueryKey(salonId) });
            onClose();
          }
        }
      );
    } else {
      createStaff.mutate(
        { salonId, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListStaffQueryKey(salonId) });
            onClose();
          }
        }
      );
    }
  };

  const handleDelete = () => {
    if (staffMember && confirm("Are you sure you want to delete this staff member?")) {
      deleteStaff.mutate(
        { salonId, id: staffMember.id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListStaffQueryKey(salonId) });
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
          <DialogTitle>{staffMember ? 'Edit Staff Member' : 'Add Staff Member'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input 
              id="name" 
              required
              value={formData.name} 
              onChange={(e) => setFormData({...formData, name: e.target.value})} 
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select 
              value={formData.role} 
              onValueChange={(val) => setFormData({...formData, role: val})}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Barber">Barber</SelectItem>
                <SelectItem value="Stylist">Stylist</SelectItem>
                <SelectItem value="Colorist">Colorist</SelectItem>
                <SelectItem value="Nail Technician">Nail Technician</SelectItem>
                <SelectItem value="Manager">Manager</SelectItem>
                <SelectItem value="Receptionist">Receptionist</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number (Optional)</Label>
            <Input 
              id="phone" 
              value={formData.phone || ""} 
              onChange={(e) => setFormData({...formData, phone: e.target.value})} 
            />
          </div>

          {staffMember && (
            <div className="flex items-center justify-between pt-2">
              <Label htmlFor="isActive" className="cursor-pointer">Active Status</Label>
              <Switch 
                id="isActive" 
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({...formData, isActive: checked})}
              />
            </div>
          )}

          <DialogFooter className="mt-6 flex justify-between sm:justify-between items-center w-full">
            {staffMember ? (
              <Button type="button" variant="destructive" onClick={handleDelete}>Delete</Button>
            ) : (
              <div></div>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={createStaff.isPending || updateStaff.isPending}>
                {staffMember ? 'Save Changes' : 'Add Staff'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
