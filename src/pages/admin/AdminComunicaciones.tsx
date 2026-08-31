import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { MessageCircle, Megaphone, Mail, CalendarDays, History } from "lucide-react";
import WhatsAppConciliador from "./WhatsAppConciliador";
import AdminBroadcasts from "./AdminBroadcasts";
import AdminEmailTemplates from "./AdminEmailTemplates";
import ComunicacionesCalendario from "@/components/admin/ComunicacionesCalendario";
import ComunicacionesHistorial from "@/components/admin/ComunicacionesHistorial";

const VALID = ["calendario", "historial", "plantillas", "email-masivo", "whatsapp"] as const;
type Tab = (typeof VALID)[number];

/**
 * Hub de Comunicaciones. Tabs principales: Calendario | Historial | Plantillas.
 * Email masivo y WhatsApp siguen accesibles como acciones secundarias
 * (misma ruta con ?tab=), sin perder funcionalidad.
 */
const AdminComunicaciones = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab") as Tab | null;
  const tab: Tab = raw && VALID.includes(raw) ? raw : "calendario";

  const onTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "calendario") next.delete("tab");
    else next.set("tab", value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Comunicaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Qué emails envió la app, cómo salieron y el historial completo de envíos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={tab === "email-masivo" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => onTabChange("email-masivo")}
          >
            <Megaphone className="w-4 h-4" /> Email masivo
          </Button>
          <Button
            variant={tab === "whatsapp" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => onTabChange("whatsapp")}
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={onTabChange} className="w-full space-y-4">
        <TabsList className="bg-secondary">
          <TabsTrigger value="calendario" className="gap-1.5"><CalendarDays className="w-4 h-4" />Calendario</TabsTrigger>
          <TabsTrigger value="historial" className="gap-1.5"><History className="w-4 h-4" />Historial</TabsTrigger>
          <TabsTrigger value="plantillas" className="gap-1.5"><Mail className="w-4 h-4" />Plantillas</TabsTrigger>
        </TabsList>

        <TabsContent value="calendario" className="mt-0">
          <ComunicacionesCalendario />
        </TabsContent>
        <TabsContent value="historial" className="mt-0">
          <ComunicacionesHistorial />
        </TabsContent>
        <TabsContent value="plantillas" className="mt-0">
          <AdminEmailTemplates embedded />
        </TabsContent>
        <TabsContent value="email-masivo" className="mt-0">
          <AdminBroadcasts embedded />
        </TabsContent>
        <TabsContent value="whatsapp" className="mt-0">
          <WhatsAppConciliador embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminComunicaciones;
