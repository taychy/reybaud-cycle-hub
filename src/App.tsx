import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import PlanSelection from "./pages/PlanSelection";
import Reingreso from "./pages/Reingreso";
import VincularEmail from "./pages/VincularEmail";

import PaymentResult from "./pages/PaymentResult";
import AdminLogin from "./pages/AdminLogin";
import StudentDashboard from "./pages/StudentDashboard";
import StudentPayments from "./pages/StudentPayments";
import SetPassword from "./pages/SetPassword";
import AdminLayout from "./pages/admin/AdminLayout";
import ManageStudents from "./pages/admin/ManageStudents";
import WhatsAppHistorial from "./pages/admin/WhatsAppHistorial";
import Trainings from "./pages/admin/Trainings";
import Install from "./pages/Install";
import Unsubscribe from "./pages/Unsubscribe";
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
import CoachChequeoAlumnos from "./pages/coach/CoachChequeoAlumnos";
import StudentProgress from "./pages/StudentProgress";
import ManageCoaches from "./pages/admin/ManageCoaches";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminResumen from "./pages/admin/AdminResumen";
import AdminComunicaciones from "./pages/admin/AdminComunicaciones";
import SuperAdminGastos from "./pages/admin/SuperAdminGastos";
import SuperAdminControl from "./pages/admin/SuperAdminControl";
import AdminPlanesPrecios from "./pages/admin/AdminPlanesPrecios";
import AdminConfiguracion from "./pages/admin/AdminConfiguracion";
import NotFound from "./pages/NotFound";
import AdminPagosHub from "./pages/admin/AdminPagosHub";
import AdminCuentaCorriente from "./pages/admin/AdminCuentaCorriente";
import AdminBilling from "./pages/admin/billing/AdminBilling";
import AdminEntregaDetail from "./pages/admin/AdminEntregaDetail";
import RecordDelAhora from "./pages/events/RecordDelAhora";
import EventResults from "./pages/events/EventResults";
import EventManagement from "./pages/admin/EventManagement";
import EventsList from "./pages/admin/EventsList";
import AdminProgramas from "./pages/admin/AdminProgramas";
import AdminProgramaDetalle from "./pages/admin/AdminProgramaDetalle";
import PlanPlaybookEditor from "./pages/admin/PlanPlaybookEditor";
import AdminProgramaFlujoRunner from "./pages/admin/AdminProgramaFlujoRunner";
import Eventos from "./pages/Eventos";
import EventDetail from "./pages/EventDetail";
import MisReservas from "./pages/MisReservas";
import GuestReservationView from "./pages/GuestReservationView";
import CompleteRegistration from "./pages/CompleteRegistration";
import PendingApproval from "./pages/PendingApproval";
import StoreDashboard from "./pages/admin/store/StoreDashboard";
import StoreProductosStock from "./pages/admin/store/StoreProductosStock";
import StoreVentasHub from "./pages/admin/store/StoreVentasHub";
import StoreBanners from "./pages/admin/store/StoreBanners";
import StorePedidosProveedorHub from "./pages/admin/store/StorePedidosProveedorHub";
import StoreAnalytics from "./pages/admin/store/StoreAnalytics";
import StoreCambios from "./pages/admin/store/StoreCambios";
import DepositoCambios from "./pages/deposito/DepositoCambios";
import ManageDeposito from "./pages/admin/ManageDeposito";
import DepositoLayout from "./pages/deposito/DepositoLayout";
import DepositoStock from "./pages/deposito/DepositoStock";
import DepositoMovimientos from "./pages/deposito/DepositoMovimientos";
import DepositoAlertas from "./pages/deposito/DepositoAlertas";
import DepositoProcesoRunner from "./pages/deposito/DepositoProcesoRunner";
import AdminProcessTemplates from "./pages/admin/AdminProcessTemplates";
import DepositoVentas from "./pages/deposito/DepositoVentas";
import DepositoEntregas from "./pages/deposito/DepositoEntregas";
import DepositoEntregaDetail from "./pages/deposito/DepositoEntregaDetail";
import DepositoCamioneta from "./pages/deposito/DepositoCamioneta";
import DepositoExternos from "./pages/deposito/DepositoExternos";
import DepositoConteos from "./pages/deposito/DepositoConteos";
import PublicDeliveryList from "./pages/PublicDeliveryList";
import SupplierOrders from "./pages/SupplierOrders";
import AdminScanIncidents from "./pages/admin/AdminScanIncidents";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import EventTerms from "./pages/EventTerms";
import ExternalTripView from "./pages/ExternalTripView";
import PublicPreorderPage from "./pages/PublicPreorderPage";
import PublicStore from "./pages/PublicStore";
import PublicProduct from "./pages/PublicProduct";
import EventInterest from "./pages/EventInterest";
import EventSurvey from "./pages/EventSurvey";
import PublicRoadbookTeaser from "./pages/PublicRoadbookTeaser";
import PreorderPagoRedirect from "./pages/PreorderPagoRedirect";
import PreorderAlumnoPagoRedirect from "./pages/PreorderAlumnoPagoRedirect";
import PublicCuentaCorriente from "./pages/PublicCuentaCorriente";
import AuthCallback from "./pages/AuthCallback";
import Portal from "./pages/Portal";
import UpdatePrompt from "./components/UpdatePrompt";
import VersionBadge from "./components/VersionBadge";
import AdminLiquidaciones from "./pages/admin/AdminLiquidaciones";
import AdminTurnera from "./pages/admin/AdminTurnera";
import AdminBajas from "./pages/admin/AdminBajas";
import FacturasPorDiaPage from "./pages/admin/dia/FacturasPorDiaPage";
import PagosPorDiaPage from "./pages/admin/dia/PagosPorDiaPage";
import BajasPorDiaPage from "./pages/admin/dia/BajasPorDiaPage";
import NuevosUsuariosPorDiaPage from "./pages/admin/dia/NuevosUsuariosPorDiaPage";

