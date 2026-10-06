# Auditoría: Francisco Gutierrez (francngutierrez01@gmail.com)

This is a read-only audit. No code or data was changed.

## 1) "Tipo de documento inconsistente" in Facturación

**Data stored** (alumnos `d99d922a-...`):
- documento = `20332925777` (11 digits)
- tipo_documento = `dni`
- condicion_fiscal = `consumidor_final`

**Rule that triggers it**: the rule is `resolveFiscalIdentity` in `src/lib/fiscalIdentity.ts`. The same rule exists in SQL in migration `20260912213321_...sql`, line 154, which produces `tipo_inconsistente`.
- The type is inferred from the number, never from the student record. 11 digits with a valid check digit means CUIT (AFIP DocTipo 80). 7 or 8 digits means DNI (96).
- `20332925777` passes the CUIT check digit, so the system expects **CUIT** and would issue the invoice as CUIT 20-33292577-7.
- The student record says `dni`. Because the declared type does not match the number, `inconsistente = true` and the label "Tipo de documento inconsistente" shows (`TrayPendientes.tsx`, line 32).
- The warning is **non-blocking** (`blocking: false`). The invoice can still be issued, using CUIT.

**Root cause: a data problem.** The student record stores a CUIT/CUIL with its type set to DNI. Type inference, validation and invoicing logic all behave as designed.

**Minimal fix (data only, no code):** change `tipo_documento` to `cuit` (or `cuil`) in Francisco's record. Keep the number as it is, unless he confirms he wants invoices made out to his 8-digit DNI (`33292577`). The ficha cannot edit `tipo_documento` today (see note in point 2), so this needs a one-off data update approved by you.

## 2) "Editar" in the student ficha shows empty fields

**Files involved:** `src/pages/admin/ManageStudents.tsx`
- The edit form state is `detailForm` (line 178). It starts empty.
- `detailForm` is filled only inside `openDrawer(alumno)` (lines 694–709) and again after saving.
- Read mode renders `drawerAlumno` directly. Edit mode renders `detailForm`. These are two separate state objects.

**Root cause: an initialization bug.** When the ficha is opened from a link with `?alumno=ID`, the effect at lines 183–188 calls `setDrawerAlumno(found)` directly instead of `openDrawer(found)`.
- `drawerAlumno` gets filled, so read mode looks correct.
- `detailForm` keeps its empty initial values, so the inputs show up empty.
- Facturación links to the student exactly this way (`TrayPendientes.tsx`, line 390). Inconsistencias and Programas do too.
- Opening the ficha by clicking a row in the student list works, because that goes through `openDrawer`.

Risk: saving from that empty form would send `nombre: ""` and set the email, phone, DNI and birth date to empty or null. That would **delete real data**.

**Minimal recommended fix (one line):** in the effect at line 187, replace `setDrawerAlumno(found)` with `openDrawer(found)`. A complementary safeguard: when "Editar" is clicked, rebuild `detailForm` from the current `drawerAlumno`. That also covers other places that update `drawerAlumno` without refreshing the form (group, sede, `onAlumnoUpdate`).

Note: the edit form has no `tipo_documento` field. If you want to fix point 1 from the UI later, a selector for it would need to be added. That is optional and outside the minimal fix.

## Suggested next step (requires your approval)
1. Apply the one-line fix (plus the optional safeguard) in `ManageStudents.tsx`.
2. Update Francisco's `tipo_documento` to `cuit`, as a one-off data change.
