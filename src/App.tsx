import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DynamicMeta } from "@/components/DynamicMeta";
import { ThemeApplier } from "@/components/ThemeApplier";
import StorePage from "./pages/StorePage";

const AdminPage = lazy(() => import("./pages/AdminPage"));
const AdminSignup = lazy(() => import("./pages/AdminSignup"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <div translate="no" className="notranslate">
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <DynamicMeta />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ThemeApplier />
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
          <Routes>
            <Route path="/" element={<StorePage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/signup" element={<AdminSignup />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </div>
);

export default App;
