import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

const ROLE_CHECK_TIMEOUT_MS = 7000;

export function useDepositoAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isDeposito, setIsDeposito] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  // 1) Restauramos sesión primero. No marcamos loading=false hasta que
  //    authReady sea true; si no, el layout redirige al login antes de
  //    que Supabase termine de recuperar la sesión del storage.
  //    Listener SINCRÓNICO de cambios de auth. No hacemos awaits acá
  //    (causaría deadlock con el cliente de Supabase y dejaría la app
  //    pegada en "Cargando…"). Solo guardamos el user.
  useEffect(() => {
    let cancelled = false;
    let sessionRestored = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "INITIAL_SESSION") return;
      setUser(session?.user ?? null);
      if (sessionRestored) setAuthReady(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      sessionRestored = true;
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // 2) Cuando cambia el user, chequeamos el rol fuera del callback.
  useEffect(() => {
    let cancelled = false;
    if (!authReady) return;

    if (!user) {
      setIsDeposito(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const roleCheck = supabase.rpc("has_role", {
          _user_id: user.id,
          _role: "deposito" as any,
        });
        const timeout = new Promise<{ data: false }>((resolve) => {
          window.setTimeout(() => resolve({ data: false }), ROLE_CHECK_TIMEOUT_MS);
        });
        const { data } = await Promise.race([roleCheck, timeout]);
        if (!cancelled) setIsDeposito(!!data);
      } catch {
        if (!cancelled) setIsDeposito(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { user, isDeposito, loading, login, logout };
}
