import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, Megaphone, Mail } from "lucide-react";
import WhatsAppConciliador from "./WhatsAppConciliador";
import AdminBroadcasts from "./AdminBroadcasts";
import AdminEmailTemplates from "./AdminEmailTemplates";

const VALID = ["whatsapp", "email-masivo", "plantillas"] as const;
type Tab = (typeof VALID)[number];

/** Hub único de Comunicaciones: WhatsApp, Email masivo y Plantillas. */
const AdminComunicaciones = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab") as Tab | null;
  const tab: Tab = raw && VALID.includes(raw) ? raw : "whatsapp";

  const onTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "whatsapp") next.delete("tab");
    else next.set("tab", value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Comunicaciones</h1>
        <p className="text-sm text-muted-foreground mt-1">
          WhatsApp, envíos masivos y plantillas automáticas en un solo lugar.
        </p>
      </div>

      <Tabs value={tab} onValueChange={onTabChange} className="w-full space-y-4">
        <TabsList className="bg-secondary">
          <TabsTrigger value="whatsapp" className="gap-1.5"><MessageCircle className="w-4 h-4" />WhatsApp</TabsTrigger>
          <TabsTrigger value="email-masivo" className="gap-1.5"><Megaphone className="w-4 h-4" />Email masivo</TabsTrigger>
          <TabsTrigger value="plantillas" className="gap-1.5"><Mail className="w-4 h-4" />Plantillas</TabsTrigger>
        </TabsList>

        <TabsContent value="whatsapp" className="mt-0">
          <WhatsAppConciliador embedded />
        </TabsContent>
        <TabsContent value="email-masivo" className="mt-0">
          <AdminBroadcasts embedded />
        </TabsContent>
        <TabsContent value="plantillas" className="mt-0">
          <AdminEmailTemplates embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminComunicaciones;
