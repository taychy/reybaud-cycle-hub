import { describe, it, expect } from 'vitest';
import { buildContractSections, bookableSpots, reschedulingRefundAmount, INTERNAL_PROPOSALS, RESCHEDULE_CAUSES, packageGroup, type Occupant } from './sanLuis2027Contract';

describe('San Luis 2027 contrato borrador', () => {
  it('12 secciones pendientes, sin fechas ni plazo de 2026', () => {
    for (const c of ['full', 'mini'] as const) {
      const s = buildContractSections(c);
      expect(s).toHaveLength(12);
      expect(s.every(x => x.status === 'pendiente_validacion')).toBe(true);
      const all = s.map(x => x.body).join(' ');
      expect(all).not.toMatch(/30\/09\/2026|120 días/);
      expect(all).not.toMatch(/15 ?%/);
    }
    expect(buildContractSections('mini').map(x => x.body).join(' ')).not.toContain('17/01');
  });
  it('15% es propuesta interna no vigente y el reintegro no la descuenta', () => {
    expect(INTERNAL_PROPOSALS[0].vigente).toBe(false);
    expect(INTERNAL_PROPOSALS[0].aplicaAutomaticamente).toBe(false);
    expect(reschedulingRefundAmount(1000000)).toBe(1000000);
    expect(RESCHEDULE_CAUSES.operativo_organizador.forceMajeure).toBe(false);
  });
  it('mapea paquetes a inventario físico compartido', () => {
    expect(packageGroup('Mini Camp · Cabaña sin almuerzo ni cena')).toBe('cabana_3_plazas');
    expect(packageGroup('Camp completo · Cabaña con almuerzo y cena')).toBe('cabana_3_plazas');
    expect(packageGroup('Camp completo · Habitación individual')).toBe('hotel_individual');
  });
});

describe('San Luis 2027 cupo solapado', () => {
  it('sin inventario o límite simultáneo confirmado, cierra', () => {
    expect(bookableSpots({ inventory: {}, simultaneousCap: 40, occupants: [] }, 'mini', 'hotel_doble')).toEqual({ spots: 0, blockers: ['inventario'] });
    expect(bookableSpots({ inventory: { hotel_doble: 20 }, simultaneousCap: null, occupants: [] }, 'mini', 'hotel_doble').spots).toBe(0);
  });
  it('el Mini comparte plazas 21–24 con el completo y no sobrevende', () => {
    const full: Occupant[] = Array.from({ length: 9 }, () => ({ camp: 'full', group: 'cabana_3_plazas' }));
    const r = bookableSpots({ inventory: { cabana_3_plazas: 12 }, simultaneousCap: 40, occupants: full }, 'mini', 'cabana_3_plazas');
    expect(r.spots).toBe(3);
  });
  it('no suma 30+15: respeta el límite simultáneo confirmado', () => {
    const full: Occupant[] = Array.from({ length: 30 }, () => ({ camp: 'full', group: 'hotel_doble' }));
    expect(bookableSpots({ inventory: { hotel_doble: 60 }, simultaneousCap: 36, occupants: full }, 'mini', 'hotel_doble').spots).toBe(6);
    expect(bookableSpots({ inventory: { hotel_doble: 60 }, simultaneousCap: 36, occupants: full }, 'full', 'hotel_doble').spots).toBe(0);
  });
  it('el Mini no consume noches 18–20 del completo', () => {
    const mini: Occupant[] = Array.from({ length: 4 }, () => ({ camp: 'mini', group: 'hotel_individual' }));
    expect(bookableSpots({ inventory: { hotel_individual: 4 }, simultaneousCap: 50, occupants: mini }, 'full', 'hotel_individual').spots).toBe(0);
  });
});
