import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const EventTerms = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>

        <h1 className="text-3xl font-heading font-bold mb-2">
          Términos y condiciones de eventos
        </h1>
        <p className="text-muted-foreground mb-8">
          Aplican a inscripciones a clínicas, camps, viajes y competencias organizadas por Ciclismo Reybaud.
        </p>

        <div className="max-w-none space-y-6 text-foreground/90">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">1. Inscripción y cupos</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>La inscripción se considera confirmada cuando se registra la seña o el pago total, según lo indicado en cada evento.</li>
              <li>Los cupos son limitados y se asignan por orden de pago acreditado, no por orden de formulario.</li>
              <li>Los paquetes con precio diferenciado (por ejemplo, alumnos y ciclistas externos) tienen cupos propios y no son intercambiables.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">2. Pagos</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Se aceptan pagos por Mercado Pago, transferencia bancaria y efectivo según el evento.</li>
              <li>Los pagos por transferencia se acreditan una vez que administración valida el comprobante enviado.</li>
              <li>Si el evento tiene plan de cuotas, la falta de pago de una cuota en la fecha de vencimiento puede liberar el cupo.</li>
              <li>Los precios pueden variar por etapas (early bird / precio general). Se respeta el precio vigente al momento del pago acreditado.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">3. Política de cancelación</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Más de 30 días antes del evento:</strong> se reintegra el 100% de lo abonado, descontando gastos bancarios y de plataforma de pago.</li>
              <li><strong>Entre 30 y 15 días antes:</strong> se reintegra el 50% de lo abonado, o el 100% en crédito a favor para otro evento dentro de los 12 meses.</li>
              <li><strong>Menos de 15 días antes:</strong> no hay reintegro, ya que los costos de alojamiento, comidas y logística están comprometidos. Se puede transferir el lugar a otra persona avisando por escrito con al menos 72 h de anticipación.</li>
              <li>Las señas de eventos con alojamiento no son reembolsables, salvo que el lugar sea cubierto por otra persona de la lista de espera.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">4. Cancelación o cambios por parte de la organización</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Si el evento se cancela por decisión de la organización, se reintegra el 100% de lo abonado o se ofrece crédito por el mismo valor, a elección del participante.</li>
              <li>Por razones climáticas, de seguridad o de fuerza mayor, la organización puede modificar recorridos, horarios o actividades sin que esto genere derecho a reintegro.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">5. Responsabilidad y salud del participante</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>El ciclismo es una actividad de riesgo. El participante declara estar en condiciones físicas adecuadas y contar con apto médico vigente cuando el evento lo requiera.</li>
              <li>Es obligatorio el uso de casco y el cumplimiento de las normas de tránsito y de las indicaciones del staff.</li>
              <li>El participante es responsable por su bicicleta, equipamiento y objetos personales.</li>
              <li>La organización no cubre gastos médicos ni traslados sanitarios más allá de la asistencia contratada e informada en cada evento.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">6. Uso de datos personales</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Los datos brindados se usan exclusivamente para gestionar la inscripción, la logística, los pagos y la comunicación del evento.</li>
              <li>No se comparten con terceros ajenos a la organización, salvo prestadores necesarios (alojamiento, seguro, transporte, plataforma de pago).</li>
              <li>Podés solicitar la baja de comunicaciones o la eliminación de tus datos escribiendo a natalia@ciclismoreybaud.com.</li>
              <li>Más detalle en la <a className="text-primary underline" href="/politica-privacidad">Política de Privacidad</a>.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">7. Imagen</h2>
            <p>
              Durante los eventos se toman fotos y videos con fines de difusión. Si no querés que se use tu imagen,
              avisanos por escrito antes del evento y lo respetamos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">8. Contacto</h2>
            <p>
              Consultas sobre inscripciones, pagos o cancelaciones:{" "}
              <a className="text-primary underline" href="mailto:natalia@ciclismoreybaud.com">
                natalia@ciclismoreybaud.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default EventTerms;
