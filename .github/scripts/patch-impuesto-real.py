from pathlib import Path

path = Path("src/components/admin/EventCostSimulator.tsx")
s = path.read_text()


def rep(old: str, new: str, label: str) -> None:
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperaba 1 coincidencia y encontré {count}")
    s = s.replace(old, new, 1)


rep(
    """  distribucion?: Record<string, number>;
  /** Porcentaje estimado de ventas cobradas por medios bancarizados. */
  pct_cobros_bancarizados?: number;
""",
    """  distribucion?: Record<string, number>;
""",
    "interface escenario",
)

rep(
    """    (e: EscenarioInscripcion): EscenarioInscripcion => {
      const pctBancarizado = Math.min(100, Math.max(0, Number(e.pct_cobros_bancarizados ?? 100)));
      const base: EscenarioInscripcion = {
        id: String(e.id),
        nombre: String(e.nombre || ""),
        inscriptos: Number(e.inscriptos) || 0,
        pct_cobros_bancarizados: pctBancarizado,
      };
""",
    """    (e: EscenarioInscripcion): EscenarioInscripcion => {
      const base: EscenarioInscripcion = {
        id: String(e.id),
        nombre: String(e.nombre || ""),
        inscriptos: Number(e.inscriptos) || 0,
      };
""",
    "normalizar escenario",
)

rep(
    """  const calculo = useMemo(() => {
    if (!supuestos) return null;
    const base = calcularSimulacion(items, modalidades, supuestos);
    const pctCobrosBancarizados = Math.min(
      100,
      Math.max(0, Number(escenarioActivo?.pct_cobros_bancarizados ?? 100)),
    );
    const ingreso = base.escenario_ingreso_total;
    const impuestoBancarizado = ingreso != null
      ? ingreso * (pctCobrosBancarizados / 100) * (IMPUESTO_BANCARIZADO_PCT / 100)
      : null;
    const gananciaBruta = base.escenario_ganancia_total;
    const gananciaNeta = gananciaBruta != null && impuestoBancarizado != null
      ? gananciaBruta - impuestoBancarizado
      : gananciaBruta;
    const margenNeto = ingreso != null && ingreso > 0 && gananciaNeta != null
      ? gananciaNeta / ingreso
      : base.escenario_margen;
    return {
      ...base,
      pct_cobros_bancarizados: pctCobrosBancarizados,
      pct_impuesto_bancarizado: IMPUESTO_BANCARIZADO_PCT,
      impuesto_bancarizado_estimado: impuestoBancarizado,
      escenario_ganancia_bruta_total: gananciaBruta,
      escenario_ganancia_total: gananciaNeta,
      escenario_margen: margenNeto,
    };
  }, [items, modalidades, supuestos, escenarioActivo?.pct_cobros_bancarizados]);
""",
    """  const calculo = useMemo(() => {
    if (!supuestos) return null;
    return calcularSimulacion(items, modalidades, supuestos);
  }, [items, modalidades, supuestos]);
""",
    "calculo estimado",
)

rep(
    """                <div><Label className=\"text-xs\">% Impuesto bancarizado</Label>
                  <Input type=\"number\" value={IMPUESTO_BANCARIZADO_PCT} disabled />
                  <p className=\"text-[10px] text-muted-foreground mt-1\">Sobre precio de venta; efectivo 0%.</p>
                </div>
""",
    "",
    "supuesto impuesto",
)

rep(
    """                    El total de inscriptos del escenario activo es el denominador del prorrateo de los costos generales del viaje. El % bancarizado estima el impuesto del 5% sobre las ventas no cobradas en efectivo.
""",
    """                    El total de inscriptos del escenario activo es el denominador del prorrateo de los costos generales del viaje.
""",
    "descripcion escenarios",
)

rep(
    """                    inscriptos: escenarioActivo?.inscriptos || 0,
                    pct_cobros_bancarizados: escenarioActivo?.pct_cobros_bancarizados ?? 100,
""",
    """                    inscriptos: escenarioActivo?.inscriptos || 0,
""",
    "nuevo escenario",
)

