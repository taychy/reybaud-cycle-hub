import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export function useDepositoAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isDeposito, setIsDeposito] = useState(false);
  const [loading, setLoading] = useState(true);

  // 1) Listener SINCRÓNICO de cambios de auth. No hacemos awaits acá
  //    (causaría deadlock con el cliente de Supabase y dejaría la app
  //    pegada en "Cargando…"). Solo guardamos el user.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2) Cuando cambia el user, chequeamos el rol fuera del callback.
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setIsDeposito(false);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase.rpc("has_role", {
          _user_id: user.id,
          _role: "deposito" as any,
        });
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
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { user, isDeposito, loading, login, logout };
}
