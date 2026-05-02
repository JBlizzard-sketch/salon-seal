import { Switch, Route } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout";
import React from "react";

import Dashboard from "@/pages/dashboard";
import Bookings from "@/pages/bookings";
import Clients from "@/pages/clients";
import Analytics from "@/pages/analytics";
import Services from "@/pages/services";
import Staff from "@/pages/staff";
import Settings from "@/pages/settings";
import PublicBooking from "@/pages/public-booking";
import NewSalon from "@/pages/new-salon";

const queryClient = new QueryClient();

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{ padding: 32, fontFamily: "monospace", color: "red", background: "white", position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, overflow: "auto" }}>
          <h2>App Crashed</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{err.message}</pre>
          <pre style={{ whiteSpace: "pre-wrap" }}>{err.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoutes() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/bookings" component={Bookings} />
        <Route path="/clients" component={Clients} />
        <Route path="/services" component={Services} />
        <Route path="/staff" component={Staff} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/book/:slug" component={PublicBooking} />
      <Route path="/salons/new" component={NewSalon} />
      <Route component={ProtectedRoutes} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
