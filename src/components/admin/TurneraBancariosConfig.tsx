import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Landmark } from "lucide-react";

const KEYS = [
  { key: "turnera_titular", label: "Titular" },
  { key: "turnera_cuit", label: "CUIT" },
  { key: "turnera_cbu", label: "CBU" },
  { key: "turnera_alias", label: "Alias" },
] as const;

const TurneraBancariosConfig = () => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("app_config")
      .select("key, value")
      .in("key", KEYS.map(k => k.key));
    const map: Record<string, string> = {};
    for (const row of (data || []) as any[]) {
      map[row.key] = typeof row.value === "string" ? row.value : (row.value ?? "");
    }
    setValues(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      for (const k of KEYS) {
        const val = (values[k.key] || "").trim();
        const { error } = await supabase
          .from("app_config")
          .upsert(
            { key: k.key, value: val as any, description: `${k.label} para transferencias de turnera` } as any,
            { onConflict: "key" }
          );
        if (error) throw error;
      }
      toast({ title: "Datos bancarios guardados" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "No se pudo guardar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-primary" />
          <div>
            <p className="font-medium text-foreground">Datos bancarios para transferencias</p>
            <p className="text-xs text-muted-foreground">
              Estos datos se muestran al alumno cuando elige pagar por transferencia.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {KEYS.map(k => (
            <div key={k.key} className="space-y-1">
              <Label className="text-xs">{k.label}</Label>
              <Input
                value={values[k.key] || ""}
                onChange={(e) => setValues({ ...values, [k.key]: e.target.value })}
              />
            </div>
          ))}
        </div>

        <Button onClick={save} disabled={saving}>
          {saving ? "Guardando..." : "Guardar datos bancarios"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default TurneraBancariosConfig;
