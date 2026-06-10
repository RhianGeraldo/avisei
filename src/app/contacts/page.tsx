"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Card } from "@/components/ui/card";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Download, Loader2, Users, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/lib/auth-context";

export default function ContactsPage() {
  const { companyId } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts", companyId],
    queryFn: async () => {
      let allData: any[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("contacts")
          .select("*, units(name)")
          .order("created_at", { ascending: false })
          .range(from, from + step - 1);
          
        if (companyId) {
          query = query.eq("company_id", companyId);
        }

        const { data, error } = await query;
        
        if (error) {
          toast.error("Erro ao carregar contatos: " + error.message);
          throw error;
        }

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          if (data.length < step) {
            hasMore = false;
          } else {
            from += step;
          }
        } else {
          hasMore = false;
        }
      }
      
      return allData;
    },
  });

  const handleExportCSV = () => {
    if (contacts.length === 0) {
      toast.error("Nenhum contato para exportar.");
      return;
    }

    try {
      // Create CSV Headers
      const headers = ["ID", "Nome", "Numero", "Unidade", "Grupos Origem", "Data Importacao"];
      
      // Create rows
      const rows = contacts.map(contact => {
        const groups = Array.isArray(contact.groups) ? contact.groups : [];
        const groupNames = groups.map((g: any) => g.name || g.jid).join(" | ");
        const createdDate = contact.created_at ? format(new Date(contact.created_at), "dd/MM/yyyy HH:mm") : "";
        const unitName = contact.units?.name || "Sem unidade";
        
        return [
          contact.id,
          contact.name || "",
          contact.number || "",
          `"${unitName}"`,
          `"${groupNames}"`, // wrap in quotes to avoid comma issues
          createdDate
        ].join(",");
      });

      const csvContent = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `contatos_base_${format(new Date(), "yyyyMMdd_HHmm")}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success("Arquivo CSV exportado com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao gerar CSV: " + err.message);
    }
  };

  const filteredContacts = contacts.filter((c: any) => {
    if (!searchTerm) return true;
    const lower = searchTerm.toLowerCase();
    const numberMatch = c.number?.includes(lower);
    const nameMatch = c.name?.toLowerCase().includes(lower);
    const unitMatch = c.units?.name?.toLowerCase().includes(lower);
    const groupMatch = Array.isArray(c.groups) && c.groups.some((g: any) => g.name?.toLowerCase().includes(lower));
    return numberMatch || nameMatch || unitMatch || groupMatch;
  });

  return (
    <AppLayout title="Base de Leads">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <p className="text-muted-foreground hidden lg:block">
              Sua base de leads importada dos grupos de WhatsApp.
            </p>
            <Badge variant="secondary" className="text-sm px-3 py-1 border-primary/20 bg-primary/10 text-primary whitespace-nowrap">
              <Users className="w-4 h-4 mr-2" />
              {filteredContacts.length} {filteredContacts.length === 1 ? 'contato' : 'contatos'}
            </Badge>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar número, nome, unidade ou grupo..."
                className="pl-9 bg-background"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button 
              onClick={handleExportCSV}
              disabled={isLoading || contacts.length === 0}
              className="w-full sm:w-auto"
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </div>

        <Card className="glass overflow-hidden">
          <div className="max-h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar">
            <table className="w-full caption-bottom text-sm">
              <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm shadow-sm">
                <TableRow>
                  <TableHead className="h-10">Número</TableHead>
                  <TableHead className="h-10">Nome</TableHead>
                  <TableHead className="h-10">Unidade</TableHead>
                  <TableHead className="h-10">Grupos de Origem</TableHead>
                  <TableHead className="h-10">Importado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-16">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filteredContacts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-16">
                      <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                      <p>Nenhum contato encontrado.</p>
                      {searchTerm && <p className="text-sm">Sua busca não retornou resultados.</p>}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredContacts.map((contact: any) => (
                    <TableRow key={contact.id} className="hover:bg-muted/20">
                      <TableCell className="font-mono font-medium">{contact.number}</TableCell>
                      <TableCell>{contact.name || ""}</TableCell>
                      <TableCell>
                        {contact.units?.name ? (
                          <Badge variant="outline">{contact.units.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">Sem unidade</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {Array.isArray(contact.groups) && contact.groups.length > 0 ? (
                            contact.groups.map((g: any, idx: number) => (
                              <Badge key={idx} variant="secondary" className="text-xs max-w-48 truncate" title={g.name || g.jid}>
                                {g.name || "Grupo"}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-xs">Sem grupo</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {contact.created_at ? format(new Date(contact.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
