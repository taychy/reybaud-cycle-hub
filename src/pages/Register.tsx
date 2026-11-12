import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { checkDocumento, type TipoDocumento } from "@/lib/documentoAlumno";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, ArrowLeft } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import logo from "@/assets/logo.png";

const DRAFT_KEY = "reybaud_registro_borrador_v1";
const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const emptyForm = { nombre: "", apellido: "", email: "", telefono: "", documento: "" };

// Sólo conservamos datos generales durante esta pestaña. Nunca guardamos el documento.
function loadDraft() {
  let draft = { ...emptyForm };
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (typeof saved.savedAt === "number" && Date.now() - saved.savedAt < DRAFT_MAX_AGE_MS) {
        for (const key of ["nombre", "apellido", "email", "telefono"] as const) {
          if (typeof saved[key] === "string") draft[key] = saved[key].slice(0, 255);
        }
      } else {
        sessionStorage.removeItem(DRAFT_KEY);
      }
    }
  } catch {
    // Storage deshabilitado: el registro sigue funcionando.
  }
  const emailFromLogin = new URLSearchParams(window.location.search).get("email");
  if (emailFromLogin) draft.email = emailFromLogin.toLowerCase().trim().slice(0, 255);
  return draft;
}

const Register = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(loadDraft);
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>("dni");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submitInFlight = useRef(false);
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        nombre: form.nombre,
        apellido: form.apellido,
        email: form.email,
        telefono: form.telefono,
        savedAt: Date.now(),
      }));
    } catch {
      // El usuario puede continuar aunque el navegador bloquee storage.
    }
  }, [form.nombre, form.apellido, form.email, form.telefono]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
    setDupWarning(null);
    setLinkSent(null);
    setExistingEmail(null);
  };

  const handleLinkEmail = async () => {
    if (!dupWarning || linking) return;
    setLinking(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("request-email-link", {
        body: {
          email: form.email.toLowerCase().trim(),
          telefono: form.telefono.trim() || null,
          documento: checkDocumento(form.documento, tipoDocumento).value,
        },
      });
      if (fnError || (data as any)?.error) {
        setError("No pudimos solicitar la vinculación. Contactá a administración si necesitás ayuda.");
      } else {
        setLinkSent((data as any)?.destino_enmascarado || "tu email registrado");
      }
    } catch {
      setError("No pudimos contactar al servidor. Intentá nuevamente.");
    } finally {
      setLinking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitInFlight.current || linking) return;
    submitInFlight.current = true;
    setLoading(true);
    setError(null);
    setExistingEmail(null);
    setLinkSent(null);

    try {
      const email = form.email.toLowerCase().trim();
      if (!form.nombre.trim() || !form.apellido.trim() || !email) {
        setError("Completá nombre, apellido y email.");
        return;
      }
      if (email.length > 255 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
        setError("Ingresá un email válido.");
        return;
      }

      const docCheck = checkDocumento(form.documento, tipoDocumento);
      if (docCheck.error) {
        setError(docCheck.error);
        return;
      }

      const { data: existing, error: existingError } = await supabase
        .rpc("lookup_alumno_by_email", { p_email: email })
        .maybeSingle();

      // Una falla de consulta nunca se interpreta como email disponible.
      if (existingError) {
        setError("No pudimos verificar tus datos. Intentá nuevamente.");
        return;
      }

      if (existing) {
        setDupWarning(null);
        setExistingEmail(email);
        return;
      }

      // Siempre consultar DNI/teléfono, incluso en reintentos. Un segundo clic
      // jamás debe saltear el control y generar una ficha duplicada.
      const { data: dups, error: duplicateError } = await supabase.rpc("lookup_alumno_duplicate", {
        p_email: email,
        p_telefono: form.telefono.trim() || null,
        p_documento: docCheck.value,
      });

      if (duplicateError) {
        setError("No pudimos verificar si ya tenés una ficha. Intentá nuevamente.");
        return;
      }

      const hit = (dups as any[] | null)?.find((d) =>
        ["documento", "telefono", "email", "email_secundario"].includes(d.motivo)
      );
      if (hit) {
        // No divulgar datos de terceros por coincidencia de DNI/teléfono.
        setDupWarning("Encontramos una posible ficha anterior asociada a esos datos. Para conservar tus pagos, reservas e historial, es necesario verificar tu identidad y vincular el email.");
        return;
      }

      setDupWarning(null);
      const newId = crypto.randomUUID();
      const { error: insertError } = await supabase
        .from("alumnos")
        .insert({
          id: newId,
          nombre: form.nombre.trim(),
          apellido: form.apellido.trim(),
          email,
          telefono: form.telefono.trim() || null,
          documento: docCheck.value,
          tipo_documento: tipoDocumento,
          estado: "inactivo",
          grupo: "Sin grupo",
        } as any);

      if (insertError) {
        setError("No pudimos crear tu ficha. Intentá nuevamente o contactá a administración.");
        return;
      }

      try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
      localStorage.setItem("registro_alumno_id", newId);
      navigate("/planes");
    } catch {
      setError("Hubo un inconveniente. Revisá tu conexión e intentá nuevamente.");
    } finally {
      submitInFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        {/* Logo */}
        <div className="text-center space-y-3">
          <img src={logo} alt="Ciclismo Reybaud" className="w-20 h-20 mx-auto mb-2" />
          <h1 className="text-3xl font-heading font-bold uppercase tracking-wider text-foreground">
            Registrate
          </h1>
          <p className="text-muted-foreground text-sm">
            Completá tus datos para empezar en Reybaud
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="glass-card rounded-lg p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="nombre" className="text-sm font-medium text-foreground">
                Nombre *
              </label>
              <Input
                id="nombre"
                name="nombre"
                type="text"
                placeholder="Tu nombre"
                value={form.nombre}
                onChange={handleChange}
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="apellido" className="text-sm font-medium text-foreground">
                Apellido *
              </label>
              <Input
                id="apellido"
                name="apellido"
                type="text"
                placeholder="Tu apellido"
                value={form.apellido}
                onChange={handleChange}
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email *
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="tu@email.com"
                value={form.email}
                onChange={handleChange}
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="telefono" className="text-sm font-medium text-foreground">
                Teléfono <span className="text-muted-foreground">(opcional)</span>
              </label>
              <Input
                id="telefono"
                name="telefono"
                type="tel"
                placeholder="+54 11 1234-5678"
                value={form.telefono}
                onChange={handleChange}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="tipo-documento" className="text-sm font-medium text-foreground">
                Tipo de documento <span className="text-muted-foreground">(opcional)</span>
              </label>
              <Select value={tipoDocumento} onValueChange={(value) => {
                setTipoDocumento(value as TipoDocumento);
                setError(null);
                setDupWarning(null);
                setLinkSent(null);
              }}>
                <SelectTrigger id="tipo-documento" className="bg-secondary border-border text-foreground">
                  <SelectValue placeholder="Elegí un tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dni">DNI</SelectItem>
                  <SelectItem value="cuit">CUIT / CUIL</SelectItem>
                </SelectContent>
              </Select>
              <label htmlFor="documento" className="text-sm font-medium text-foreground">
                Número de documento <span className="text-muted-foreground">(si ya participaste, nos ayuda a encontrar tu ficha)</span>
              </label>
              <Input
                id="documento"
                name="documento"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder={tipoDocumento === "dni" ? "Ej: 30123456" : "Ej: 20-30123456-9"}
                value={form.documento}
                onChange={handleChange}
                maxLength={20}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3" role="alert">
                {error}
              </div>
            )}

            {existingEmail && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3" role="status">
                <p className="font-semibold text-foreground">Este email ya está registrado</p>
                <p className="text-sm text-muted-foreground">No necesitás crear otra ficha. Ingresá con tu email para conservar tus datos y pagos.</p>
                <Button type="button" variant="gold" className="w-full"
                  onClick={() => navigate(`/?email=${encodeURIComponent(existingEmail)}`)}>
                  Iniciar sesión
                </Button>
              </div>
            )}

            {dupWarning && (
              <div className="text-sm bg-primary/5 border border-primary/30 text-foreground rounded-lg p-4 space-y-3" role="status">
                <p className="font-semibold">Parece que ya tenés una ficha en Reybaud</p>
                <p className="text-muted-foreground">{dupWarning}</p>
                {linkSent ? (
                  <p className="text-foreground">
                    Enviamos una solicitud de confirmación al correo registrado ({linkSent}).
                    Seguí las instrucciones recibidas para vincular el email, sin perder tus datos.
                  </p>
                ) : (
                  <>
                    <Button type="button" variant="gold" className="w-full" disabled={linking}
                      onClick={handleLinkEmail}>
                      {linking ? "Enviando..." : "Vincular mi email a la ficha existente"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Te vamos a pedir que confirmes desde el correo principal de tu ficha anterior.
                      El DNI por sí solo no autoriza la vinculación.
                    </p>
                    <a href="mailto:scarlett@ciclismoreybaud.com?subject=Ayuda%20para%20vincular%20mi%20cuenta%20Reybaud"
                      className="block text-center text-sm text-primary hover:underline">
                      No tengo acceso al correo anterior
                    </a>
                  </>
                )}
              </div>
            )}


            <Button type="submit" variant="gold" className="w-full" size="lg"
              disabled={loading || linking || !!dupWarning || !!existingEmail}>
              {loading ? "Verificando..." : "Continuar"}
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </form>

        {/* Back to login */}
        <div className="text-center">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Ya tengo cuenta, iniciar sesión
          </button>
        </div>
      </div>
    </div>
  );
};

export default Register;
