# Auditoría: punto de equilibrio — Rimini_2027 (solo lectura, sin cambios)

Simulación 56394949… · escenario activo "Conservador" (8 = 4 doble + 4 individual) · modo honorario €400 · imprevistos 5% · margen objetivo guardado 30%.

## 1) Fórmula actual (src/lib/eventCostCalculator.ts, líneas 394-397)

```text
margen_unit_prom = ganancia_estimada_total / inscriptos      = 3.200 / 8 = 400
punto_equilibrio = ceil( costos_fijos x 1,05 / margen_unit_prom )
                 = ceil( 4.453 x 1,05 / 400 ) = ceil(4.675,65 / 400) = ceil(11,69) = 12
```
Costos fijos = staff €2.418,15 + generales €2.257,50 (con imprevistos) = €4.675,65.

## 2) Por qué 8 personas ganan €3.200 y aun así dice 12

La fórmula divide los fijos por la **ganancia** por persona (€400), que ya tiene los fijos descontados. Los fijos se restan dos veces. El divisor correcto es la **contribución** por persona (precio menos costo variable), no la ganancia neta. El 12 no es break-even: es "cuántas personas hacen falta para que el honorario de €400 cubra por sí solo todos los fijos otra vez".

## 3) Break-even real con los precios actuales

Costo variable por persona (con imprevistos): participante €655,20 + alojamiento (doble €838,95 / individual €1.069,95).

```text
Doble:      2.478,61 - 838,95  - 655,20 = 984,46 de contribución
Individual: 2.709,61 - 1.069,95 - 655,20 = 984,46 de contribución (iguales: el suplemento €231 = diferencia de hotel)
Break-even = 4.675,65 / 984,46 = 4,75  ->  5 participantes (cualquier mezcla)
Control: 8 x 984,46 - 4.675,65 = 3.200  (coincide con el simulador)
```
Con 12 participantes la ganancia sería de unos €7.138, no cero. Con 20 sería de unos €15.014.

## 4) Margen objetivo 30% vs honorario €400

- En modo honorario, el 30% **no se usa** en ningún cálculo (líneas 380-382). Es un valor viejo que quedó guardado.
- No altera los precios, pero confunde: el margen real a 8 personas es 15,4%, a 20 cerca del 31%. Cualquier pantalla o informe que compare contra "objetivo 30%" muestra una alerta falsa.

## 5) Otros supuestos desalineados

- **El precio está fijado al escenario de 8**: los fijos se reparten entre 8 (€584/pax). Si se venden 20, la ganancia sube, pero el precio publicado no cambia. Es coherente si es intencional (precio conservador).
- **Distribución 4/4 (50% individuales)** vs. capacidad comercial de 10 dobles + 10 individuales. Como la contribución es igual en ambos paquetes, la mezcla no cambia el resultado.
- **tc_eur 1.753 / tc_usd 1.580** guardados en la simulación: sirven solo como referencia, porque todos los ítems están en EUR. Igual pueden diferir de la cotización vigente de la app y del monto en pesos con +7%.
- **El recargo ARS del 7% no es ingreso**: correcto que no figure. El break-even supone cobro íntegro en EUR.
- **Staff de una persona** y **picnic de Montefiore sin costo**: son supuestos pendientes de confirmar (ya reportados). Cambian los fijos y, por eso, el break-even.
- `aplicada_a_packages_at` es del 26/08, pero la simulación se actualizó el 28/09. Hoy los precios coinciden con lo sugerido, así que no hay desfase.

## Conclusión

El "12" sale de una fórmula que resta los costos fijos dos veces. Con los precios actuales, el viaje cubre costos con **5 participantes**. El 30% no tiene efecto con el honorario elegido.

## Posible corrección (solo si se autoriza, no incluida en esta auditoría)

- En el modo honorario y en el de margen, calcular el break-even como fijos / (ingreso − variables) / inscriptos. Agregar un test con este caso (resultado 5).
- En modo honorario, ocultar el margen objetivo o marcarlo como "no aplica".
