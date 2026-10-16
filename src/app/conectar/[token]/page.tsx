"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Loader2, MessageSquareMore, QrCode, RefreshCw, XCircle } from "lucide-react";
import {
  getCaptureLinkInfo,
  getCaptureSessionStatus,
  startCaptureSession,
} from "@/lib/lead-capture";
import type { CaptureSessionView } from "@/lib/lead-capture.server";

const POLL_MS = 3000;

type LinkInfo = Awaited<ReturnType<typeof getCaptureLinkInfo>>;

export default function ConnectPage() {
  const { token } = useParams<{ token: string }>();
  const storageKey = `lead-capture-session:${token}`;

  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null);
  const [personName, setPersonName] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<CaptureSessionView | null>(null);
  const lastQr = useRef<string | null>(null);

  // Carrega dados do link e retoma sessão salva (caso a pessoa recarregue a página)
  useEffect(() => {
    getCaptureLinkInfo({ token }).then(async (info) => {
      setLinkInfo(info);
      const savedId = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
      if (info.valid && savedId) {
        const res = await getCaptureSessionStatus({ token, sessionId: savedId });
        if (res.ok) setSession(res.session);
        else localStorage.removeItem(storageKey);
      }
    });
  }, [token, storageKey]);

  const applySession = useCallback((s: CaptureSessionView) => {
    if (s.qrBase64) lastQr.current = s.qrBase64;
    setSession({ ...s, qrBase64: s.qrBase64 ?? lastQr.current });
  }, []);

  // Polling enquanto aguarda conexão ou extrai
  const status = session?.status;
  const sessionId = session?.sessionId;
  useEffect(() => {
    if (!sessionId || (status !== "awaiting_connection" && status !== "extracting")) return;
    const timer = setInterval(async () => {
      const res = await getCaptureSessionStatus({ token, sessionId });
      if (res.ok) applySession(res.session);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [sessionId, status, token, applySession]);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStarting(true);
    lastQr.current = null;
    const res = await startCaptureSession({ token, personName });
    setStarting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    localStorage.setItem(storageKey, res.session.sessionId);
    applySession(res.session);
  };

  const reset = () => {
    localStorage.removeItem(storageKey);
    lastQr.current = null;
    setSession(null);
    setError(null);
  };

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <Card className="w-full max-w-md glass">
        <CardHeader className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl gradient-primary mb-2">
            <MessageSquareMore className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="font-display text-2xl">Conectar WhatsApp</CardTitle>
          {linkInfo?.valid && (
            <CardDescription>
              {linkInfo.companyName}
              {linkInfo.unitName ? ` · ${linkInfo.unitName}` : ""}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent>
          {!linkInfo ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !linkInfo.valid ? (
            <StatusMessage
              icon="error"
              title="Link inválido"
              text="Este link não existe ou foi desativado."
            />
          ) : !session ? (
            <form onSubmit={handleStart} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Seu nome</Label>
                <Input
                  id="name"
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Ex: Maria Silva"
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={starting}>
                {starting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <QrCode className="h-4 w-4 mr-2" />
                )}
                {starting ? "Gerando QR Code..." : "Gerar QR Code"}
              </Button>
            </form>
          ) : session.status === "awaiting_connection" ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto grid h-64 w-64 place-items-center rounded-xl bg-white p-3">
                {session.qrBase64 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.qrBase64}
                    alt="QR Code do WhatsApp"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
                )}
              </div>
              <ol className="text-sm text-muted-foreground text-left space-y-1 list-decimal list-inside">
                <li>Abra o WhatsApp no seu celular</li>
                <li>
                  Toque em <strong>Mais opções</strong> ou <strong>Configurações</strong> e depois
                  em <strong>Aparelhos conectados</strong>
                </li>
                <li>
                  Toque em <strong>Conectar um aparelho</strong> e aponte para este QR Code
                </li>
              </ol>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Aguardando leitura...
              </p>
            </div>
          ) : session.status === "extracting" ? (
            <ExtractingView session={session} />
          ) : session.status === "completed" ? (
            <div className="space-y-4">
              <StatusMessage
                icon="success"
                title="Tudo pronto!"
                text="Seus grupos foram processados e seu WhatsApp já foi desconectado deste sistema."
              />
              <Summary session={session} />
            </div>
          ) : (
            <div className="space-y-4">
              <StatusMessage
                icon="error"
                title={
                  session.status === "expired" ? "Tempo esgotado" : "Não foi possível concluir"
                }
                text={session.error || "Ocorreu um erro. Tente novamente."}
              />
              <Button className="w-full" variant="outline" onClick={reset}>
                <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExtractingView({ session }: { session: CaptureSessionView }) {
  const pct =
    session.groupsTotal > 0 ? Math.round((session.groupsDone / session.groupsTotal) * 100) : 0;
  return (
    <div className="space-y-5 text-center">
      <div className="flex items-center justify-center gap-2 text-primary">
        <CheckCircle2 className="h-5 w-5" />
        <span className="font-medium">WhatsApp conectado</span>
      </div>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {session.groupsTotal === 0
            ? "Buscando seus grupos..."
            : `Processando grupos: ${session.groupsDone} de ${session.groupsTotal}`}
        </p>
        <Progress value={pct} />
      </div>
      <p className="text-xs text-muted-foreground">
        Pode levar alguns minutos. Você pode fechar esta página: o processo continua normalmente.
      </p>
      <Summary session={session} />
    </div>
  );
}

function Summary({ session }: { session: CaptureSessionView }) {
  const items = [
    { label: "Grupos", value: session.groupsDone },
    { label: "Novos contatos", value: session.leadsInserted },
    { label: "Já existentes", value: session.leadsUpdated },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((i) => (
        <div
          key={i.label}
          className="rounded-lg border border-border/50 bg-muted/40 p-3 text-center"
        >
          <div className="text-xl font-display font-semibold">{i.value}</div>
          <div className="text-[11px] text-muted-foreground">{i.label}</div>
        </div>
      ))}
    </div>
  );
}

function StatusMessage({
  icon,
  title,
  text,
}: {
  icon: "success" | "error";
  title: string;
  text: string;
}) {
  const Icon = icon === "success" ? CheckCircle2 : XCircle;
  return (
    <div className="text-center space-y-2 py-4">
      <Icon
        className={`h-12 w-12 mx-auto ${icon === "success" ? "text-primary" : "text-destructive"}`}
      />
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
