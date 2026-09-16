from pathlib import Path

path = Path("src/components/admin/EventCostSimulator.tsx")
text = path.read_text()
old = '''  /** Aplica la VENTA Reybaud vigente a los supuestos TC USD/EUR de esta simulación. */
  const aplicarCotizacionVigente = () => {
    if (!current || !fxBook) return;
    patchCurrent({
      tc_usd: fxBook.currencies.USD.sell,
      tc_eur: fxBook.currencies.EUR.sell,
    });
    setTimeout(guardarCambios, 0);
  };'''
new = '''  /** Aplica y persiste la VENTA Reybaud vigente en los supuestos USD/EUR. */
  const aplicarCotizacionVigente = async () => {
    if (!current || !fxBook) return;
    const patch = {
      tc_usd: fxBook.currencies.USD.sell,
      tc_eur: fxBook.currencies.EUR.sell,
    };
    patchCurrent(patch);
    const { error } = await supabase.from("event_cost_simulations")
      .update(patch)
      .eq("id", current.id);
    if (error) {
      toast({ title: "No se pudo aplicar la cotización", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Cotización vigente aplicada" });
  };'''
if old not in text:
    raise SystemExit("Expected aplicarCotizacionVigente block not found")
path.write_text(text.replace(old, new, 1))
print("EventCostSimulator FX persistence patched")