rep(
    """                        <div className=\"flex items-center gap-2\">
                          <Label className=\"text-[10px] text-muted-foreground\">% cobros bancarizados</Label>
                          <Input type=\"number\" min={0} max={100} className=\"h-8 w-24\"
                            value={e.pct_cobros_bancarizados ?? 100}
                            onChange={(ev) => {
                              const pct = Math.min(100, Math.max(0, Number(ev.target.value)));
                              const next = escenarios.map((x, i) => i === idx ? { ...x, pct_cobros_bancarizados: pct } : x);
                              patchCurrent({ escenarios_inscripcion: next });
                            }}
                            onBlur={() => persistEscenarios(escenarios)} />
                        </div>
""",
    "",
    "campo bancarizado escenario",
)

rep(
    """                      <div>Cobros bancarizados: {calculo.pct_cobros_bancarizados}%</div>
                      <div>Impuesto: {IMPUESTO_BANCARIZADO_PCT}% sobre venta bancarizada</div>
""",
    "",
    "detalle impuesto estimado",
)

rep(
    """                  <div className=\"grid grid-cols-2 md:grid-cols-4 gap-3 text-sm\">
                    <div className=\"bg-muted/40 rounded p-3\">
                      <div className=\"text-xs text-muted-foreground\">Ingreso del escenario</div>
                      <div className=\"font-semibold\">
                        {calculo.escenario_ingreso_total != null
                          ? formatPrice(calculo.escenario_ingreso_total, current.moneda_base) : \"—\"}
                      </div>
                    </div>
                    <div className=\"bg-muted/40 rounded p-3\">
                      <div className=\"text-xs text-muted-foreground\">Impuesto bancarizado estimado</div>
                      <div className=\"font-semibold\">
                        {calculo.impuesto_bancarizado_estimado != null
                          ? formatPrice(calculo.impuesto_bancarizado_estimado, current.moneda_base) : \"—\"}
                      </div>
                      <div className=\"text-[10px] text-muted-foreground\">
                        {calculo.pct_cobros_bancarizados}% de ventas × {IMPUESTO_BANCARIZADO_PCT}%
                      </div>
                    </div>
                    <div className=\"bg-muted/40 rounded p-3\">
                      <div className=\"text-xs text-muted-foreground\">Ganancia neta del escenario</div>
                      <div className=\"font-semibold\">
                        {calculo.escenario_ganancia_total != null
                          ? formatPrice(calculo.escenario_ganancia_total, current.moneda_base) : \"—\"}
                      </div>
                    </div>
                    <div className=\"bg-muted/40 rounded p-3\">
                      <div className=\"text-xs text-muted-foreground\">Margen neto del escenario</div>
                      <div className={`font-semibold ${(calculo.escenario_margen ?? 0) < 0 ? \"text-destructive\" : \"text-emerald-500\"}`}>
                        {calculo.escenario_margen != null ? `${(calculo.escenario_margen * 100).toFixed(1)}%` : \"—\"}
                      </div>
                    </div>
                  </div>
""",
    """                  <div className=\"grid grid-cols-2 md:grid-cols-3 gap-3 text-sm\">
                    <div className=\"bg-muted/40 rounded p-3\">
                      <div className=\"text-xs text-muted-foreground\">Ingreso del escenario</div>
                      <div className=\"font-semibold\">
                        {calculo.escenario_ingreso_total != null
                          ? formatPrice(calculo.escenario_ingreso_total, current.moneda_base) : \"—\"}
                      </div>
                    </div>
                    <div className=\"bg-muted/40 rounded p-3\">
                      <div className=\"text-xs text-muted-foreground\">Ganancia del escenario</div>
                      <div className=\"font-semibold\">
                        {calculo.escenario_ganancia_total != null
                          ? formatPrice(calculo.escenario_ganancia_total, current.moneda_base) : \"—\"}
                      </div>
                    </div>
                    <div className=\"bg-muted/40 rounded p-3\">
                      <div className=\"text-xs text-muted-foreground\">Margen del escenario</div>
                      <div className={`font-semibold ${(calculo.escenario_margen ?? 0) < 0 ? \"text-destructive\" : \"text-emerald-500\"}`}>
                        {calculo.escenario_margen != null ? `${(calculo.escenario_margen * 100).toFixed(1)}%` : \"—\"}
                      </div>
                    </div>
                  </div>
""",
    "resultados estimados",
)

