import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Pencil, Plus, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { staffKey, type StaffJersey } from '@/lib/staffJerseys';
import type { ChoiceSurveyConfig } from '@/lib/choiceSurvey';

export default function StaffJerseysEditor({eventId,survey,entries,onSaved}: {eventId:string;survey:ChoiceSurveyConfig;entries:StaffJersey[];onSaved:()=>void}) {
  const [editing,setEditing] = useState<StaffJersey | 'new' | null>(null);
  const [name,setName] = useState('');
  const [size,setSize] = useState('');
  const [quantity,setQuantity] = useState('1');
  const [saving,setSaving] = useState(false);
  const [removing,setRemoving] = useState<StaffJersey | null>(null);
  const {toast} = useToast();
  const options = survey.options.filter(o => !o.needs_follow_up);
  const start = (entry?:StaffJersey) => {setEditing(entry ?? 'new');setName(entry?.recipient_name ?? '');setSize(entry?.size ?? '');setQuantity(String(entry?.quantity ?? 1));};
  const save = async () => {
    if (!editing || !staffKey(name) || !size || !Number.isInteger(Number(quantity)) || Number(quantity)<1 || Number(quantity)>100) return;
    setSaving(true);
    const values = {recipient_name:name.trim(),size,quantity:Number(quantity),active:true};
    const {error} = editing === 'new' ? await supabase.from('event_kit_additional_jerseys').upsert({...values,event_id:eventId,staff_key:staffKey(name)}, {onConflict:'event_id,staff_key'}) : await supabase.from('event_kit_additional_jerseys').update(values).eq('id',editing.id).eq('event_id',eventId);
    setSaving(false);
    if(error) {toast({title:'No se pudo guardar el jersey de staff',description:error.message,variant:'destructive'});return;}
    setEditing(null);onSaved();
  };
  const remove = async () => {
    if (!removing) return;
    setSaving(true);
    const {error} = await supabase.from('event_kit_additional_jerseys').update({active:false}).eq('id',removing.id).eq('event_id',eventId);
    setSaving(false);setRemoving(null);
    if(error) {toast({title:'No se pudo quitar el jersey',description:error.message,variant:'destructive'});return;}
    onSaved();
  };
  return <section aria-label="Jerseys de staff" className="space-y-3 border-t pt-4">
    <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">STAFF · Jerseys adicionales</h3><Button size="sm" variant="outline" onClick={()=>start()}><Plus className="h-4 w-4 mr-1"/>Sumar staff</Button></div>
    {entries.filter(e=>e.active).map(e=><div key={e.id} className="flex items-center justify-between gap-2 border-b pb-2 text-sm"><div className="min-w-0"><p className="font-medium break-words">{e.recipient_name}</p><p className="text-muted-foreground">Staff · {e.size} · Cantidad {e.quantity}</p></div><div className="flex shrink-0"><Button size="icon" variant="ghost" aria-label={`Editar staff ${e.recipient_name}`} onClick={()=>start(e)}><Pencil className="h-4 w-4"/></Button><Button size="icon" variant="ghost" aria-label={`Quitar staff ${e.recipient_name}`} onClick={()=>setRemoving(e)}><X className="h-4 w-4"/></Button></div></div>)}
    {editing && <div className="space-y-2">
      <Input aria-label="Nombre completo del staff" value={name} onChange={e=>setName(e.target.value)} readOnly={editing!=='new'} placeholder="Nombre completo"/>
      <div className="flex gap-2"><Select value={size} onValueChange={setSize}><SelectTrigger aria-label="Talle de staff"><SelectValue placeholder="Talle"/></SelectTrigger><SelectContent>{options.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select><Input aria-label="Cantidad de jerseys staff" type="number" min={1} max={100} value={quantity} onChange={e=>setQuantity(e.target.value)} className="w-24 shrink-0"/></div>
      <div className="flex gap-2"><Button size="sm" disabled={saving || !size || staffKey(name).length<3 || !Number.isInteger(Number(quantity)) || Number(quantity)<1 || Number(quantity)>100} onClick={save}>Guardar staff</Button><Button size="sm" variant="outline" disabled={saving} onClick={()=>setEditing(null)}>Cancelar</Button></div>
    </div>}
    <AlertDialog open={Boolean(removing)} onOpenChange={open=>{if(!open)setRemoving(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Quitar jersey de staff</AlertDialogTitle><AlertDialogDescription>{removing?.recipient_name} quedará fuera del pedido. El historial se conserva.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={remove}>Quitar del pedido</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}