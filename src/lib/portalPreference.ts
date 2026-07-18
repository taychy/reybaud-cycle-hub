import { supabase } from "@/integrations/supabase/client";

export type Portal = "admin" | "coach" | "deposito" | "alumno";

const REMEMBER_KEY = "reybaud:portalRemembered";

export const PORTAL_PATHS: Record<Portal, string> = {
  admin: "/admin",
  coach: "/coach",
  deposito: "/deposito",
  alumno: "/alumno",
};

export const PORTAL_LABELS: Record<Portal, string> = {
  admin: "Admin",
  coach: "Staff",
  deposito: "Depósito",
  alumno: "Alumno",
};

export function getRememberedPortal(): Portal | null {
  try {
    const v = localStorage.getItem(REMEMBER_KEY);
    if (v && ["admin", "coach", "deposito", "alumno"].includes(v)) return v as Portal;
    return null;
  } catch {
    return null;
  }
}

export function setRememberedPortal(portal: Portal | null) {
  try {
    if (portal) localStorage.setItem(REMEMBER_KEY, portal);
    else localStorage.removeItem(REMEMBER_KEY);
  } catch {}
}

/** Devuelve todos los portales disponibles para el usuario, chequeando roles + alumno. */
export async function getAvailablePortals(userId: string): Promise<Portal[]> {
  const [{ data: isAdmin }, { data: isCoach }, { data: isDeposito }, { data: alumno }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" as any }),
    supabase.rpc("has_role", { _user_id: userId, _role: "coach" as any }),
    supabase.rpc("has_role", { _user_id: userId, _role: "deposito" as any }),
    supabase.from("alumnos").select("id").eq("user_id", userId).maybeSingle(),
  ]);
  const portals: Portal[] = [];
  if (isAdmin) portals.push("admin");
  if (isCoach) portals.push("coach");
  if (isDeposito) portals.push("deposito");
  if (alumno) portals.push("alumno");
  return portals;
}
