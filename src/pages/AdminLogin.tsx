import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Bike, ChevronRight, ArrowLeft } from "lucide-react";

const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      // Check admin role
      const { data: session } = await supabase.auth.getSession();
      if (session.session) {
        const { data: isAdmin } = await supabase.rpc("has_role", {
          _user_id: session.session.user.id,
          _role: "admin",
        });

        if (!isAdmin) {
          await supabase.auth.signOut();
          setError("No tenés permisos de administrador.");
          setLoading(false);
          return;
        }

        navigate("/admin");
      }
    } catch (err: any) {
      setError(err.message || "Error al iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full gold-gradient mb-2">
            <Bike className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-heading font-bold uppercase tracking-wider text-foreground">
            Admin Panel
          </h1>
          <p className="text-muted-foreground text-sm">Ciclismo Reybaud</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="glass-card rounded-lg p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="admin-email" className="text-sm font-medium text-foreground">Email</label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="admin-password" className="text-sm font-medium text-foreground">Contraseña</label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</div>
            )}

            <Button type="submit" variant="gold" className="w-full" size="lg" disabled={loading}>
              {loading ? "Ingresando..." : "Ingresar"}
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </form>

        <div className="text-center">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Volver al login de alumnos
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
