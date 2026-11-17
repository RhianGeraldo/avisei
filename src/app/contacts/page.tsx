"use client";

import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  Download,
  Loader2,
  Users,
  Search,
  FilterX,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/lib/auth-context";

export default function ContactsPage() {
  const { companyId } = useAuth();

  // Estados de paginação e filtros
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState<string>("all");
  const [selectedCollaborator, setSelectedCollaborator] = useState<string>("all");
  const [selectedNameFilter, setSelectedNameFilter] = useState<string>("all");
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>("all");
  const [exporting, setExporting] = useState(false);

  // Debounce da busca para não disparar consultas a cada caractere digitado
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Lista de unidades da empresa
  const { data: unitsList = [] } = useQuery({
    queryKey: ["units-list", companyId],
    queryFn: async () => {
      let query = supabase.from("units").select("id, name").order("name");
      if (companyId) query = query.eq("company_id", companyId);
      const { data } = await query;
      return (data as { id: string; name: string }[]) ?? [];
    },
  });

  // Lista de colaboradoras que realmente possuem leads na empresa/unidade selecionada
  const { data: collaboratorsList = [] } = useQuery({
    queryKey: ["collaborators-list", companyId, selectedUnitId],
    queryFn: async () => {
      let query = supabase
        .from("lead_capture_sessions")
        .select("person_name, leads_inserted, leads_updated, unit_id");
      if (companyId) query = query.eq("company_id", companyId);
      if (selectedUnitId && selectedUnitId !== "all" && selectedUnitId !== "none") {
        query = query.eq("unit_id", selectedUnitId);
      }
      const { data } = await query;
      const set = new Set<string>();
      (data || []).forEach((s: any) => {
        const hasLeads = (s.leads_inserted ?? 0) > 0 || (s.leads_updated ?? 0) > 0;
        if (s.person_name?.trim() && hasLeads) {
          set.add(s.person_name.trim());
        }
      });
      return Array.from(set).sort();
    },
  });

  // Função centralizada para aplicar todos os filtros na query Supabase
  const applyFilters = (query: any) => {
    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    if (debouncedSearch.trim()) {
      const clean = debouncedSearch.trim();
      const digits = clean.replace(/\D/g, "");
      const safeText = clean.replace(/[,()]/g, "").trim();

      if (digits.length >= 3 && safeText && safeText !== digits) {
        query = query.or(`number.ilike.%${digits}%,name.ilike.%${safeText}%`);
      } else if (digits.length >= 3) {
        query = query.or(`number.ilike.%${digits}%,name.ilike.%${digits}%`);
      } else if (safeText) {
        query = query.or(`number.ilike.%${safeText}%,name.ilike.%${safeText}%`);
      }
    }

    if (selectedUnitId && selectedUnitId !== "all") {
      if (selectedUnitId === "none") {
        query = query.is("unit_id", null);
      } else {
        query = query.eq("unit_id", selectedUnitId);
      }
    }

    if (selectedCollaborator && selectedCollaborator !== "all") {
      if (selectedCollaborator === "none") {
        // Contatos sem colaboradora vinculada
        query = query.not("groups", "cs", JSON.stringify([{ source: "capture_link" }]));
      } else {
        query = query.contains(
          "groups",
          JSON.stringify([{ captured_by: selectedCollaborator }]),
        );
      }
    }

    if (selectedNameFilter === "with_name") {
      query = query.not("name", "is", null).neq("name", "");
    } else if (selectedNameFilter === "without_name") {
      query = query.or("name.is.null,name.eq.");
    }

    if (selectedDateFilter === "today") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      query = query.gte("created_at", startOfDay.toISOString());
    } else if (selectedDateFilter === "7days") {
      const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      query = query.gte("created_at", past.toISOString());
    } else if (selectedDateFilter === "30days") {
      const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      query = query.gte("created_at", past.toISOString());
    }

    return query;
  };

  // Busca paginada dos contatos no Supabase (puxa apenas a página atual e o total exato)
  const { data, isLoading } = useQuery({
    queryKey: [
      "contacts-paginated",
      companyId,
      page,
      pageSize,
      debouncedSearch,
      selectedUnitId,
      selectedCollaborator,
      selectedNameFilter,
      selectedDateFilter,
    ],
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("contacts")
        .select("id, number, name, groups, created_at, unit_id, units(name)", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .range(from, to);

      query = applyFilters(query);

      const { data: rows, count, error } = await query;
      if (error) {
        toast.error("Erro ao carregar contatos: " + error.message);
        throw error;
      }

      return {
        contacts: rows ?? [],
        total: count ?? 0,
      };
    },
    placeholderData: (prev) => prev,
  });

  const contacts = data?.contacts ?? [];
  const totalCount = data?.total ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const handleUnitChange = (val: string) => {
    setSelectedUnitId(val);
    setSelectedCollaborator("all");
    setPage(1);
  };

  const handleCollaboratorChange = (val: string) => {
    setSelectedCollaborator(val);
    setPage(1);
  };

  const handleNameFilterChange = (val: string) => {
    setSelectedNameFilter(val);
    setPage(1);
  };

  const handleDateFilterChange = (val: string) => {
    setSelectedDateFilter(val);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setSelectedUnitId("all");
    setSelectedCollaborator("all");
    setSelectedNameFilter("all");
    setSelectedDateFilter("all");
    setPage(1);
  };

  const hasActiveFilters =
    debouncedSearch.trim() !== "" ||
    selectedUnitId !== "all" ||
    selectedCollaborator !== "all" ||
    selectedNameFilter !== "all" ||
    selectedDateFilter !== "all";

  // Exportação em lotes sob demanda sem limite de 1.000 contatos
  const handleExportCSV = async () => {
    if (totalCount === 0) {
      toast.error("Nenhum contato para exportar.");
      return;
    }

    setExporting(true);
    const toastId = toast.loading(
      `Iniciando exportação de ${totalCount.toLocaleString("pt-BR")} contatos...`,
    );

    try {
      let allExportData: any[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("contacts")
          .select("id, number, name, groups, created_at, unit_id, units(name)")
          .order("created_at", { ascending: false })
          .range(from, from + step - 1);

        query = applyFilters(query);

        const { data: chunk, error } = await query;
        if (error) throw error;

        if (chunk && chunk.length > 0) {
          allExportData.push(...chunk);
          from += chunk.length;
          toast.loading(
            `Exportando: ${allExportData.length.toLocaleString("pt-BR")} de ${totalCount.toLocaleString("pt-BR")}...`,
            { id: toastId },
          );

          if (chunk.length < step || allExportData.length >= totalCount) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      const headers = [
        "ID",
        "Nome",
        "Numero",
        "Unidade",
        "Grupos Origem",
        "Colaboradora",
        "Data Importacao",
      ];
      const rows = allExportData.map((contact) => {
        const groups = Array.isArray(contact.groups) ? contact.groups : [];
        const groupNames = groups.map((g: any) => g.name || g.jid).join(" | ");
        const collaborators = Array.from(
          new Set(groups.map((g: any) => g.captured_by).filter(Boolean)),
        ).join(" | ");
        const createdDate = contact.created_at
          ? format(new Date(contact.created_at), "dd/MM/yyyy HH:mm")
          : "";
        const unitName = contact.units?.name || "Sem unidade";

        return [
          contact.id,
          `"${(contact.name || "").replace(/"/g, '""')}"`,
          contact.number || "",
          `"${unitName.replace(/"/g, '""')}"`,
          `"${groupNames.replace(/"/g, '""')}"`,
          `"${collaborators.replace(/"/g, '""')}"`,
          createdDate,
        ].join(",");
      });

      // \uFEFF adiciona BOM UTF-8 para compatibilidade perfeita com Excel
      const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `contatos_base_${format(new Date(), "yyyyMMdd_HHmm")}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(
        `${allExportData.length.toLocaleString("pt-BR")} contatos exportados com sucesso!`,
        { id: toastId },
      );
    } catch (err: any) {
      toast.error("Erro ao gerar CSV: " + err.message, { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppLayout title="Base de Leads">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <Badge
                variant="secondary"
                className="text-sm px-3 py-1 border-primary/20 bg-primary/10 text-primary whitespace-nowrap"
              >
                <Users className="w-4 h-4 mr-2" />
                {totalCount.toLocaleString("pt-BR")}{" "}
                {totalCount === 1 ? "contato" : "contatos"}
              </Badge>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="text-xs text-muted-foreground hover:text-foreground h-8"
                >
                  <FilterX className="w-3.5 h-3.5 mr-1" />
                  Limpar filtros
                </Button>
              )}
            </div>

            <Button
              onClick={handleExportCSV}
              disabled={exporting || totalCount === 0}
              className="w-full sm:w-auto shrink-0 shadow-sm"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Exportar CSV ({totalCount.toLocaleString("pt-BR")})
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 p-3 rounded-lg border border-border/50 bg-muted/20">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar número ou nome..."
                className="pl-9 bg-background h-9 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <Select value={selectedUnitId} onValueChange={handleUnitChange}>
              <SelectTrigger className="w-full bg-background h-9 text-sm">
                <SelectValue placeholder="Unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as unidades</SelectItem>
                <SelectItem value="none">Sem unidade</SelectItem>
                {unitsList.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedCollaborator}
              onValueChange={handleCollaboratorChange}
            >
              <SelectTrigger className="w-full bg-background h-9 text-sm">
                <SelectValue placeholder="Colaboradora" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas colaboradoras</SelectItem>
                <SelectItem value="none">Sem colaboradora</SelectItem>
                {collaboratorsList.map((collab) => (
                  <SelectItem key={collab} value={collab}>
                    {collab}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedNameFilter}
              onValueChange={handleNameFilterChange}
            >
              <SelectTrigger className="w-full bg-background h-9 text-sm">
                <SelectValue placeholder="Filtro de Nome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os contatos</SelectItem>
                <SelectItem value="with_name">Com nome cadastrado</SelectItem>
                <SelectItem value="without_name">Sem nome cadastrado</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={selectedDateFilter}
              onValueChange={handleDateFilterChange}
            >
              <SelectTrigger className="w-full bg-background h-9 text-sm">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo o período</SelectItem>
                <SelectItem value="today">Cadastrados hoje</SelectItem>
                <SelectItem value="7days">Últimos 7 dias</SelectItem>
                <SelectItem value="30days">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="glass overflow-hidden flex flex-col">
          <div className="max-h-[calc(100vh-250px)] overflow-y-auto custom-scrollbar">
            <table className="w-full caption-bottom text-sm">
              <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm shadow-sm">
                <TableRow>
                  <TableHead className="h-10">Número</TableHead>
                  <TableHead className="h-10">Nome</TableHead>
                  <TableHead className="h-10">Unidade</TableHead>
                  <TableHead className="h-10">Grupos de Origem</TableHead>
                  <TableHead className="h-10">Colaboradora</TableHead>
                  <TableHead className="h-10">Importado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && contacts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-16">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                      <p className="text-xs text-muted-foreground mt-2">
                        Carregando contatos...
                      </p>
                    </TableCell>
                  </TableRow>
                ) : contacts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-16">
                      <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                      <p>Nenhum contato encontrado.</p>
                      {debouncedSearch && (
                        <p className="text-sm mt-1">Sua busca não retornou resultados.</p>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  contacts.map((contact: any) => {
                    const collaborators = Array.isArray(contact.groups)
                      ? Array.from(
                          new Set(
                            contact.groups
                              .map((g: any) => g.captured_by)
                              .filter(Boolean),
                          ),
                        )
                      : [];

                    return (
                      <TableRow key={contact.id} className="hover:bg-muted/20">
                        <TableCell className="font-mono font-medium">
                          {contact.number}
                        </TableCell>
                        <TableCell>{contact.name || ""}</TableCell>
                        <TableCell>
                          {contact.units?.name ? (
                            <Badge variant="outline">{contact.units.name}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              Sem unidade
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {Array.isArray(contact.groups) &&
                            contact.groups.length > 0 ? (
                              contact.groups.map((g: any, idx: number) => (
                                <Badge
                                  key={idx}
                                  variant="secondary"
                                  className="text-xs max-w-48 truncate"
                                  title={g.name || g.jid}
                                >
                                  {g.name || "Grupo"}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                Sem grupo
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {collaborators.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {collaborators.map((c: any, idx: number) => (
                                <Badge
                                  key={idx}
                                  variant="outline"
                                  className="text-xs bg-muted/40 font-normal"
                                >
                                  {c}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {contact.created_at
                            ? format(
                                new Date(contact.created_at),
                                "dd/MM/yyyy HH:mm",
                                { locale: ptBR },
                              )
                            : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </table>
          </div>

          {/* Paginação */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-border/50 bg-muted/20">
            <div className="text-xs text-muted-foreground">
              {totalCount > 0 ? (
                <>
                  Mostrando{" "}
                  <strong>{((page - 1) * pageSize + 1).toLocaleString("pt-BR")}</strong> a{" "}
                  <strong>
                    {Math.min(page * pageSize, totalCount).toLocaleString("pt-BR")}
                  </strong>{" "}
                  de <strong>{totalCount.toLocaleString("pt-BR")}</strong> contatos
                </>
              ) : (
                "0 contatos"
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 mr-2">
                <span className="text-xs text-muted-foreground">Por página:</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-20 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage(1)}
                  title="Primeira página"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  title="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <span className="text-xs px-2 font-medium">
                  {page} de {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= totalPages || isLoading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  title="Próxima página"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= totalPages || isLoading}
                  onClick={() => setPage(totalPages)}
                  title="Última página"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
