/**
 * Detección de alumnos duplicados.
 *
 * Causa raíz histórica: la única clave única real en la tabla `alumnos` es el
 * email. Si la misma persona se registra con otro email (gmail vs yahoo), o si
 * escribe su nombre completo en el campo "Nombre" (ej. "Maja Steovic" +
 * apellido "Steovic"), el sistema crea una ficha nueva sin detectarlo.
 *
 * Este helper agrega claves de detección adicionales:
 *  - teléfono normalizado (AR)
 *  - documento
 *  - nombre completo normalizado (sin acentos, sin espacios, sin repetición
 *    del apellido dentro del nombre)
 */

import { normalizePhoneAR } from "@/lib/phoneNormalize";

export interface DuplicateCandidate {
  id: string;
  nombre: string | null;
  apellido?: string | null;
  email: string | null;
  telefono?: string | null;
  documento?: string | null;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Clave canónica de nombre: minúsculas, sin acentos ni espacios, sin apellido repetido. */
export function fullNameKey(nombre: string | null, apellido: string | null | undefined): string {
  const n = stripAccents((nombre || "").toLowerCase()).replace(/\s+/g, " ").trim();
  const a = stripAccents((apellido || "").toLowerCase()).replace(/\s+/g, " ").trim();
  // "maja steovic" + "steovic" → "maja steovic"
  const nSinApellido = a && n.endsWith(` ${a}`) ? n.slice(0, -(a.length + 1)).trim() : n;
  return `${nSinApellido} ${a}`.replace(/[^a-z0-9]/g, "").trim();
}

export type DuplicateReason = "email" | "telefono" | "documento" | "nombre";

export interface DuplicateIndex {
  /** ids que participan de al menos un grupo duplicado */
  ids: Set<string>;
  /** id → motivos por los que se lo marcó */
  reasons: Map<string, DuplicateReason[]>;
  /** id → ids de las otras fichas del mismo grupo */
  matches: Map<string, Set<string>>;
}

export function buildDuplicateIndex(alumnos: DuplicateCandidate[]): DuplicateIndex {
  const ids = new Set<string>();
  const reasons = new Map<string, DuplicateReason[]>();
  const matches = new Map<string, Set<string>>();

  const addGroup = (group: DuplicateCandidate[], reason: DuplicateReason) => {
    if (group.length < 2) return;
    for (const a of group) {
      ids.add(a.id);
      const r = reasons.get(a.id) || [];
      if (!r.includes(reason)) r.push(reason);
      reasons.set(a.id, r);
      const m = matches.get(a.id) || new Set<string>();
      group.forEach((b) => b.id !== a.id && m.add(b.id));
      matches.set(a.id, m);
    }
  };

  const bucket = (keyFn: (a: DuplicateCandidate) => string | null, reason: DuplicateReason) => {
    const map = new Map<string, DuplicateCandidate[]>();
    for (const a of alumnos) {
      const k = keyFn(a);
      if (!k) continue;
      const arr = map.get(k) || [];
      arr.push(a);
      map.set(k, arr);
    }
    map.forEach((group) => addGroup(group, reason));
  };

  bucket((a) => (a.email ? a.email.toLowerCase().trim() || null : null), "email");
  bucket((a) => normalizePhoneAR(a.telefono), "telefono");
  bucket((a) => {
    const d = (a.documento || "").replace(/\D/g, "");
    return d.length >= 7 ? d : null;
  }, "documento");
  bucket((a) => fullNameKey(a.nombre, a.apellido) || null, "nombre");

  return { ids, reasons, matches };
}

export const DUPLICATE_REASON_LABEL: Record<DuplicateReason, string> = {
  email: "mismo email",
  telefono: "mismo teléfono",
  documento: "mismo documento",
  nombre: "mismo nombre y apellido",
};
