import { useState, useEffect } from "react";
import { useGetSalon, getGetSalonQueryKey, useUpdateSalon } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const salonId = 1;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: salon, isLoading } = useGetSalon(salonId, {
    query: {
      queryKey: getGetSalonQueryKey(salonId)
    }
  });

  const updateSalon = useUpdateSalon();

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    phone: "",
    location: "",
    cancellationWindowHours: 24,
  });

  useEffect(() => {
    if (salon) {
      setFormData({
        name: salon.name || "",
        slug: salon.slug || "",
        description: salon.description || "",
        phone: salon.phone || "",
        location: salon.location || "",
        cancellationWindowHours: salon.cancellationWindowHours || 24,
      });
    }
  }, [salon]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    updateSalon.mutate(
      { 
        id: salonId, 
        data: {
          name: formData.name,
          description: formData.description || null,
          phone: formData.phone,
          location: formData.location,
          cancellationWindowHours: Number(formData.cancellationWindowHours)
        } 
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSalonQueryKey(salonId) });
          toast({
            title: "Settings updated",
            description: "Your salon settings have been saved successfully.",
          });
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!salon) return <div className="text-destructive">Failed to load settings</div>;

  const publicUrl = `${window.location.origin}/book/${salon.slug}`;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Salon Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your business profile and preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Booking Link</CardTitle>
          <CardDescription>Share this link with clients to allow them to book online.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input readOnly value={publicUrl} className="bg-muted font-mono text-sm" />
            <Button 
              variant="secondary" 
              onClick={() => {
                navigator.clipboard.writeText(publicUrl);
                toast({ title: "Link copied to clipboard" });
              }}
            >
              Copy
            </Button>
            <Button 
              variant="outline" 
              onClick={() => window.open(`/book/${salon.slug}`, '_blank')}
            >
              Visit
            </Button>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Business Profile</CardTitle>
            <CardDescription>Update your salon details and contact information.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Business Name</Label>
              <Input 
                id="name" 
                required
                value={formData.name} 
                onChange={(e) => setFormData({...formData, name: e.target.value})} 
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Contact Phone</Label>
                <Input 
                  id="phone" 
                  required
                  value={formData.phone} 
                  onChange={(e) => setFormData({...formData, phone: e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cancellationWindowHours">Cancellation Window (Hours)</Label>
                <Input 
                  id="cancellationWindowHours" 
                  type="number"
                  min="0"
                  required
                  value={formData.cancellationWindowHours} 
                  onChange={(e) => setFormData({...formData, cancellationWindowHours: parseInt(e.target.value) || 0})} 
                  aria-describedby="cancellation-desc"
                />
                <p id="cancellation-desc" className="text-xs text-muted-foreground">
                  Deposits are non-refundable if cancelled within this window.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Physical Location</Label>
              <Input 
                id="location" 
                required
                value={formData.location} 
                onChange={(e) => setFormData({...formData, location: e.target.value})} 
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">About the Salon</Label>
              <Textarea 
                id="description" 
                rows={4}
                value={formData.description} 
                onChange={(e) => setFormData({...formData, description: e.target.value})} 
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end border-t p-6">
            <Button type="submit" disabled={updateSalon.isPending}>
              {updateSalon.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
