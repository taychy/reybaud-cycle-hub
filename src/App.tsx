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
import StudentPayments from "./pages/StudentPayments";
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
import CoachEventRecordDelAhora from "./pages/coach/CoachEventRecordDelAhora";
import CoachAttendance from "./pages/coach/CoachAttendance";
import CoachFeedback from "./pages/coach/CoachFeedback";
import StudentProgress from "./pages/StudentProgress";
import ManageCoaches from "./pages/admin/ManageCoaches";
import ManageAdmins from "./pages/admin/ManageAdmins";
import AdminDashboard from "./pages/admin/AdminDashboard";
import ManagePlanes from "./pages/admin/ManagePlanes";
import ManagePrecios from "./pages/admin/ManagePrecios";
import ManageSedes from "./pages/admin/ManageSedes";
import NotFound from "./pages/NotFound";
import RecordDelAhora from "./pages/events/RecordDelAhora";
import EventResults from "./pages/events/EventResults";
import EventManagement from "./pages/admin/EventManagement";
import Eventos from "./pages/Eventos";
import EventDetail from "./pages/EventDetail";
import CompleteRegistration from "./pages/CompleteRegistration";
import PendingApproval from "./pages/PendingApproval";

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
          <Route path="/completar-registro" element={<CompleteRegistration />} />
          <Route path="/pendiente-aprobacion" element={<PendingApproval />} />
          <Route path="/planes" element={<PlanSelection />} />
          <Route path="/pago-resultado" element={<PaymentResult />} />
          <Route path="/alumno" element={<StudentDashboard />} />
          <Route path="/alumno/pagos" element={<StudentPayments />} />
          <Route path="/alumno/progreso" element={<StudentProgress />} />
          <Route path="/crear-clave" element={<SetPassword />} />
          <Route path="/activar-cuenta" element={<SetPassword />} />
          <Route path="/asesoria" element={<Asesoria />} />
          <Route path="/instalar" element={<Install />} />
          <Route path="/coach/registro" element={<CoachRegister />} />
          <Route path="/coach" element={<CoachDashboard />} />
          <Route path="/coach/eventos/record-de-la-hora" element={<CoachEventRecordDelAhora />} />
          <Route path="/coach/asistencia" element={<CoachAttendance />} />
          <Route path="/coach/feedback" element={<CoachFeedback />} />
          <Route path="/eventos" element={<Eventos />} />
          <Route path="/eventos/:id" element={<EventDetail />} />
          <Route path="/eventos/record-de-la-hora" element={<RecordDelAhora />} />
          <Route path="/eventos/record-de-la-hora/mi-resultados" element={<EventResults />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/alumnos" replace />} />
            <Route path="alumnos" element={<ManageStudents />} />
            <Route path="importar-alumnos" element={<ImportStudents />} />
            <Route path="importar-plan" element={<ImportPlan />} />
            <Route path="entrenamientos" element={<Trainings />} />
            <Route path="coaches" element={<ManageCoaches />} />
            <Route path="planes" element={<ManagePlanes />} />
            <Route path="precios" element={<ManagePrecios />} />
            <Route path="sedes" element={<ManageSedes />} />
            <Route path="admins" element={<ManageAdmins />} />
            <Route path="eventos/record-de-la-hora" element={<EventManagement />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
