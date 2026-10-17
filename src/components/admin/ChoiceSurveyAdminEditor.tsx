import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import type { ChoiceSurveyConfig } from '@/lib/choiceSurvey';
import type { ChoiceAdminEntry } from '@/lib/choiceSurveyAdmin';

export default function ChoiceSurveyAdminEditor({ reservationId, survey, entry, onSaved, onClose }: { reservationId: string; survey: ChoiceSurveyConfig; entry?: ChoiceAdminEntry; onSaved: () => void; onClose: () => void }) {
  const [value, setValue] = useState(entry?.confirmed_value ?? 'pending');
  const [candidates, setCandidates] = useState(entry?.candidates ?? []);
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const options = survey.options.filter(o => !o.needs_follow_up);
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('event_choice_survey_admin_entries').upsert({ reservation_id: reservationId, survey_key: survey.key, status: value === 'pending' ? 'pending' : 'confirmed', confirmed_value: value === 'pending' ? null : value, candidates: value === 'pending' ? candidates : [], notes }, { onConflict: 'reservation_id,survey_key' });
    setSaving(false);
    if (error) { toast({ title: 'No se pudo guardar el talle administrativo', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Talle administrativo guardado. Encuesta intacta.' }); onSaved(); onClose();
  };
  return <div className="space-y-3 border-t pt-3">
    <p className="text-sm font-medium">Registro de Administración</p>
    <Select value={value} onValueChange={setValue}><SelectTrigger aria-label="Talle administrativo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pendiente</SelectItem>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>
    {value === 'pending' && <fieldset><legend className="text-xs text-muted-foreground mb-2">Alternativas (no se incluyen en el pedido)</legend><div className="flex flex-wrap gap-3">{options.map(o => <label key={o.value} className="flex items-center gap-1.5 text-sm"><Checkbox checked={candidates.includes(o.value)} onCheckedChange={checked => setCandidates(prev => checked === true ? [...prev, o.value] : prev.filter(v => v !== o.value))} />{o.label}</label>)}</div></fieldset>}
    <Input aria-label="Observaciones administrativas" placeholder="Observaciones" value={notes} onChange={e => setNotes(e.target.value)} />
    <div className="flex gap-2"><Button size="sm" disabled={saving} onClick={save}>Guardar registro admin</Button><Button size="sm" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button></div>
  </div>;
}