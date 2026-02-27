import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import PlanSelection from "./pages/PlanSelection";
import PaymentResult from "./pages/PaymentResult";
import AdminLogin from "./pages/AdminLogin";
import StudentDashboard from "./pages/StudentDashboard";
import SetPassword from "./pages/SetPassword";
import AdminLayout from "./pages/admin/AdminLayout";
import ManageStudents from "./pages/admin/ManageStudents";
import ImportStudents from "./pages/admin/ImportStudents";
import ImportPlan from "./pages/admin/ImportPlan";
import Trainings from "./pages/admin/Trainings";
import Install from "./pages/Install";
import Asesoria from "./pages/Asesoria";
import CoachRegister from "./pages/CoachRegister";
import CoachDashboard from "./pages/coach/CoachDashboard";
import ManageCoaches from "./pages/admin/ManageCoaches";
import ManageAdmins from "./pages/admin/ManageAdmins";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/registro" element={<Register />} />
          <Route path="/planes" element={<PlanSelection />} />
          <Route path="/pago-resultado" element={<PaymentResult />} />
          <Route path="/alumno" element={<StudentDashboard />} />
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/asesoria" element={<Asesoria />} />
          <Route path="/instalar" element={<Install />} />
          <Route path="/coach/registro" element={<CoachRegister />} />
          <Route path="/coach" element={<CoachDashboard />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/alumnos" replace />} />
            <Route path="alumnos" element={<ManageStudents />} />
            <Route path="importar-alumnos" element={<ImportStudents />} />
            <Route path="importar-plan" element={<ImportPlan />} />
            <Route path="entrenamientos" element={<Trainings />} />
            <Route path="coaches" element={<ManageCoaches />} />
            <Route path="admins" element={<ManageAdmins />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
