import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Loader2 } from "lucide-react";
import { useDepositoAuth } from "@/hooks/useDepositoAuth";
import { toast } from "@/hooks/use-toast";

const DepositoLogin = () => {
  const navigate = useNavigate();
  const { login } = useDepositoAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate("/deposito");
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Credenciales inválidas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm border-border">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Package className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="font-heading uppercase tracking-wider">Depósito</CardTitle>
          <p className="text-sm text-muted-foreground">Gestión de stock y mercadería</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ingresar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default DepositoLogin;
