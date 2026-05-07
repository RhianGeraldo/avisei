import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { MessageSquareMore, Calendar, Receipt, Building2, Zap, Shield, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="container mx-auto flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg gradient-primary">
            <MessageSquareMore className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-display font-semibold leading-none">Belle</div>
            <div className="text-xs text-muted-foreground">Messaging</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild><Link to="/login">Entrar</Link></Button>
          <Button asChild><Link to="/signup">Começar</Link></Button>
        </div>
      </header>

      <section className="container mx-auto py-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border glass px-4 py-1.5 text-xs text-muted-foreground mb-8">
          <Zap className="h-3.5 w-3.5 text-primary" />
          Integração nativa com Belle Software + Evogo
        </div>
        <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight max-w-4xl mx-auto leading-[1.05]">
          Mensageria WhatsApp <span className="text-gradient">no piloto automático</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Conecte suas unidades do Belle Software, configure mensagens por gatilho e deixe a plataforma
          enviar lembretes de agendamentos e cobranças de parcelas — tudo via WhatsApp, multi-empresa e multi-unidade.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild>
            <Link to="/signup">Criar conta grátis <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/login">Já tenho conta</Link>
          </Button>
        </div>
      </section>

      <section className="container mx-auto py-16 grid md:grid-cols-3 gap-6">
        {[
          { icon: Building2, title: "Multi-empresa", desc: "Gerencie várias empresas, cada uma com suas próprias unidades, instâncias e mensagens." },
          { icon: Calendar, title: "Lembretes de agendamento", desc: "Avise clientes 1, 2 ou X dias antes da consulta — totalmente personalizável por unidade." },
          { icon: Receipt, title: "Cobrança de parcelas", desc: "Mensagens automáticas para parcelas a vencer e em atraso, sem você levantar um dedo." },
          { icon: MessageSquareMore, title: "Templates dinâmicos", desc: "Use variáveis como {{cliente_nome}}, {{data}}, {{valor}} em qualquer mensagem." },
          { icon: Zap, title: "Múltiplas instâncias", desc: "Cada unidade pode ter várias instâncias do Evogo — escolha qual envia cada mensagem." },
          { icon: Shield, title: "Seguro por padrão", desc: "Cada empresa só vê seus próprios dados. Tokens armazenados com isolamento por tenant." },
        ].map((f) => (
          <div key={f.title} className="glass rounded-xl p-6">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground mb-4">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="font-display font-semibold text-lg">{f.title}</h3>
            <p className="text-sm text-muted-foreground mt-2">{f.desc}</p>
          </div>
        ))}
      </section>

      <footer className="container mx-auto py-10 text-center text-sm text-muted-foreground border-t border-border mt-10">
        Belle Software Messaging · Plataforma de mensageria automatizada
      </footer>
    </div>
  );
}
