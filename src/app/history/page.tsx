"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History, RefreshCw, Loader2, AlertCircle, Search, Calendar as CalendarIcon, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { MessagePreview } from "@/components/message-preview";

type LogRow = Database["public"]["Tables"]["message_send_logs"]["Row"];
type LogWithRefs = LogRow & {
  instances: { name: string; units: { name: string } | null } | null;
  messages: { name: string } | null;
};

export default function HistoryPage() {
  const qc = useQueryClient();
  const today = new Date();

  const [dateFrom, setDateFrom] = useState<Date>(today);
  const [dateTo, setDateTo] = useState<Date>(today);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: logs = [], isLoading, error } = useQuery<LogWithRefs[]>({
    queryKey: ["all-logs-history", dateFrom, dateTo],
    queryFn: async () => {
      const from = startOfDay(dateFrom).toISOString();
      const to = endOfDay(dateTo).toISOString();
      
      const { data, error } = await supabase
        .from("message_send_logs")
        .select("*, instances(name, units(name)), messages(name)")
        .gte("sent_at", from)
        .lte("sent_at", to)
        .order("sent_at", { ascending: false })
        .limit(1000);
      
      if (error) throw error;
      return (data ?? []) as LogWithRefs[];
    },
  });

  const filteredLogs = searchTerm 
    ? logs.filter(l => 
        l.number.includes(searchTerm) || 
        l.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.instances?.units?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : logs;

  return (
    <AppLayout title="Histórico de Envios">
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-4 items-end bg-muted/30 p-4 rounded-xl border border-border">
          <div className="flex-1 space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Período De:</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                  {dateFrom ? format(dateFrom, "dd 'de' MMMM", { locale: ptBR }) : <span>Selecione</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} initialFocus locale={ptBR} />
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="flex-1 space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Até:</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                  {dateTo ? format(dateTo, "dd 'de' MMMM", { locale: ptBR }) : <span>Selecione</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} initialFocus locale={ptBR} />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex-[2] space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Buscar (Número, Texto ou Unidade):</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Ex: 5511..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="h-10 pl-10"
              />
            </div>
          </div>
          <Button 
            variant="outline" 
            size="icon" 
            className="h-10 w-10 shrink-0" 
            onClick={() => qc.invalidateQueries({ queryKey: ["all-logs-history"] })}
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
        </div>

        <Card className="glass overflow-hidden">
          {error ? (
            <div className="p-16 text-center space-y-3">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto opacity-50" />
              <p className="text-sm font-medium">Erro ao carregar histórico</p>
              <p className="text-xs text-muted-foreground">Verifique sua conexão ou permissões de acesso.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-6 py-4">Data/Hora</TableHead>
                  <TableHead>Origem / WhatsApp</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Destinatário / Conteúdo</TableHead>
                  <TableHead className="w-32 text-right px-6">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <span className="text-sm text-muted-foreground">Consultando registros...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-24">
                      <div className="flex flex-col items-center gap-2 opacity-30">
                        <History className="h-16 w-16 mb-2" />
                        <p className="text-lg font-medium">Nenhum envio encontrado</p>
                        <p className="text-sm">Tente ajustar o período ou o termo de busca.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id} className="group hover:bg-muted/30 transition-colors">
                      <TableCell className="px-6">
                        <div className="text-sm font-medium whitespace-nowrap">
                          {format(parseISO(log.sent_at), "dd/MM/yyyy", { locale: ptBR })}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {format(parseISO(log.sent_at), "HH:mm:ss")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-semibold">{log.instances?.units?.name || "—"}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary/40" />
                          {log.instances?.name || "Instância Removida"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1.5">
                          <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tight w-fit">
                            {log.trigger_source === 'appointment' ? 'Agendamento' : 
                             log.trigger_source === 'billing' ? 'Cobrança' :
                             log.trigger_source === 'campaign' ? 'Campanha' : 
                             log.trigger_source || 'Manual'}
                          </Badge>
                          {log.messages?.name && (
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1 ml-0.5" title="Template utilizado">
                              <FileText className="h-3 w-3 text-primary/60" />
                              <span className="truncate max-w-[120px]">{log.messages.name}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="text-sm font-mono font-bold text-primary/80 mb-1.5">{log.number}</div>
                        <MessagePreview 
                          text={log.text} 
                          message={{ 
                            message_type: log.message_type, 
                            content_data: log.content_data 
                          }} 
                        />
                      </TableCell>
                      <TableCell className="text-right px-6">
                        <Badge 
                          variant={log.success ? "default" : "destructive"} 
                          className={cn(
                            "text-[10px] uppercase font-bold tracking-tighter px-2 h-5",
                            log.success ? "bg-emerald-500/20 text-emerald-600 border-emerald-500/20" : ""
                          )}
                        >
                          {log.success ? "Sucesso" : "Falha"}
                        </Badge>
                        {!log.success && log.error && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="text-[9px] text-destructive cursor-help underline mt-1 font-medium hover:opacity-80">
                                Detalhes do erro
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="bg-destructive text-destructive-foreground max-w-xs border-none shadow-xl">
                              <p className="text-xs">{log.error}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
