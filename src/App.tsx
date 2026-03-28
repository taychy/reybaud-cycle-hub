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
import SuperAdminDashboard from "./pages/admin/SuperAdminDashboard";
import SuperAdminGastos from "./pages/admin/SuperAdminGastos";
import SuperAdminResumen from "./pages/admin/SuperAdminResumen";
import ManagePlanes from "./pages/admin/ManagePlanes";
import ManagePrecios from "./pages/admin/ManagePrecios";
import ManageSedes from "./pages/admin/ManageSedes";
import NotFound from "./pages/NotFound";
import AuditLog from "./pages/admin/AuditLog";
import AdminPayments from "./pages/admin/AdminPayments";
import AdminBilling from "./pages/admin/billing/AdminBilling";
import RecordDelAhora from "./pages/events/RecordDelAhora";
import EventResults from "./pages/events/EventResults";
import EventManagement from "./pages/admin/EventManagement";
import EventsList from "./pages/admin/EventsList";
import Eventos from "./pages/Eventos";
import EventDetail from "./pages/EventDetail";
import CompleteRegistration from "./pages/CompleteRegistration";
import PendingApproval from "./pages/PendingApproval";
import StoreDashboard from "./pages/admin/store/StoreDashboard";
import StoreProducts from "./pages/admin/store/StoreProducts";
import StoreCategories from "./pages/admin/store/StoreCategories";
import StoreOrders from "./pages/admin/store/StoreOrders";
import StorePromotions from "./pages/admin/store/StorePromotions";
import StoreBanners from "./pages/admin/store/StoreBanners";
import StoreStock from "./pages/admin/store/StoreStock";
import StoreAnalytics from "./pages/admin/store/StoreAnalytics";
import ManageDeposito from "./pages/admin/ManageDeposito";
import DepositoLogin from "./pages/deposito/DepositoLogin";
import DepositoLayout from "./pages/deposito/DepositoLayout";
import DepositoStock from "./pages/deposito/DepositoStock";
import DepositoMovimientos from "./pages/deposito/DepositoMovimientos";
import DepositoAlertas from "./pages/deposito/DepositoAlertas";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import UpdatePrompt from "./components/UpdatePrompt";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <UpdatePrompt />
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
          <Route path="/politica-privacidad" element={<PrivacyPolicy />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
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
            <Route index element={<Navigate to="/admin/resumen" replace />} />
            <Route path="resumen" element={<AdminDashboard />} />
            <Route path="alumnos" element={<ManageStudents />} />
            <Route path="entrenamientos" element={<Trainings />} />
            <Route path="entrenamientos" element={<Trainings />} />
            <Route path="coaches" element={<ManageCoaches />} />
            <Route path="planes" element={<ManagePlanes />} />
            <Route path="precios" element={<ManagePrecios />} />
            <Route path="pagos" element={<AdminPayments />} />
            <Route path="facturacion" element={<AdminBilling />} />
            <Route path="sedes" element={<ManageSedes />} />
            <Route path="admins" element={<ManageAdmins />} />
            <Route path="eventos" element={<EventsList />} />
            <Route path="eventos/record-de-la-hora" element={<Navigate to="/admin/eventos" replace />} />
            <Route path="eventos/record-de-la-hora/participantes" element={<EventManagement />} />
            <Route path="deposito" element={<ManageDeposito />} />
            <Route path="historial" element={<AuditLog />} />
            <Route path="metricas" element={<SuperAdminDashboard />} />
            <Route path="tienda" element={<StoreDashboard />} />
            <Route path="tienda/productos" element={<StoreProducts />} />
            <Route path="tienda/categorias" element={<StoreCategories />} />
            <Route path="tienda/pedidos" element={<StoreOrders />} />
            <Route path="tienda/promociones" element={<StorePromotions />} />
            <Route path="tienda/banners" element={<StoreBanners />} />
            <Route path="tienda/stock" element={<StoreStock />} />
            <Route path="tienda/analytics" element={<StoreAnalytics />} />
          </Route>
          <Route path="/deposito/login" element={<DepositoLogin />} />
          <Route path="/deposito" element={<DepositoLayout />}>
            <Route index element={<Navigate to="/deposito/stock" replace />} />
            <Route path="stock" element={<DepositoStock />} />
            <Route path="movimientos" element={<DepositoMovimientos />} />
            <Route path="alertas" element={<DepositoAlertas />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
