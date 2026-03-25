import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>

        <h1 className="text-3xl font-heading font-bold mb-2">Política de Privacidad</h1>
        <p className="text-muted-foreground mb-8">Última actualización: 25 de marzo de 2026</p>

        <div className="prose prose-invert max-w-none space-y-6 text-foreground/90">
          <section>
            <h2 className="text-xl font-semibold text-foreground">1. Responsable del tratamiento</h2>
            <p>
              <strong>Ciclismo Reybaud</strong> (en adelante, "nosotros" o "la App") es responsable del tratamiento de los datos personales recogidos a través de la aplicación móvil y web Ciclismo Reybaud.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">2. Datos que recopilamos</h2>
            <p>Recopilamos los siguientes datos personales cuando usás nuestra aplicación:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Datos de registro:</strong> nombre completo, dirección de correo electrónico, teléfono, documento de identidad, dirección, ciudad, provincia.</li>
              <li><strong>Datos de salud:</strong> condiciones médicas declaradas voluntariamente, contacto de emergencia.</li>
              <li><strong>Datos de entrenamiento:</strong> asistencias, entrenamientos realizados, progreso deportivo, grupo de ciclismo asignado.</li>
              <li><strong>Datos de eventos:</strong> participación en eventos, resultados, tiempos, posiciones.</li>
              <li><strong>Datos de pago:</strong> información de suscripciones, estado de pagos, historial de transacciones. No almacenamos datos de tarjetas de crédito; estos son procesados directamente por Mercado Pago.</li>
              <li><strong>Datos técnicos:</strong> dirección IP, tipo de dispositivo, navegador, datos de uso de la aplicación.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">3. Finalidad del tratamiento</h2>
            <p>Utilizamos tus datos para:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Gestionar tu cuenta y perfil de alumno/a.</li>
              <li>Administrar planes de entrenamiento, asistencias y progreso deportivo.</li>
              <li>Procesar pagos y suscripciones.</li>
              <li>Organizar y gestionar eventos deportivos.</li>
              <li>Enviar comunicaciones relacionadas con tu actividad (entrenamientos, eventos, pagos).</li>
              <li>Mejorar la calidad de nuestros servicios y la experiencia del usuario.</li>
              <li>Cumplir con obligaciones legales aplicables.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">4. Base legal</h2>
            <p>
              El tratamiento de tus datos se basa en tu consentimiento al registrarte en la aplicación, la ejecución del contrato de servicio (suscripción a un plan), y el cumplimiento de obligaciones legales cuando corresponda.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">5. Compartición de datos</h2>
            <p>Tus datos pueden ser compartidos con:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Coaches asignados:</strong> para gestionar tu entrenamiento y dar feedback.</li>
              <li><strong>Procesadores de pago:</strong> Mercado Pago, para procesar transacciones de forma segura.</li>
              <li><strong>Proveedores de infraestructura:</strong> servicios de alojamiento y base de datos necesarios para el funcionamiento de la aplicación.</li>
            </ul>
            <p>No vendemos ni compartimos tus datos personales con terceros con fines publicitarios.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">6. Seguridad de los datos</h2>
            <p>
              Implementamos medidas técnicas y organizativas para proteger tus datos personales contra el acceso no autorizado, la pérdida, alteración o destrucción. Esto incluye cifrado de datos en tránsito, control de acceso basado en roles y auditoría de actividades.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">7. Retención de datos</h2>
            <p>
              Conservamos tus datos personales mientras mantengas una cuenta activa en la aplicación. Si cancelás tu cuenta, tus datos serán eliminados o anonimizados en un plazo razonable, salvo que la ley exija su conservación por un período mayor.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">8. Tus derechos</h2>
            <p>Tenés derecho a:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Acceder a tus datos personales.</li>
              <li>Rectificar datos inexactos o incompletos.</li>
              <li>Solicitar la eliminación de tus datos.</li>
              <li>Oponerte al tratamiento de tus datos.</li>
              <li>Solicitar la portabilidad de tus datos.</li>
              <li>Revocar tu consentimiento en cualquier momento.</li>
            </ul>
            <p>
              Para ejercer estos derechos, podés contactarnos a través de los canales indicados en la sección de contacto.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">9. Menores de edad</h2>
            <p>
              La aplicación puede ser utilizada por menores de edad bajo la supervisión y con el consentimiento de sus padres o tutores legales. Los padres o tutores son responsables de la información proporcionada.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">10. Cambios en esta política</h2>
            <p>
              Nos reservamos el derecho de actualizar esta política de privacidad. Te notificaremos de cambios significativos a través de la aplicación o por correo electrónico.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">11. Contacto</h2>
            <p>
              Si tenés preguntas sobre esta política de privacidad o sobre el tratamiento de tus datos, podés contactarnos a través de la aplicación o por correo electrónico.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
