import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { MessageSquareMore } from "lucide-react";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  const { signUp, user } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) navigate({ to: "/dashboard" }); }, [user, navigate]);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("A senha precisa ter ao menos 6 caracteres"); return; }
    setLoading(true);
    const { error } = await signUp(email, password, fullName);
    setLoading(false);
    if (error) toast.error(error);
    else { toast.success("Conta criada! Verifique seu e-mail."); navigate({ to: "/dashboard" }); }
  };

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <Card className="w-full max-w-md glass">
        <CardHeader className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl gradient-primary mb-2">
            <MessageSquareMore className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="font-display text-2xl">Criar conta</CardTitle>
          <CardDescription>Comece a automatizar suas mensagens</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handle} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome completo</Label>
              <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Criando..." : "Criar conta"}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Já tem conta? <Link to="/login" className="text-primary hover:underline">Entrar</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
