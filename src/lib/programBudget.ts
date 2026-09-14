export interface ProgramBudgetItemLike {
  cantidad: number | null;
  costo_unitario: number | null;
  costo_real: number | null;
}

export const calculateProgramBudget = (
  items: ProgramBudgetItemLike[],
  participantesBase: number,
  precioLista: number,
) => {
  const participantes = Math.max(1, Number(participantesBase) || 1);
  const presupuestoTotal = items.reduce(
    (sum, item) => sum + (Number(item.cantidad) || 0) * (Number(item.costo_unitario) || 0),
    0,
  );
  const costoReal = items.reduce((sum, item) => sum + (Number(item.costo_real) || 0), 0);
  const ingresosProyectados = (Number(precioLista) || 0) * participantes;

  return {
    presupuestoTotal,
    costoReal,
    costoPorInscripto: presupuestoTotal / participantes,
    ingresosProyectados,
    resultadoProyectado: ingresosProyectados - presupuestoTotal,
  };
};
