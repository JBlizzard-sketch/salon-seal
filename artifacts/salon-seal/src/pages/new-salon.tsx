import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateSalon } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScissorsSquare } from "lucide-react";

export default function NewSalon() {
  const [, setLocation] = useLocation();
  const createSalon = useCreateSalon();

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    phone: "",
    location: "",
    cancellationWindowHours: 24,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    createSalon.mutate(
      { 
        data: {
          name: formData.name,
          slug: formData.slug || formData.name.toLowerCase().replace(/\s+/g, '-'),
          phone: formData.phone,
          location: formData.location,
          cancellationWindowHours: Number(formData.cancellationWindowHours),
        } 
      },
      {
        onSuccess: (data) => {
          // In a real app we'd save auth token etc.
          // For demo, we just go to dashboard
          setLocation("/");
        }
      }
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md mb-8 text-center">
        <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center text-primary-foreground font-bold mx-auto mb-4 shadow-md">
          <ScissorsSquare className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">SalonSeal</h1>
        <p className="text-muted-foreground mt-2">Set up your business to start accepting bookings.</p>
      </div>

      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>Create your salon profile</CardTitle>
          <CardDescription>We just need a few details to get you started.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Business Name</Label>
              <Input 
                id="name" 
                required
                placeholder="The Sharp Edge"
                value={formData.name} 
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({
                    ...formData, 
                    name: val,
                    slug: val.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                  });
                }} 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="slug">Booking Link URL</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">salonseal.com/book/</span>
                <Input 
                  id="slug" 
                  required
                  value={formData.slug} 
                  onChange={(e) => setFormData({...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')})} 
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Business Phone (M-Pesa Number)</Label>
              <Input 
                id="phone" 
                required
                placeholder="07XX XXX XXX"
                value={formData.phone} 
                onChange={(e) => setFormData({...formData, phone: e.target.value})} 
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Physical Location</Label>
              <Input 
                id="location" 
                required
                placeholder="Ngong Road, Kilimani"
                value={formData.location} 
                onChange={(e) => setFormData({...formData, location: e.target.value})} 
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full h-12 text-lg" disabled={createSalon.isPending}>
              {createSalon.isPending ? 'Setting up...' : 'Create Salon'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
