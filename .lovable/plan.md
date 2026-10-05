# Mapa cuenta receptora -> emisor fiscal (a completar con la usuaria)

Nada se modifica hasta que la usuaria confirme cada fila.

## Decisiones pendientes
| Medio / cuenta | Hoy | Emisor a definir |
|---|---|---|
| Efectivo (escuela) | sin emisor; escuela tiene 2 habilitados | ? |
| Transferencia | no hay CBU/CVU/alias de cobro cargado | ? (y cuenta destino) |
| mp_externo (genérico) | sin dueño | ? |
| mp_externo_claudio | cuenta Claudio, sin emisor propio | ¿Claudio? |
| mp_externo_josi | cuenta Josilene, sin emisor propio | ¿Josilene? |
| Plataforma externa | sin emisor | ? |
| Turnera (cuenta Josilene) | sin emisor | ? (fuera de fase 1) |
| Escuela: Claudio y Josilene habilitados | ambiguo | ¿dejar solo uno? |

## Al confirmar
1. Cargar los emisores elegidos en la tabla de medios de pago y en las reglas por tipo de cobro, sin tocar los cobros ya facturados.
2. Registrar las cuentas de transferencia, si las hay, con los datos sensibles ocultos salvo los últimos 4 dígitos.
3. Volver a evaluar la cola de pendientes, solo para clasificarlos, sin emitir nada. Informar cuántos pasan de "revisar emisor" a un emisor resuelto.
4. La facturación automática sigue apagada.
