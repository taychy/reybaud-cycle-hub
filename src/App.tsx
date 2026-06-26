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
import WhatsAppConciliador from "./pages/admin/WhatsAppConciliador";
import WhatsAppHistorial from "./pages/admin/WhatsAppHistorial";
import Trainings from "./pages/admin/Trainings";
import Install from "./pages/Install";
import Asesoria from "./pages/Asesoria";
import CoachRegister from "./pages/CoachRegister";
import CoachDashboard from "./pages/coach/CoachDashboard";
import CoachEventRecordDelAhora from "./pages/coach/CoachEventRecordDelAhora";
import CoachAttendance from "./pages/coach/CoachAttendance";
import CoachAlumnos from "./pages/coach/CoachAlumnos";
import CoachFeedback from "./pages/coach/CoachFeedback";
import CoachLiquidaciones from "./pages/coach/CoachLiquidaciones";
import CoachEntrenamientos from "./pages/coach/CoachEntrenamientos";
import CoachAsesoria from "./pages/coach/CoachAsesoria";
import StudentProgress from "./pages/StudentProgress";
import ManageCoaches from "./pages/admin/ManageCoaches";
import ManageAdmins from "./pages/admin/ManageAdmins";
import AdminDashboard from "./pages/admin/AdminDashboard";
import SuperAdminDashboard from "./pages/admin/SuperAdminDashboard";
import SuperAdminGastos from "./pages/admin/SuperAdminGastos";
import SuperAdminControl from "./pages/admin/SuperAdminControl";
import SuperAdminEstadoEscuela from "./pages/admin/SuperAdminEstadoEscuela";
import ManagePlanes from "./pages/admin/ManagePlanes";
import ManageDescuentos from "./pages/admin/ManageDescuentos";
import ManagePrecios from "./pages/admin/ManagePrecios";
import ManageSedes from "./pages/admin/ManageSedes";
import NotFound from "./pages/NotFound";
import AuditLog from "./pages/admin/AuditLog";
import SolicitudesCambioPlan from "./pages/admin/SolicitudesCambioPlan";
import AdminPayments from "./pages/admin/AdminPayments";
import AdminCuentaCorriente from "./pages/admin/AdminCuentaCorriente";
import AdminBilling from "./pages/admin/billing/AdminBilling";
import RecordDelAhora from "./pages/events/RecordDelAhora";
import EventResults from "./pages/events/EventResults";
import EventManagement from "./pages/admin/EventManagement";
import EventsList from "./pages/admin/EventsList";
import Eventos from "./pages/Eventos";
import EventDetail from "./pages/EventDetail";
import MisReservas from "./pages/MisReservas";
import CompleteRegistration from "./pages/CompleteRegistration";
import PendingApproval from "./pages/PendingApproval";
import StoreDashboard from "./pages/admin/store/StoreDashboard";
import StoreProducts from "./pages/admin/store/StoreProducts";
import StoreCategories from "./pages/admin/store/StoreCategories";
import StoreOrders from "./pages/admin/store/StoreOrders";
import StorePreorders from "./pages/admin/store/StorePreorders";
import StoreVentas from "./pages/admin/store/StoreVentas";
import StorePromotions from "./pages/admin/store/StorePromotions";
import StoreBanners from "./pages/admin/store/StoreBanners";
import StoreStock from "./pages/admin/store/StoreStock";
import StoreAnalytics from "./pages/admin/store/StoreAnalytics";
import StoreCambios from "./pages/admin/store/StoreCambios";
import DepositoCambios from "./pages/deposito/DepositoCambios";
import ManageDeposito from "./pages/admin/ManageDeposito";
import DepositoLayout from "./pages/deposito/DepositoLayout";
import DepositoStock from "./pages/deposito/DepositoStock";
import DepositoMovimientos from "./pages/deposito/DepositoMovimientos";
import DepositoAlertas from "./pages/deposito/DepositoAlertas";
import DepositoVentas from "./pages/deposito/DepositoVentas";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import ExternalTripView from "./pages/ExternalTripView";
import PublicPreorderPage from "./pages/PublicPreorderPage";
import PreorderPagoRedirect from "./pages/PreorderPagoRedirect";
import PreorderAlumnoPagoRedirect from "./pages/PreorderAlumnoPagoRedirect";
import PublicCuentaCorriente from "./pages/PublicCuentaCorriente";
import AuthCallback from "./pages/AuthCallback";
import UpdatePrompt from "./components/UpdatePrompt";
import VersionBadge from "./components/VersionBadge";
import AdminLiquidaciones from "./pages/admin/AdminLiquidaciones";
import AdminTurnera from "./pages/admin/AdminTurnera";
import AdminBajas from "./pages/admin/AdminBajas";

import AdminAsesoria from "./pages/admin/AdminAsesoria";
import BookingFlow from "./pages/booking/BookingFlow";
import TurneraConfirmacion from "./pages/booking/TurneraConfirmacion";
import BookingLanding from "./pages/booking/BookingLanding";
import ImpersonateStudent from "./pages/admin/ImpersonateStudent";
import AdminNovedades from "./pages/admin/AdminNovedades";
import AdminEmailTemplates from "./pages/admin/AdminEmailTemplates";
import AdminBroadcasts from "./pages/admin/AdminBroadcasts";
import AdminGestionRedes from "./pages/admin/AdminGestionRedes";

