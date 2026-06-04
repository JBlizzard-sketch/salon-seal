import { useState, useMemo } from "react";
import { useRoute } from "wouter";
import { useGetSalonBySlug, getGetSalonBySlugQueryKey, useCreateBooking, useSimulateMpesaPayment, useGetStaffBusySlots, useAddToWaitlist } from "@workspace/api-client-react";
import { format, addDays, startOfDay, isBefore, isSameDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScissorsSquare, Clock, CreditCard, ChevronLeft, CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PublicBooking() {
  const [, params] = useRoute("/book/:slug");
  const slug = params?.slug || "";
  const { toast } = useToast();

  const { data: salon, isLoading } = useGetSalonBySlug(slug, {
    query: {
      enabled: !!slug,
      queryKey: getGetSalonBySlugQueryKey(slug)
    }
  });

  const createBooking = useCreateBooking();
  const simulatePayment = useSimulateMpesaPayment();

  const busySlotsDate = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const { data: busySlotsData } = useGetStaffBusySlots(
    salon?.id ?? 0,
    selectedStaffId ?? 0,
    { date: busySlotsDate },
    { query: { enabled: !!selectedStaffId && !!selectedDate && !!salon } },
  );

  const [step, setStep] = useState<"service" | "stylist" | "datetime" | "details" | "success">("service");
  const [createdBookingId, setCreatedBookingId] = useState<number | null>(null);
  const [mpesaResult, setMpesaResult] = useState<{ ref: string; message: string } | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    notes: ""
  });
  const [conflictSlot, setConflictSlot] = useState<{
    staffId: number | null; serviceId: number; appointmentAt: string;
    serviceName: string; staffName: string | null;
  } | null>(null);
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const addToWaitlist = useAddToWaitlist();

  const selectedService = useMemo(() => {
    if (!salon || !selectedServiceId) return null;
    return salon.services.find(s => s.id === selectedServiceId) || null;
  }, [salon, selectedServiceId]);

  const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

  // Generate next 28 days, marking closed days
  const availableDates = useMemo(() => {
    const dates: { date: Date; isClosed: boolean }[] = [];
    const today = startOfDay(new Date());
    const bh = salon?.businessHours;
    for (let i = 0; i < 28; i++) {
      const date = addDays(today, i);
      const dayName = DAY_NAMES[date.getDay()];
      const isClosed = bh ? !bh[dayName].isOpen : false;
      dates.push({ date, isClosed });
    }
    return dates;
  }, [salon]);

  // Compute which slots are blocked by the selected stylist's existing bookings
  const blockedSlotTimes = useMemo(() => {
    if (!selectedStaffId || !busySlotsData || !selectedService) return new Set<string>();
    const blocked = new Set<string>();
    for (const busy of busySlotsData.busySlots) {
      const busyStart = new Date(busy.appointmentAt).getTime();
      const busyEnd = busyStart + busy.durationMinutes * 60 * 1000;
      const newDuration = selectedService.durationMinutes * 60 * 1000;
      // A slot at slotTime conflicts if: slotTime < busyEnd AND slotTime + newDuration > busyStart
      // i.e., slotTime in (busyStart - newDuration, busyEnd)
      blocked.add(busy.appointmentAt);
      // also block slots that would overlap the busy window
      if (newDuration > 60 * 60 * 1000) {
        const slotIntervalMs = 60 * 60 * 1000;
        for (let t = busyStart - newDuration + slotIntervalMs; t < busyEnd; t += slotIntervalMs) {
          blocked.add(new Date(t).toISOString());
        }
      }
    }
    return blocked;
  }, [selectedStaffId, busySlotsData, selectedService]);

  // Generate time slots based on business hours
  const availableTimeSlots = useMemo(() => {
    if (!selectedDate || !salon) return [];

    const dayName = DAY_NAMES[selectedDate.getDay()];
    const bh = salon.businessHours;
    const dayHours = bh?.[dayName];
    if (dayHours && !dayHours.isOpen) return [];

    const [startH, startM] = (dayHours?.openTime ?? "09:00").split(":").map(Number);
    const [endH, endM] = (dayHours?.closeTime ?? "18:00").split(":").map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;

    const slots: Date[] = [];
    const now = new Date();
    for (let m = startMins; m < endMins; m += 60) {
      const slotTime = new Date(selectedDate);
      slotTime.setHours(Math.floor(m / 60), m % 60, 0, 0);
      if (!isSameDay(now, selectedDate) || isBefore(now, slotTime)) {
        slots.push(slotTime);
      }
    }
    return slots;
  }, [selectedDate, salon]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!salon || !selectedServiceId || !selectedDate || !selectedTime) return;
    
    const appointmentAt = new Date(selectedTime).toISOString();
    
    createBooking.mutate(
      {
        data: {
          salonId: salon.id,
          serviceId: selectedServiceId,
          staffId: selectedStaffId,
          clientName: formData.name,
          clientPhone: formData.phone,
          appointmentAt,
          notes: formData.notes || null,
        }
      },
      {
        onSuccess: (data) => {
          setCreatedBookingId(data.booking.id);
          setStep("success");
        },
        onError: (err: any) => {
          const status = err?.response?.status;
          const serverError = err?.response?.data?.error;
          const isBlocked = status === 403 || serverError === "BLACKLISTED";
          const isConflict = status === 409 || serverError === "STAFF_CONFLICT";
          if (isConflict && selectedServiceId && selectedTime && selectedService) {
            setConflictSlot({
              staffId: selectedStaffId,
              serviceId: selectedServiceId,
              appointmentAt: selectedTime,
              serviceName: selectedService.name,
              staffName: selectedStaffId
                ? (salon?.staff?.find(s => s.id === selectedStaffId)?.name ?? null)
                : null,
            });
          } else {
            toast({
              title: isBlocked ? "Booking unavailable" : "Booking failed",
              description: isBlocked
                ? "We're unable to accept new bookings from this number. Please contact the salon directly."
                : "There was an error creating your booking. Please try again.",
              variant: "destructive",
            });
          }
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Skeleton className="h-10 w-3/4 mx-auto" />
            <Skeleton className="h-4 w-1/2 mx-auto mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!salon) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center py-12">
          <CardTitle className="text-2xl mb-2">Salon Not Found</CardTitle>
          <CardDescription>The booking link you followed might be invalid.</CardDescription>
        </Card>
      </div>
    );
  }

  if (step === "success") {
    const handleSimulatePayment = () => {
      if (!createdBookingId) return;
      simulatePayment.mutate(
        { id: createdBookingId },
        {
          onSuccess: (data) => {
            setMpesaResult({ ref: data.mpesaRef, message: data.message });
          },
          onError: () => {
            toast({
              title: "Payment simulation failed",
              description: "Could not process payment. Please try again.",
              variant: "destructive",
            });
          },
        }
      );
    };

    const resetWizard = () => {
      setStep("service");
      setSelectedServiceId(null);
      setSelectedStaffId(null);
      setSelectedDate(null);
      setSelectedTime(null);
      setFormData({ name: "", phone: "", notes: "" });
      setCreatedBookingId(null);
      setMpesaResult(null);
    };

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-background flex flex-col items-center pt-12 p-4">
        <Card className="w-full max-w-md px-6 py-10">
          {/* Step 1 — booking confirmed */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold">Booking Received</p>
              <p className="text-sm text-muted-foreground">{selectedService?.name} · {salon.name}</p>
            </div>
          </div>

          <div className="h-px bg-border mb-6" />

          {/* Step 2 — deposit */}
          {!mpesaResult ? (
            <div className="space-y-5">
              <div>
                <p className="font-semibold text-base mb-1">Pay Deposit to Confirm</p>
                <p className="text-sm text-muted-foreground">
                  A deposit of <span className="font-semibold text-foreground">Ksh {selectedService?.depositAmount}</span> is required to secure your appointment.
                </p>
              </div>

              <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-1">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 text-sm font-medium">
                  <Smartphone className="w-4 h-4" />
                  M-Pesa STK Push
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-500">
                  A payment prompt will be sent to <strong>{formData.phone}</strong>. Enter your M-Pesa PIN to complete.
                </p>
              </div>

              <Button
                className="w-full h-11 text-base"
                onClick={handleSimulatePayment}
                disabled={simulatePayment.isPending}
              >
                {simulatePayment.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing…</>
                ) : (
                  <><Smartphone className="w-4 h-4 mr-2" /> Simulate M-Pesa Payment</>
                )}
              </Button>

              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={resetWizard}>
                Cancel &amp; start over
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col items-center text-center gap-3 py-2">
                <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <p className="font-bold text-lg">Payment Confirmed!</p>
                  <p className="text-sm text-muted-foreground mt-1">{mpesaResult.message}</p>
                </div>
              </div>

              <div className="rounded-xl border bg-muted/50 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">M-Pesa Ref</span>
                  <span className="font-mono font-semibold tracking-widest">{mpesaResult.ref}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount Paid</span>
                  <span className="font-semibold text-emerald-600">Ksh {selectedService?.depositAmount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-medium text-emerald-600">Confirmed ✓</span>
                </div>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                A reminder will be sent to {formData.phone} before your appointment.
              </p>

              <Button className="w-full" onClick={resetWizard}>
                Book Another Appointment
              </Button>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background flex flex-col items-center pt-8 p-4">
      <div className="w-full max-w-md mb-6 text-center">
        <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-primary-foreground font-bold mx-auto mb-3 shadow-md">
          <ScissorsSquare className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold">{salon.name}</h1>
        <p className="text-muted-foreground text-sm">{salon.location}</p>
      </div>

      <Card className="w-full max-w-md shadow-lg border-t-4 border-t-primary">
        <CardHeader className="pb-4">
          <div className="flex items-center">
            {step !== "service" && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 mr-2 -ml-2 rounded-full"
                onClick={() => {
                  const hasStaff = (salon.staff ?? []).filter(s => s.isActive).length > 0;
                  if (step === "stylist") setStep("service");
                  if (step === "datetime") setStep(hasStaff ? "stylist" : "service");
                  if (step === "details") setStep("datetime");
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <CardTitle className="text-xl">
                {step === "service" && "Select Service"}
                {step === "stylist" && "Choose Stylist"}
                {step === "datetime" && "Choose Date & Time"}
                {step === "details" && "Your Details"}
              </CardTitle>
            </div>
          </div>
          
          {(() => {
            const hasStaff = (salon.staff ?? []).filter(s => s.isActive).length > 0;
            const steps = hasStaff
              ? ["service", "stylist", "datetime", "details"]
              : ["service", "datetime", "details"];
            const idx = steps.indexOf(step as string);
            return (
              <div className="flex items-center justify-between mt-4">
                {steps.map((s, i) => (
                  <span key={s} className="contents">
                    <div className={`h-1.5 flex-1 ${i === 0 ? "rounded-l-full" : ""} ${i === steps.length - 1 ? "rounded-r-full" : ""} ${i <= idx ? "bg-primary" : "bg-muted"}`} />
                    {i < steps.length - 1 && <div className="w-1 h-1.5 bg-background" />}
                  </span>
                ))}
              </div>
            );
          })()}
        </CardHeader>

        <CardContent>
          {step === "stylist" && (() => {
            const activeStaff = (salon.staff ?? []).filter(s => s.isActive);
            return (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground mb-1">Optional — pick a specific stylist or choose "Any available".</p>
                {[{ id: null as number | null, name: "Any available", role: "We'll assign the best available stylist" }, ...activeStaff].map((member) => {
                  const isSelected = selectedStaffId === member.id;
                  return (
                    <div
                      key={member.id ?? "any"}
                      className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                        isSelected ? "border-primary bg-primary/5" : "border-transparent bg-muted hover:bg-muted/80"
                      }`}
                      onClick={() => setSelectedStaffId(member.id)}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-bold shrink-0 ${
                        isSelected ? "bg-primary text-primary-foreground" : "bg-muted-foreground/15 text-muted-foreground"
                      }`}>
                        {member.id === null ? "✦" : member.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">{member.name}</p>
                        <p className="text-sm text-muted-foreground">{member.role}</p>
                      </div>
                      {isSelected && <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0"><span className="text-primary-foreground text-xs font-bold">✓</span></div>}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {step === "service" && (
            <div className="space-y-4">
              {salon.services.filter(s => s.isActive).length === 0 ? (
                <div className="text-center p-6 text-muted-foreground bg-muted/50 rounded-lg">
                  No services currently available for booking.
                </div>
              ) : (() => {
                const active = salon.services.filter(s => s.isActive);
                // Group by category
                const grouped: Record<string, typeof active> = {};
                const uncategorised: typeof active = [];
                for (const s of active) {
                  if (!s.category) { uncategorised.push(s); }
                  else {
                    if (!grouped[s.category]) grouped[s.category] = [];
                    grouped[s.category].push(s);
                  }
                }
                const keys = Object.keys(grouped).sort();
                if (uncategorised.length > 0) keys.push("__uncategorised__");
                const hasCategories = keys.length > 1 || (keys.length === 1 && keys[0] !== "__uncategorised__");

                const ServiceCard = ({ service }: { service: typeof active[0] }) => (
                  <div
                    key={service.id}
                    className={`flex items-start p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      selectedServiceId === service.id
                        ? "border-primary bg-primary/5"
                        : "border-transparent bg-muted hover:bg-muted/80"
                    }`}
                    onClick={() => setSelectedServiceId(service.id)}
                  >
                    <RadioGroupItem value={service.id.toString()} id={`service-${service.id}`} className="mt-1 sr-only" />
                    <div className="flex-1 flex justify-between gap-4">
                      <div>
                        <Label htmlFor={`service-${service.id}`} className="font-semibold text-base cursor-pointer">
                          {service.name}
                        </Label>
                        {service.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{service.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs font-medium text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {service.durationMinutes} min</span>
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500"><CreditCard className="w-3 h-3" /> Ksh {service.depositAmount} deposit</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bold">Ksh {service.price.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );

                return (
                  <RadioGroup
                    value={selectedServiceId?.toString()}
                    onValueChange={(val) => setSelectedServiceId(parseInt(val))}
                    className="space-y-4"
                  >
                    {hasCategories ? keys.map(key => {
                      const list = key === "__uncategorised__" ? uncategorised : grouped[key];
                      const label = key === "__uncategorised__" ? "Other" : key;
                      return (
                        <div key={key}>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 px-1">{label}</p>
                          <div className="space-y-2">
                            {list.map(s => <ServiceCard key={s.id} service={s} />)}
                          </div>
                        </div>
                      );
                    }) : active.map(s => <ServiceCard key={s.id} service={s} />)}
                  </RadioGroup>
                );
              })()}
            </div>
          )}

          {step === "datetime" && (
            <div className="space-y-6">
              <div>
                <Label className="text-base font-semibold mb-3 block">Select Date</Label>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x">
                  {availableDates.map(({ date, isClosed }, i) => {
                    const isSelected = selectedDate && isSameDay(date, selectedDate);
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={isClosed}
                        onClick={() => {
                          if (!isClosed) {
                            setSelectedDate(date);
                            setSelectedTime(null);
                          }
                        }}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl min-w-[70px] snap-start transition-all border-2 ${
                          isClosed
                            ? 'bg-muted/40 border-transparent opacity-40 cursor-not-allowed'
                            : isSelected
                              ? 'bg-primary text-primary-foreground border-primary shadow-md'
                              : 'bg-muted border-transparent hover:bg-muted/80'
                        }`}
                      >
                        <span className="text-xs uppercase font-medium opacity-80">{format(date, "EEE")}</span>
                        <span className="text-xl font-bold mt-1">{format(date, "d")}</span>
                        <span className={`text-[10px] mt-1 ${isClosed ? "font-semibold" : "opacity-80"}`}>
                          {isClosed ? "Closed" : format(date, "MMM")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedDate && (
                <div>
                  <Label className="text-base font-semibold mb-3 block">Select Time</Label>
                  {availableTimeSlots.length === 0 ? (
                    <div className="text-center p-4 text-sm text-muted-foreground bg-muted/50 rounded-lg">
                      No available times for this date.
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {availableTimeSlots.map((time, i) => {
                        const timeStr = time.toISOString();
                        const isSelected = selectedTime === timeStr;
                        const isBlocked = blockedSlotTimes.has(timeStr);
                        return (
                          <button
                            key={i}
                            type="button"
                            disabled={isBlocked}
                            onClick={() => !isBlocked && setSelectedTime(timeStr)}
                            title={isBlocked ? "Stylist already booked at this time" : undefined}
                            className={`py-3 rounded-lg text-sm font-medium transition-all border-2 ${
                              isBlocked
                                ? 'bg-muted/40 border-transparent text-muted-foreground/40 cursor-not-allowed line-through'
                                : isSelected 
                                  ? 'bg-primary text-primary-foreground border-primary shadow-md' 
                                  : 'bg-muted border-transparent hover:bg-muted/80'
                            }`}
                          >
                            {format(time, "h:mm a")}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === "details" && (
            <form id="booking-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-muted p-4 rounded-xl mb-6">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-semibold">{selectedService?.name}</span>
                  <span className="font-bold">Ksh {selectedService?.price}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {selectedTime && format(new Date(selectedTime), "EEEE, MMMM d, yyyy 'at' h:mm a")}
                </div>
                <div className="mt-3 pt-3 border-t border-border flex justify-between items-center font-medium text-amber-700 dark:text-amber-500">
                  <span>Deposit Required</span>
                  <span>Ksh {selectedService?.depositAmount}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input 
                  id="name" 
                  required
                  placeholder="John Doe"
                  value={formData.name} 
                  onChange={(e) => setFormData({...formData, name: e.target.value})} 
                  className="bg-muted/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">M-Pesa Phone Number</Label>
                <Input 
                  id="phone" 
                  required
                  placeholder="07XX XXX XXX"
                  value={formData.phone} 
                  onChange={(e) => setFormData({...formData, phone: e.target.value})} 
                  className="bg-muted/50"
                />
                <p className="text-xs text-muted-foreground">This number will receive the payment prompt.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Input 
                  id="notes" 
                  placeholder="Any special requests?"
                  value={formData.notes} 
                  onChange={(e) => setFormData({...formData, notes: e.target.value})} 
                  className="bg-muted/50"
                />
              </div>
            </form>
          )}
        </CardContent>

        <CardFooter className="pt-4 pb-6 px-6">
          {step === "service" && (
            <Button
              className="w-full text-lg h-12"
              disabled={!selectedServiceId}
              onClick={() => {
                const hasStaff = (salon.staff ?? []).filter(s => s.isActive).length > 0;
                setStep(hasStaff ? "stylist" : "datetime");
              }}
            >
              Continue
            </Button>
          )}
          {step === "stylist" && (
            <Button
              className="w-full text-lg h-12"
              onClick={() => setStep("datetime")}
            >
              {selectedStaffId ? "Continue" : "Continue — Any available"}
            </Button>
          )}
          {step === "datetime" && (
            <Button 
              className="w-full text-lg h-12" 
              disabled={!selectedDate || !selectedTime}
              onClick={() => setStep("details")}
            >
              Continue to Details
            </Button>
          )}
          {step === "details" && !conflictSlot && (
            <Button 
              className="w-full text-lg h-12" 
              type="submit" 
              form="booking-form"
              disabled={createBooking.isPending || !formData.name || !formData.phone}
            >
              {createBooking.isPending ? 'Processing...' : 'Confirm & Pay Deposit'}
            </Button>
          )}
          {step === "details" && conflictSlot && (
            <div className="w-full space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-300">
                <p className="font-semibold mb-1">This time slot is already taken</p>
                <p>{conflictSlot.staffName ? `${conflictSlot.staffName} is` : "The stylist is"} already booked at {format(new Date(conflictSlot.appointmentAt), "h:mm a")}. Choose a different time or join the waitlist.</p>
              </div>
              {!waitlistJoined ? (
                <div className="flex flex-col gap-2">
                  <Button
                    className="w-full h-11"
                    variant="outline"
                    disabled={addToWaitlist.isPending || !formData.name || !formData.phone}
                    onClick={() => {
                      if (!salon || !formData.name || !formData.phone) return;
                      addToWaitlist.mutate(
                        {
                          salonId: salon.id,
                          data: {
                            staffId: conflictSlot.staffId ?? undefined,
                            serviceId: conflictSlot.serviceId,
                            appointmentAt: conflictSlot.appointmentAt,
                            clientName: formData.name,
                            clientPhone: formData.phone,
                            serviceName: conflictSlot.serviceName,
                            staffName: conflictSlot.staffName ?? undefined,
                          },
                        },
                        { onSuccess: () => setWaitlistJoined(true) }
                      );
                    }}
                  >
                    {addToWaitlist.isPending ? "Joining…" : "⏳ Join Waitlist for This Slot"}
                  </Button>
                  <Button
                    className="w-full h-11"
                    variant="ghost"
                    onClick={() => { setConflictSlot(null); setSelectedTime(null); }}
                  >
                    ← Choose a Different Time
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 text-center space-y-1">
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">You're on the waitlist!</p>
                  <p className="text-sm text-emerald-600 dark:text-emerald-500">We'll reach out to <strong>{formData.phone}</strong> if this slot opens up.</p>
                  <Button className="mt-2 w-full" variant="outline" onClick={() => { setConflictSlot(null); setWaitlistJoined(false); setSelectedTime(null); }}>
                    Choose a Different Time
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
