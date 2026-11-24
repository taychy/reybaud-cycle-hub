import { useQuery } from "@tanstack/react-query";
import { fetchTarifaVigente, type TarifaTipo } from "@/lib/tarifaVigente";

export function useTarifasVigentes(tipo: TarifaTipo, ids: string[], fecha: string | null | undefined) {
  const key = [...ids].sort().join(",");
  const { data } = useQuery({
    queryKey: ["tarifas-vigentes", tipo, key, fecha],
    enabled: !!fecha && ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const entries = await Promise.all(ids.map(async (id) => [id, await fetchTarifaVigente(tipo, id, fecha!)] as const));
      return Object.fromEntries(entries) as Record<string, number | null>;
    },
  });
  return data ?? {};
}
