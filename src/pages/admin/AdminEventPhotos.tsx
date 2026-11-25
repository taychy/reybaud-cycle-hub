import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Copy, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { canMarkPublishable, eventPhotosPublicPath, REVIEW_LABEL, type PhotoReviewStatus } from "@/lib/eventPhotos";

type Row = {
  id: string; event_id: string; storage_path: string; original_filename: string | null; mime_type: string; size_bytes: number;
  review_status: PhotoReviewStatus; reviewed_at: string | null; reviewed_by: string | null; created_at: string;
  submission: { submitter_name: string; submitter_email: string; publication_consent: boolean; publication_consent_at: string | null; publication_consent_text_version: string | null; ownership_accepted_at: string } | null;
};
const PUBLIC_ORIGIN = "https://reybaud-app.com";

export default function AdminEventPhotos() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const eventId = params.get("evento") || "";
  const status = params.get("estado") || "todos";
  const consent = params.get("consentimiento") || "todos";
  const q = params.get("q") || "";
  const from = params.get("desde") || "";
  const to = params.get("hasta") || "";
  const setParam = (k: string, v: string) => setParams((p) => { const n = new URLSearchParams(p); v ? n.set(k, v) : n.delete(k); return n; });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const events = useQuery({
    queryKey: ["admin-photo-events"],
    queryFn: async () => {
      const [{ data: evs, error }, { data: settings }] = await Promise.all([
        supabase.from("events").select("id,title,date").order("date", { ascending: false }).limit(300),
        supabase.from("event_photo_settings").select("event_id,enabled"),
      ]);
      if (error) throw error;
      const map = new Map((settings ?? []).map((s) => [s.event_id, s.enabled]));
      return (evs ?? []).map((e) => ({ ...e, enabled: map.get(e.id) === true }));
    },
  });

  const photos = useQuery({
    queryKey: ["admin-event-photos", eventId, status, consent, from, to],
    queryFn: async () => {
      let query = supabase.from("event_photos")
        .select("id,event_id,storage_path,original_filename,mime_type,size_bytes,review_status,reviewed_at,reviewed_by,created_at,submission:event_photo_submissions!inner(submitter_name,submitter_email,publication_consent,publication_consent_at,publication_consent_text_version,ownership_accepted_at)")
        .eq("upload_status", "stored").order("created_at", { ascending: false }).limit(500);
      if (eventId) query = query.eq("event_id", eventId);
      if (status !== "todos") query = query.eq("review_status", status);
      if (consent !== "todos") query = query.eq("submission.publication_consent", consent === "si");
      if (from) query = query.gte("created_at", `${from}T00:00:00-03:00`);
      if (to) query = query.lte("created_at", `${to}T23:59:59-03:00`);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as unknown as Row[];
      const previewable = rows.filter((r) => !r.mime_type.includes("hei"));
      const urls: Record<string, string> = {};
      if (previewable.length) {
        const { data: signed } = await supabase.storage.from("event-photos").createSignedUrls(previewable.map((r) => r.storage_path), 300);
        (signed ?? []).forEach((s) => { if (s.path && s.signedUrl) urls[s.path] = s.signedUrl; });
      }
      return { rows, urls };
    },
    staleTime: 240_000,
  });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (photos.data?.rows ?? []).filter((r) => !term || r.submission?.submitter_name.toLowerCase().includes(term) || r.submission?.submitter_email.toLowerCase().includes(term));
  }, [photos.data, q]);
  const pending = rows.filter((r) => r.review_status === "pendiente").length;
  const selectedRows = rows.filter((r) => selected.has(r.id));

  const toggleReception = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.rpc("admin_set_event_photo_reception", { p_event_id: id, p_enabled: enabled });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-photo-events"] }); toast.success("Recepción actualizada"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const review = useMutation({
    mutationFn: async ({ ids, next }: { ids: string[]; next: PhotoReviewStatus }) => {
      const { data, error } = await supabase.rpc("admin_review_event_photos", { p_photo_ids: ids, p_status: next });
      if (error) throw error;
      return data as { updated: number };
    },
    onSuccess: (d) => { setSelected(new Set()); qc.invalidateQueries({ queryKey: ["admin-event-photos"] }); toast.success(`${d.updated} foto(s) actualizadas`); },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyReview = (ids: string[], next: PhotoReviewStatus) => {
    const target = rows.filter((r) => ids.includes(r.id));
    if (next === "apta_publicacion" && !canMarkPublishable(target.map((r) => ({ publication_consent: !!r.submission?.publication_consent })))) {
      toast.error("Hay fotos sin consentimiento de difusión: no pueden marcarse aptas para publicar.");
      return;
    }
    review.mutate({ ids, next });
  };

  const download = async (r: Row) => {
    const { data, error } = await supabase.storage.from("event-photos").createSignedUrl(r.storage_path, 60, { download: r.original_filename || true });
    if (error || !data) { toast.error("No se pudo generar la descarga"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const currentEvent = events.data?.find((e) => e.id === eventId);
  const link = eventId ? `${PUBLIC_ORIGIN}${eventPhotosPublicPath(eventId)}` : "";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl uppercase flex items-center gap-2"><Camera className="h-6 w-6" />Fotos de eventos</h1>
        <p className="text-sm text-muted-foreground">Fotos enviadas por ciclistas. Ninguna se publica automáticamente.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <Select value={eventId || "todos"} onValueChange={(v) => setParam("evento", v === "todos" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Evento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los eventos</SelectItem>
            {(events.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.title} {e.date ? `· ${e.date}` : ""}{e.enabled ? " · recibiendo" : ""}</SelectItem>)}
          </SelectContent>
        </Select>
        {currentEvent && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2"><Switch checked={currentEvent.enabled} disabled={toggleReception.isPending} onCheckedChange={(v) => toggleReception.mutate({ id: currentEvent.id, enabled: v })} />Recepción de fotos {currentEvent.enabled ? "habilitada" : "deshabilitada"}</label>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copiado"); }}><Copy className="h-4 w-4 mr-1" />Copiar link público</Button>
            <span className="text-xs text-muted-foreground break-all">{link}</span>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Input placeholder="Buscar ciclista o email" value={q} onChange={(e) => setParam("q", e.target.value)} />
          <Select value={status} onValueChange={(v) => setParam("estado", v === "todos" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos los estados</SelectItem>{Object.entries(REVIEW_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={consent} onValueChange={(v) => setParam("consentimiento", v === "todos" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Cualquier autorización</SelectItem><SelectItem value="si">Autoriza difusión</SelectItem><SelectItem value="no">No autoriza difusión</SelectItem></SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setParam("desde", e.target.value)} aria-label="Desde" />
          <Input type="date" value={to} onChange={(e) => setParam("hasta", e.target.value)} aria-label="Hasta" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{rows.length} fotos</Badge>
        <Badge>{pending} pendientes</Badge>
        {selected.size > 0 && <>
          <span className="text-sm">{selected.size} seleccionadas:</span>
          <Button size="sm" disabled={review.isPending || !canMarkPublishable(selectedRows.map((r) => ({ publication_consent: !!r.submission?.publication_consent })))} onClick={() => applyReview([...selected], "apta_publicacion")}>Apta para publicar</Button>
          <Button size="sm" variant="secondary" disabled={review.isPending} onClick={() => applyReview([...selected], "solo_interna")}>Solo interna</Button>
          <Button size="sm" variant="destructive" disabled={review.isPending} onClick={() => applyReview([...selected], "rechazada")}>Rechazar</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpiar</Button>
        </>}
        {rows.length > 0 && <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(rows.map((r) => r.id)))}>Seleccionar todas</Button>}
      </div>

      {photos.isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        : photos.isError ? <p className="text-destructive text-sm">No se pudieron cargar las fotos.</p>
        : rows.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">No hay fotos con estos filtros.</p>
        : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {rows.map((r) => {
              const url = photos.data?.urls[r.storage_path];
              const sub = r.submission;
              return (
                <div key={r.id} className={`rounded-xl border bg-card overflow-hidden ${selected.has(r.id) ? "border-primary" : "border-border"}`}>
                  <div className="relative aspect-square bg-muted">
                    {url ? <img src={url} alt={r.original_filename || "Foto"} loading="lazy" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground p-2 text-center">HEIC: vista previa no disponible, descargá el original</div>}
                    <div className="absolute top-2 left-2 bg-background/80 rounded p-0.5">
                      <Checkbox checked={selected.has(r.id)} onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); v ? n.add(r.id) : n.delete(r.id); return n; })} aria-label="Seleccionar" />
                    </div>
                  </div>
                  <div className="p-2 space-y-1 text-xs">
                    <p className="font-semibold truncate">{sub?.submitter_name}</p>
                    <p className="text-muted-foreground truncate">{sub?.submitter_email}</p>
                    <p className="text-muted-foreground">{new Date(r.created_at).toLocaleString("es-AR")} · {(r.size_bytes / 1048576).toFixed(1)} MB</p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={r.review_status === "pendiente" ? "default" : "secondary"}>{REVIEW_LABEL[r.review_status]}</Badge>
                      <Badge variant={sub?.publication_consent ? "secondary" : "outline"}>{sub?.publication_consent ? "Autoriza difusión" : "Sin autorización de difusión"}</Badge>
                    </div>
                    {r.reviewed_at && <p className="text-muted-foreground">Revisada {new Date(r.reviewed_at).toLocaleString("es-AR")}</p>}
                    <div className="flex flex-wrap gap-1 pt-1">
                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => download(r)}><Download className="h-3.5 w-3.5" /></Button>
                      {sub?.publication_consent && <Button size="sm" className="h-7 px-2" disabled={review.isPending} onClick={() => applyReview([r.id], "apta_publicacion")}>Apta</Button>}
                      <Button size="sm" variant="secondary" className="h-7 px-2" disabled={review.isPending} onClick={() => applyReview([r.id], "solo_interna")}>Interna</Button>
                      <Button size="sm" variant="destructive" className="h-7 px-2" disabled={review.isPending} onClick={() => applyReview([r.id], "rechazada")}>Rechazar</Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