import AdminAsesoria from "./pages/admin/AdminAsesoria";
import BookingFlow from "./pages/booking/BookingFlow";
import TurneraConfirmacion from "./pages/booking/TurneraConfirmacion";
import TurneraTransferencia from "./pages/booking/TurneraTransferencia";
import BookingLanding from "./pages/booking/BookingLanding";
import ImpersonateStudent from "./pages/admin/ImpersonateStudent";
import AdminPriceAlertApproval from "./pages/admin/AdminPriceAlertApproval";
import AdminPackageChangeRequests from "./pages/admin/AdminPackageChangeRequests";
import AdminWaitlistRequests from "./pages/admin/AdminWaitlistRequests";
import AdminWaitlistTemplates from "./pages/admin/AdminWaitlistTemplates";
import AdminEventWaitlist from "./pages/admin/AdminEventWaitlist";
import EventWaitlistPage from "./pages/EventWaitlistPage";
import AdminGestionRedes from "./pages/admin/AdminGestionRedes";
import FormacionInicial from "./pages/FormacionInicial";

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
          <Route path="/portal" element={<Portal />} />
          <Route path="/registro" element={<Register />} />
          <Route path="/completar-registro" element={<CompleteRegistration />} />
          <Route path="/pendiente-aprobacion" element={<PendingApproval />} />
          <Route path="/planes" element={<PlanSelection />} />
          <Route path="/reingreso" element={<Reingreso />} />
          <Route path="/vincular-email" element={<VincularEmail />} />

          <Route path="/pago-resultado" element={<PaymentResult />} />
          <Route path="/interes/:eventId" element={<EventInterest />} />
          <Route path="/encuesta/:token" element={<EventSurvey />} />
          <Route path="/roadbook/:token" element={<PublicRoadbookTeaser />} />
          <Route path="/tienda" element={<PublicStore />} />
          <Route path="/tienda/producto/:id" element={<PublicProduct />} />
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
          <Route path="/terminos-eventos" element={<EventTerms />} />
          <Route path="/instalar" element={<Install />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="/formacion-inicial" element={<FormacionInicial />} />
          <Route path="/coach/registro" element={<CoachRegister />} />
          <Route path="/coach" element={<ProtectedRoute allowedRoles={["coach"]} loginPath="/admin/login"><CoachDashboard /></ProtectedRoute>} />
          <Route path="/coach/alumnos" element={<ProtectedRoute allowedRoles={["coach"]} loginPath="/admin/login"><CoachAlumnos /></ProtectedRoute>} />
          <Route path="/coach/entrenamientos" element={<ProtectedRoute allowedRoles={["coach"]} loginPath="/admin/login"><CoachEntrenamientos /></ProtectedRoute>} />
          <Route path="/coach/eventos/record-de-la-hora" element={<ProtectedRoute allowedRoles={["coach"]} loginPath="/admin/login"><CoachEventRecordDelAhora /></ProtectedRoute>} />
          <Route path="/coach/asistencia" element={<ProtectedRoute allowedRoles={["coach"]} loginPath="/admin/login"><CoachAttendance /></ProtectedRoute>} />
          <Route path="/coach/feedback" element={<ProtectedRoute allowedRoles={["coach"]} loginPath="/admin/login"><CoachFeedback /></ProtectedRoute>} />
          <Route path="/coach/liquidaciones" element={<ProtectedRoute allowedRoles={["coach"]} loginPath="/admin/login"><CoachLiquidaciones /></ProtectedRoute>} />
          <Route path="/coach/asesoria" element={<ProtectedRoute allowedRoles={["coach"]} loginPath="/admin/login"><CoachAsesoria /></ProtectedRoute>} />
          <Route path="/coach/chequeo-alumnos" element={<ProtectedRoute allowedRoles={["coach"]} loginPath="/admin/login"><CoachChequeoAlumnos /></ProtectedRoute>} />
          <Route path="/admin/chequeo-alumnos" element={<ProtectedRoute allowedRoles={["admin"]} loginPath="/admin/login"><CoachChequeoAlumnos adminMode /></ProtectedRoute>} />
          <Route path="/eventos" element={<Eventos />} />
          {/* Landing pública email-only del Record (uso vía QR). Auto-detecta el evento record_hora activo. */}
          <Route path="/eventos/record-de-la-hora" element={<RecordDelAhora />} />
          <Route path="/eventos/record-de-la-hora/mi-resultados" element={<EventResults />} />
          <Route path="/eventos/:id/lista-espera" element={<EventWaitlistPage />} />
          <Route path="/eventos/:id" element={<EventDetail />} />
          <Route path="/mis-reservas/:id" element={<MisReservas />} />
          <Route path="/mi-reserva/:token" element={<GuestReservationView />} />
          <Route path="/admin/ver-como/:alumnoId" element={<ProtectedRoute allowedRoles={["admin"]} loginPath="/admin/login"><ImpersonateStudent /></ProtectedRoute>} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<ProtectedRoute allowedRoles={["admin", "deposito"]} loginPath="/admin/login"><AdminLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/admin/resumen" replace />} />
            <Route path="resumen" element={<AdminResumen />} />
            <Route path="alumnos" element={<ManageStudents />} />
            <Route path="whatsapp-conciliador" element={<Navigate to="/admin/comunicaciones?tab=whatsapp" replace />} />
            <Route path="whatsapp-historial" element={<WhatsAppHistorial />} />
            <Route path="entrenamientos" element={<Trainings />} />
            <Route path="coaches" element={<ManageCoaches />} />
            <Route path="asesoria" element={<AdminAsesoria />} />
            <Route path="planes" element={<AdminPlanesPrecios />} />
            <Route path="planes-precios" element={<AdminPlanesPrecios />} />
            <Route path="precios" element={<Navigate to="/admin/planes-precios?tab=precios" replace />} />
            <Route path="descuentos" element={<Navigate to="/admin/planes-precios?tab=descuentos" replace />} />
            <Route path="pagos" element={<AdminPagosHub />} />
            <Route path="cierre-caja" element={<Navigate to="/admin/pagos?tab=cierre" replace />} />
            <Route path="cuenta-corriente" element={<AdminCuentaCorriente />} />
            <Route path="facturacion" element={<AdminBilling />} />
            <Route path="cobros-entrega" element={<Navigate to="/admin/tienda/ventas?tab=cobros-entrega" replace />} />
            <Route path="entregas-caja" element={<Navigate to="/admin/tienda/ventas?tab=entregas-caja" replace />} />
            <Route path="entregas" element={<Navigate to="/admin/tienda/ventas?tab=entregas-caja" replace />} />
            <Route path="entregas/:listId" element={<AdminEntregaDetail />} />
            <Route path="configuracion" element={<AdminConfiguracion />} />
            <Route path="sedes" element={<Navigate to="/admin/configuracion?tab=sedes" replace />} />
            <Route path="admins" element={<Navigate to="/admin/configuracion?tab=admins" replace />} />
            <Route path="eventos" element={<EventsList />} />
            <Route path="programas" element={<AdminProgramas />} />
            <Route path="programas/:cohortId" element={<AdminProgramaDetalle />} />
            <Route path="programas/:cohortId/flujo/:instanceId" element={<AdminProgramaFlujoRunner />} />
            <Route path="planes/:planId/playbook" element={<PlanPlaybookEditor />} />
            <Route path="eventos/record-de-la-hora" element={<Navigate to="/admin/eventos" replace />} />
            <Route path="eventos/record-de-la-hora/participantes" element={<EventManagement />} />
            <Route path="eventos/participantes" element={<EventManagement />} />
            <Route path="deposito" element={<ManageDeposito />} />
            <Route path="historial" element={<Navigate to="/admin/configuracion?tab=historial" replace />} />
            <Route path="solicitudes-cambio-plan" element={<Navigate to="/admin/alumnos?tab=cambios-plan" replace />} />
            <Route path="comunicaciones" element={<AdminComunicaciones />} />
            <Route path="email-masivo" element={<Navigate to="/admin/comunicaciones?tab=email-masivo" replace />} />
            <Route path="aprobar-aviso-precio" element={<AdminPriceAlertApproval />} />
            <Route path="cambios-paquete" element={<AdminPackageChangeRequests />} />
            <Route path="solicitudes-alojamiento" element={<AdminWaitlistRequests />} />
            <Route path="waitlist-plantillas" element={<AdminWaitlistTemplates />} />
            <Route path="eventos/:id/lista-espera" element={<AdminEventWaitlist />} />

            <Route path="metricas" element={<Navigate to="/admin/resumen?tab=metricas" replace />} />
            <Route path="gastos" element={<SuperAdminGastos />} />
            <Route path="centro-control" element={<SuperAdminControl />} />
            <Route path="gestion-redes" element={<AdminGestionRedes />} />
            
            <Route path="liquidaciones" element={<AdminLiquidaciones />} />
            <Route path="turnera" element={<AdminTurnera />} />
            <Route path="bajas" element={<AdminBajas />} />
            <Route path="facturacion/por-dia" element={<FacturasPorDiaPage />} />
            <Route path="pagos/por-dia" element={<PagosPorDiaPage />} />
            <Route path="bajas/por-dia" element={<BajasPorDiaPage />} />
            <Route path="alumnos/nuevos-por-dia" element={<NuevosUsuariosPorDiaPage />} />
            <Route path="tienda" element={<StoreDashboard />} />

            <Route path="tienda/productos" element={<StoreProductosStock />} />
            <Route path="tienda/categorias" element={<Navigate to="/admin/tienda/productos?tab=categorias" replace />} />
            <Route path="tienda/ventas" element={<StoreVentasHub />} />
            <Route path="tienda/pedidos" element={<Navigate to="/admin/tienda/ventas?tab=pedidos" replace />} />
            <Route path="tienda/preventas" element={<Navigate to="/admin/tienda/ventas?tab=preventas" replace />} />
            <Route path="tienda/promociones" element={<Navigate to="/admin/tienda/productos?tab=promociones" replace />} />
            <Route path="tienda/banners" element={<StoreBanners />} />
            <Route path="tienda/stock" element={<Navigate to="/admin/tienda/productos?tab=stock" replace />} />
            <Route path="tienda/proveedores" element={<Navigate to="/admin/tienda/pedidos-proveedor?tab=proveedores" replace />} />
            <Route path="tienda/analytics" element={<StoreAnalytics />} />
            <Route path="tienda/cambios" element={<StoreCambios />} />
            <Route path="tienda/pedidos-proveedor" element={<StorePedidosProveedorHub />} />
            <Route path="tienda/incidentes-escaneo" element={<AdminScanIncidents />} />
            <Route path="tienda/control-mercaderia" element={<Navigate to="/admin/tienda/pedidos-proveedor?tab=control" replace />} />
            <Route path="procesos" element={<Navigate to="/admin/configuracion?tab=procesos" replace />} />
            <Route path="procesos/plantillas" element={<AdminProcessTemplates />} />
            <Route path="procesos/runner/:instanceId" element={<AdminProgramaFlujoRunner />} />
          </Route>
          <Route path="/deposito/login" element={<Navigate to="/admin/login?returnTo=/deposito" replace />} />
          <Route path="/deposito" element={<ProtectedRoute allowedRoles={["deposito"]} loginPath="/admin/login?returnTo=/deposito"><DepositoLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/deposito/alertas" replace />} />
            <Route path="stock" element={<DepositoStock />} />
            <Route path="ventas" element={<DepositoVentas />} />
            <Route path="pedidos" element={<Navigate to="/deposito/ventas?tab=pedidos" replace />} />
            <Route path="preventas" element={<Navigate to="/deposito/ventas?tab=preventas" replace />} />
            <Route path="movimientos" element={<DepositoMovimientos />} />
            <Route path="conteos" element={<DepositoConteos />} />
            <Route path="alertas" element={<DepositoAlertas />} />
            <Route path="cambios" element={<DepositoCambios />} />
            <Route path="pedidos-proveedor" element={<SupplierOrders />} />
            <Route path="entregas" element={<DepositoEntregas />} />
            <Route path="entregas/:id" element={<DepositoEntregaDetail />} />
            <Route path="externos" element={<DepositoExternos />} />
            <Route path="camioneta" element={<DepositoCamioneta />} />
            <Route path="camioneta/:id" element={<DepositoCamioneta />} />
            <Route path="procesos/:instanceId" element={<DepositoProcesoRunner />} />
          </Route>
          <Route path="/entrega/:token" element={<PublicDeliveryList />} />
          <Route path="/reservar" element={<BookingLanding />} />
          <Route path="/reservar/confirmacion" element={<TurneraConfirmacion />} />
          <Route path="/reservar/:id/transferencia" element={<TurneraTransferencia />} />
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