import { ImpersonationProvider } from "./contexts/ImpersonationContext";
import ProtectedRoute from "./components/ProtectedRoute";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ImpersonationProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <UpdatePrompt />
      <VersionBadge />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/registro" element={<Register />} />
          <Route path="/completar-registro" element={<CompleteRegistration />} />
          <Route path="/pendiente-aprobacion" element={<PendingApproval />} />
          <Route path="/planes" element={<PlanSelection />} />
          <Route path="/pago-resultado" element={<PaymentResult />} />
          <Route path="/alumno" element={<ProtectedRoute allowedRoles={["alumno", "admin"]} loginPath="/"><StudentDashboard /></ProtectedRoute>} />
          <Route path="/alumno/dashboard" element={<ProtectedRoute allowedRoles={["alumno", "admin"]} loginPath="/"><StudentDashboard /></ProtectedRoute>} />
          <Route path="/alumno/inicio" element={<ProtectedRoute allowedRoles={["alumno", "admin"]} loginPath="/"><StudentDashboard /></ProtectedRoute>} />
          <Route path="/alumno/eventos" element={<ProtectedRoute allowedRoles={["alumno", "admin"]} loginPath="/"><StudentDashboard /></ProtectedRoute>} />
          <Route path="/alumno/tienda" element={<ProtectedRoute allowedRoles={["alumno", "admin"]} loginPath="/"><StudentDashboard /></ProtectedRoute>} />
          <Route path="/alumno/mas" element={<ProtectedRoute allowedRoles={["alumno", "admin"]} loginPath="/"><StudentDashboard /></ProtectedRoute>} />
          <Route path="/alumno/pagos" element={<ProtectedRoute allowedRoles={["alumno", "admin"]} loginPath="/"><StudentPayments /></ProtectedRoute>} />
          <Route path="/alumno/progreso" element={<ProtectedRoute allowedRoles={["alumno", "admin"]} loginPath="/"><StudentDashboard /></ProtectedRoute>} />
          <Route path="/alumno/progreso/full" element={<ProtectedRoute allowedRoles={["alumno", "admin"]} loginPath="/"><StudentProgress /></ProtectedRoute>} />
          <Route path="/crear-clave" element={<SetPassword />} />
          <Route path="/activar-cuenta" element={<SetPassword />} />
          <Route path="/asesoria" element={<Asesoria />} />
          <Route path="/politica-privacidad" element={<PrivacyPolicy />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/instalar" element={<Install />} />
          <Route path="/coach/registro" element={<CoachRegister />} />
          <Route path="/coach" element={<ProtectedRoute allowedRoles={["coach"]} loginPath="/admin/login"><CoachDashboard /></ProtectedRoute>} />
          <Route path="/coach/alumnos" element={<ProtectedRoute allowedRoles={["coach"]} loginPath="/admin/login"><CoachAlumnos /></ProtectedRoute>} />
          <Route path="/coach/entrenamientos" element={<ProtectedRoute allowedRoles={["coach"]} loginPath="/admin/login"><CoachEntrenamientos /></ProtectedRoute>} />
          <Route path="/coach/eventos/record-de-la-hora" element={<ProtectedRoute allowedRoles={["coach"]} loginPath="/admin/login"><CoachEventRecordDelAhora /></ProtectedRoute>} />
          <Route path="/coach/asistencia" element={<ProtectedRoute allowedRoles={["coach"]} loginPath="/admin/login"><CoachAttendance /></ProtectedRoute>} />
          <Route path="/coach/feedback" element={<ProtectedRoute allowedRoles={["coach"]} loginPath="/admin/login"><CoachFeedback /></ProtectedRoute>} />
          <Route path="/coach/liquidaciones" element={<ProtectedRoute allowedRoles={["coach"]} loginPath="/admin/login"><CoachLiquidaciones /></ProtectedRoute>} />
          <Route path="/coach/asesoria" element={<ProtectedRoute allowedRoles={["coach"]} loginPath="/admin/login"><CoachAsesoria /></ProtectedRoute>} />
          <Route path="/eventos" element={<Eventos />} />
          {/* Landing pública email-only del Record (uso vía QR). Auto-detecta el evento record_hora activo. */}
          <Route path="/eventos/record-de-la-hora" element={<RecordDelAhora />} />
          <Route path="/eventos/record-de-la-hora/mi-resultados" element={<EventResults />} />
          <Route path="/eventos/:id" element={<EventDetail />} />
          <Route path="/mis-reservas/:id" element={<MisReservas />} />
          <Route path="/admin/ver-como/:alumnoId" element={<ProtectedRoute allowedRoles={["admin"]} loginPath="/admin/login"><ImpersonateStudent /></ProtectedRoute>} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<ProtectedRoute allowedRoles={["admin", "deposito"]} loginPath="/admin/login"><AdminLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/admin/resumen" replace />} />
            <Route path="resumen" element={<AdminDashboard />} />
            <Route path="alumnos" element={<ManageStudents />} />
            <Route path="whatsapp-conciliador" element={<WhatsAppConciliador />} />
            <Route path="whatsapp-historial" element={<WhatsAppHistorial />} />
            <Route path="entrenamientos" element={<Trainings />} />
            <Route path="entrenamientos" element={<Trainings />} />
            <Route path="coaches" element={<ManageCoaches />} />
            <Route path="asesoria" element={<AdminAsesoria />} />
            <Route path="planes" element={<ManagePlanes />} />
            <Route path="precios" element={<ManagePrecios />} />
            <Route path="descuentos" element={<ManageDescuentos />} />
            <Route path="pagos" element={<AdminPayments />} />
            <Route path="cuenta-corriente" element={<AdminCuentaCorriente />} />
            <Route path="facturacion" element={<AdminBilling />} />
            <Route path="sedes" element={<ManageSedes />} />
            <Route path="admins" element={<ManageAdmins />} />
            <Route path="eventos" element={<EventsList />} />
            <Route path="novedades" element={<AdminNovedades />} />
            <Route path="eventos/record-de-la-hora" element={<Navigate to="/admin/eventos" replace />} />
            <Route path="eventos/record-de-la-hora/participantes" element={<EventManagement />} />
            <Route path="eventos/participantes" element={<EventManagement />} />
            <Route path="deposito" element={<ManageDeposito />} />
            <Route path="historial" element={<AuditLog />} />
            <Route path="solicitudes-cambio-plan" element={<SolicitudesCambioPlan />} />
            <Route path="comunicaciones" element={<AdminEmailTemplates />} />
            <Route path="email-masivo" element={<AdminBroadcasts />} />

            <Route path="metricas" element={<SuperAdminDashboard />} />
            {/* <Route path="estado-escuela" element={<SuperAdminEstadoEscuela />} /> */}
            <Route path="gastos" element={<SuperAdminGastos />} />
            <Route path="centro-control" element={<SuperAdminControl />} />
            <Route path="gestion-redes" element={<AdminGestionRedes />} />
            
            <Route path="liquidaciones" element={<AdminLiquidaciones />} />
            <Route path="turnera" element={<AdminTurnera />} />
            <Route path="bajas" element={<AdminBajas />} />
            <Route path="tienda" element={<StoreDashboard />} />

            <Route path="tienda/productos" element={<StoreProducts />} />
            <Route path="tienda/categorias" element={<StoreCategories />} />
            <Route path="tienda/ventas" element={<StoreVentas />} />
            <Route path="tienda/pedidos" element={<Navigate to="/admin/tienda/ventas?tab=pedidos" replace />} />
            <Route path="tienda/preventas" element={<Navigate to="/admin/tienda/ventas?tab=preventas" replace />} />
            <Route path="tienda/pedidos-legacy" element={<StoreOrders />} />
            <Route path="tienda/preventas-legacy" element={<StorePreorders />} />
            <Route path="tienda/promociones" element={<StorePromotions />} />
            <Route path="tienda/banners" element={<StoreBanners />} />
            <Route path="tienda/stock" element={<StoreStock />} />
            <Route path="tienda/analytics" element={<StoreAnalytics />} />
            <Route path="tienda/cambios" element={<StoreCambios />} />
          </Route>
          <Route path="/deposito/login" element={<Navigate to="/admin/login?returnTo=/deposito" replace />} />
          <Route path="/deposito" element={<ProtectedRoute allowedRoles={["deposito"]} loginPath="/admin/login?returnTo=/deposito"><DepositoLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/deposito/stock" replace />} />
            <Route path="stock" element={<DepositoStock />} />
            <Route path="ventas" element={<DepositoVentas />} />
            <Route path="pedidos" element={<Navigate to="/deposito/ventas?tab=pedidos" replace />} />
            <Route path="preventas" element={<Navigate to="/deposito/ventas?tab=preventas" replace />} />
            <Route path="movimientos" element={<DepositoMovimientos />} />
            <Route path="alertas" element={<DepositoAlertas />} />
            <Route path="cambios" element={<DepositoCambios />} />
          </Route>
          <Route path="/reservar" element={<BookingLanding />} />
          <Route path="/reservar/confirmacion" element={<TurneraConfirmacion />} />
          <Route path="/reservar/:slug" element={<BookingFlow />} />
          <Route path="/viaje/mi-reserva" element={<ExternalTripView />} />
          <Route path="/preventa/:productId" element={<PublicPreorderPage />} />
          <Route path="/pagar-preventa/:preorderId" element={<PreorderPagoRedirect />} />
          <Route path="/pagar-preventas-alumno/:alumnoId" element={<PreorderAlumnoPagoRedirect />} />
          <Route path="/cuenta/:token" element={<PublicCuentaCorriente />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </ImpersonationProvider>
  </QueryClientProvider>
);

export default App;