rep(
    """                  <div className=\"grid grid-cols-2 md:grid-cols-4 gap-3 text-sm\">
                    <div className=\"bg-muted/40 rounded p-3\">
                      <div className=\"text-xs text-muted-foreground\">Impuesto estimado</div>
                      <div className=\"font-semibold\">
                        {formatPrice(calculo.impuesto_bancarizado_estimado || 0, current.moneda_base)}
                      </div>
                      <div className=\"text-[10px] text-muted-foreground\">Según % bancarizado del escenario</div>
                    </div>
                    <div className=\"bg-muted/40 rounded p-3\">
                      <div className=\"text-xs text-muted-foreground\">Impuesto real</div>
                      <div className=\"font-semibold\">{formatPrice(impuestoBancarizadoReal, current.moneda_base)}</div>
                      <div className=\"text-[10px] text-muted-foreground\">5% de pagos validados no efectivos</div>
                    </div>
                    <div className=\"bg-muted/40 rounded p-3\">
                      <div className=\"text-xs text-muted-foreground\">Costo total estimado</div>
                      <div className=\"font-semibold\">
                        {formatPrice(calculo.total_con_imprevistos + (calculo.impuesto_bancarizado_estimado || 0), current.moneda_base)}
                      </div>
                    </div>
                    <div className=\"bg-muted/40 rounded p-3\">
                      <div className=\"text-xs text-muted-foreground\">Costo total real</div>
                      <div className=\"font-semibold\">
                        {formatPrice(calculoReal.total_con_imprevistos + impuestoBancarizadoReal, current.moneda_base)}
                      </div>
                    </div>
                  </div>
""",
    """                  <div className=\"grid grid-cols-1 md:grid-cols-3 gap-3 text-sm\">
                    <div className=\"bg-muted/40 rounded p-3\">
                      <div className=\"text-xs text-muted-foreground\">Impuesto real por cobros bancarizados</div>
                      <div className=\"font-semibold\">{formatPrice(impuestoBancarizadoReal, current.moneda_base)}</div>
                      <div className=\"text-[10px] text-muted-foreground\">{IMPUESTO_BANCARIZADO_PCT}% de pagos validados no efectivos</div>
                    </div>
                    <div className=\"bg-muted/40 rounded p-3\">
                      <div className=\"text-xs text-muted-foreground\">Costo total estimado</div>
                      <div className=\"font-semibold\">
                        {formatPrice(calculo.total_con_imprevistos, current.moneda_base)}
                      </div>
                      <div className=\"text-[10px] text-muted-foreground\">El presupuesto no supone medio de pago</div>
                    </div>
                    <div className=\"bg-muted/40 rounded p-3\">
                      <div className=\"text-xs text-muted-foreground\">Costo total real</div>
                      <div className=\"font-semibold\">
                        {formatPrice(calculoReal.total_con_imprevistos + impuestoBancarizadoReal, current.moneda_base)}
                      </div>
                      <div className=\"text-[10px] text-muted-foreground\">Incluye impuesto real de cobros bancarizados</div>
                    </div>
                  </div>
""",
    "comparativa impuesto real",
)

rep(
    """                      <div className=\"text-xs text-muted-foreground\">Desvío total incl. impuesto</div>
                      {(() => {
                        const est = calculo.total_con_imprevistos + (calculo.impuesto_bancarizado_estimado || 0);
""",
    """                      <div className=\"text-xs text-muted-foreground\">Desvío total (real incluye impuesto)</div>
                      {(() => {
                        const est = calculo.total_con_imprevistos;
""",
    "desvio total",
)

if "pct_cobros_bancarizados" in s:
    raise SystemExit("Quedó una referencia a pct_cobros_bancarizados")
if "impuesto_bancarizado_estimado" in s:
    raise SystemExit("Quedó una referencia a impuesto_bancarizado_estimado")
if "const impuestoBancarizadoReal = useMemo" not in s:
    raise SystemExit("Se perdió el cálculo del impuesto real")
if 'if (!metodo || metodo === "efectivo") return total;' not in s:
    raise SystemExit("Se perdió la exclusión de efectivo")

path.write_text(s)
