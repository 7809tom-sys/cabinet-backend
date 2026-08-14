import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CRM_STAGES, CRM_PIPELINE_STAGES, CRM_CLOSED_STAGES, CRM_STAGE_LABELS,
  CRM_PRIORITY_LABELS, isClosedStage,
  crmEmailBlockedReason, CRM_EMAIL_BLOCK_MESSAGES,
  type CrmStage, type CrmPriority, type CrmLanguage,
} from "@shared/crm";
import {
  Plus, Phone, Mail, MapPin, Building2, ChevronRight, Inbox,
  CircleDollarSign, Languages, Trash2, Send, AlertTriangle, Settings2, FileText,
} from "lucide-react";
import { affiliateCardColor, type CrmAffiliateBrand } from "@/lib/crmAffiliateBrand";
import { MASTER_AFFILIATE_FILTER_ALL, masterAffiliateFilterId } from "@/lib/crmMasterFilter";
import { openCrmQuickInvoicePdf, type CrmQuickInvoiceLine } from "@/lib/crmQuickInvoice";

type Lang = CrmLanguage;
const L = (lang: Lang) => ({
  title: lang === "es" ? "CRM de ventas" : "Sales CRM",
  subtitle: lang === "es"
    ? "Gestiona tus prospectos y oportunidades por etapa."
    : "Track your leads and deals through each stage.",
  newDeal: lang === "es" ? "Nuevo trato" : "New Deal",
  importLeads: lang === "es" ? "Importar prospectos" : "Import Leads",
  empty: lang === "es" ? "Sin tratos en esta etapa" : "No deals in this stage",
  pipelineValue: lang === "es" ? "Valor del pipeline" : "Pipeline value",
  openDeals: lang === "es" ? "Tratos abiertos" : "Open deals",
  won: lang === "es" ? "Ganados" : "Won",
});

function money(v: string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (!isFinite(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

interface DealRow {
  id: number;
  title: string;
  stage: CrmStage;
  priority: CrmPriority;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  company: string | null;
  location: string | null;
  language: Lang;
  estimatedValue: string | null;
  source: string;
  referralCode: string | null;
  nextFollowUpAt: string | Date | null;
  notes: string | null;
  updatedAt: string | Date;
  affiliateId?: number | null;
  needsHelpClosing?: boolean;
}

const priorityColor: Record<CrmPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-700",
};

export function CrmBoard({ lang = "en", affiliateId }: { lang?: Lang; affiliateId?: number }) {
  const t = L(lang);
  const utils = trpc.useUtils();
  const [masterAffiliateFilter, setMasterAffiliateFilter] = useState(MASTER_AFFILIATE_FILTER_ALL);
  const masterAffiliateId = masterAffiliateFilterId(masterAffiliateFilter);
  const boardInput = affiliateId != null
    ? { affiliateId }
    : masterAffiliateId != null
      ? { affiliateId: masterAffiliateId }
      : undefined;
  const { data, isLoading, error } = trpc.crm.board.useQuery(
    boardInput,
  );
  const [openDealId, setOpenDealId] = useState<number | null>(null);
  const [mobileStage, setMobileStage] = useState<CrmStage>("new");

  const deals = (data?.deals ?? []) as DealRow[];
  const affiliateNames = (data as any)?.affiliateNames as Record<number, string> | undefined;
  const affiliateBranding = (data as any)?.affiliateBranding as Record<number, CrmAffiliateBrand> | undefined;
  const isMasterView = (data as any)?.isMasterView === true;
  const affiliateOptions = useMemo(
    () => Object.entries(affiliateBranding ?? {}).sort(([, a], [, b]) => a.storeName.localeCompare(b.storeName)),
    [affiliateBranding],
  );

  const byStage = useMemo(() => {
    const map: Record<CrmStage, DealRow[]> = {
      new: [], contacted: [], qualified: [], quoted: [], won: [], lost: [],
    };
    for (const d of deals) map[d.stage]?.push(d);
    return map;
  }, [deals]);

  const openValue = useMemo(
    () => deals.filter((d) => !isClosedStage(d.stage)).reduce((s, d) => s + Number(d.estimatedValue ?? 0), 0),
    [deals],
  );
  const wonCount = byStage.won.length;
  const openCount = deals.filter((d) => !isClosedStage(d.stage)).length;

  const move = trpc.crm.moveStage.useMutation({
    onMutate: async (vars) => {
      await utils.crm.board.cancel();
      const prev = utils.crm.board.getData();
      utils.crm.board.setData(undefined, (old) =>
        old ? { ...old, deals: old.deals.map((d) => (d.id === vars.id ? { ...d, stage: vars.stage } : d)) } : old,
      );
      return { prev };
    },
    onError: (_e, _v, c) => { if (c?.prev) utils.crm.board.setData(undefined, c.prev); toast.error("Couldn't move deal"); },
    onSettled: () => utils.crm.board.invalidate(),
  });

  function onDropTo(stage: CrmStage, e: React.DragEvent) {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/deal-id"));
    if (id) move.mutate({ id, stage });
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        {error.data?.code === "FORBIDDEN"
          ? (lang === "es"
              ? "Tu cuenta aún no tiene acceso al CRM."
              : "Your account doesn't have CRM access yet.")
          : (lang === "es" ? "No se pudo cargar el CRM." : "Couldn't load the CRM board.")}
      </div>
    );
  }

  return (
    <div>
      {/* Header + stats + actions */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{t.title}</h3>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {isMasterView && (
            <Select value={masterAffiliateFilter} onValueChange={setMasterAffiliateFilter}>
              <SelectTrigger className="w-[210px] bg-card" aria-label="Filter deals by affiliate">
                <SelectValue placeholder="All affiliates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MASTER_AFFILIATE_FILTER_ALL}>All affiliates</SelectItem>
                {affiliateOptions.map(([id, affiliate]) => (
                  <SelectItem key={id} value={id}>{affiliate.storeName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <ImportLeadsDialog lang={lang} />
          <NewDealDialog lang={lang} affiliateId={affiliateId} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6 max-w-lg">
        <StatChip icon={<CircleDollarSign className="h-4 w-4" />} label={t.pipelineValue} value={money(String(openValue))} />
        <StatChip icon={<Inbox className="h-4 w-4" />} label={t.openDeals} value={String(openCount)} />
        <StatChip icon={<CircleDollarSign className="h-4 w-4" />} label={t.won} value={String(wonCount)} />
      </div>

      {/* Mobile stage selector */}
      <div className="md:hidden mb-4">
        <Select value={mobileStage} onValueChange={(v) => setMobileStage(v as CrmStage)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CRM_PIPELINE_STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {CRM_STAGE_LABELS[s][lang]} ({byStage[s].length})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-lg" />)}
        </div>
      ) : (
        <>
          {/* Mobile: single active stage */}
          <div className="md:hidden">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropTo(mobileStage, e)}
              className="rounded-lg border border-border bg-muted/20 p-3 min-h-[16rem]"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-foreground">{CRM_STAGE_LABELS[mobileStage][lang]}</span>
                <Badge variant="secondary">{byStage[mobileStage].length}</Badge>
              </div>
              <div className="space-y-2">
                {byStage[mobileStage].length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">{t.empty}</p>
                ) : (
                  byStage[mobileStage].map((d) => (
                    <DealCard key={d.id} deal={d} lang={lang} onOpen={() => setOpenDealId(d.id)} affiliateName={isMasterView && d.affiliateId ? affiliateNames?.[d.affiliateId] : undefined} affiliateBrand={isMasterView && d.affiliateId ? affiliateBranding?.[d.affiliateId] : undefined} />
                  ))
                )}
              </div>
            </div>
          </div>
          {/* Desktop: all columns */}
          <div className="hidden md:grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {CRM_PIPELINE_STAGES.map((stage) => (
              <div
                key={stage}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDropTo(stage, e)}
                className="rounded-lg border border-border bg-muted/20 p-3 min-h-[16rem]"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-foreground">{CRM_STAGE_LABELS[stage][lang]}</span>
                  <Badge variant="secondary">{byStage[stage].length}</Badge>
                </div>
                <div className="space-y-2">
                  {byStage[stage].length === 0 ? (
                    <p className="text-xs text-muted-foreground py-6 text-center">{t.empty}</p>
                  ) : (
                    byStage[stage].map((d) => (
                      <DealCard key={d.id} deal={d} lang={lang} onOpen={() => setOpenDealId(d.id)} affiliateName={isMasterView && d.affiliateId ? affiliateNames?.[d.affiliateId] : undefined} affiliateBrand={isMasterView && d.affiliateId ? affiliateBranding?.[d.affiliateId] : undefined} />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Closed lane */}
      <div className="grid gap-4 md:grid-cols-2 mt-4">
        {CRM_CLOSED_STAGES.map((stage) => (
          <div
            key={stage}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDropTo(stage, e)}
            className="rounded-lg border border-dashed border-border p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-muted-foreground">{CRM_STAGE_LABELS[stage][lang]}</span>
              <Badge variant="outline">{byStage[stage].length}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {byStage[stage].map((d) => (
                <button
                  key={d.id}
                  onClick={() => setOpenDealId(d.id)}
                  className="text-xs rounded border border-border bg-card px-2 py-1 hover:bg-accent"
                >
                  {d.title}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <DealDrawer dealId={openDealId} lang={lang} onClose={() => setOpenDealId(null)} />
    </div>
  );
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">{icon}{label}</div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function DealCard({ deal, lang, onOpen, affiliateName, affiliateBrand }: { deal: DealRow; lang: Lang; onOpen: () => void; affiliateName?: string; affiliateBrand?: CrmAffiliateBrand }) {
  const brandColor = affiliateCardColor(affiliateBrand);
  return (
    <button
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/deal-id", String(deal.id))}
      onClick={onOpen}
      className="w-full text-left rounded-lg border border-border bg-card p-3 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={brandColor ? { borderLeftWidth: 4, borderLeftColor: brandColor } : undefined}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-sm font-medium text-foreground leading-snug">{deal.title}</span>
        <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${priorityColor[deal.priority]}`}>
          {CRM_PRIORITY_LABELS[deal.priority][lang]}
        </span>
      </div>
      {affiliateName && (
        <div className="text-[10px] font-medium text-foreground bg-muted rounded px-1.5 py-0.5 inline-flex items-center gap-1.5 mb-1">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: brandColor }} />
          {affiliateName}
        </div>
      )}
      {deal.needsHelpClosing && (
        <div className="text-[10px] font-medium text-red-600 bg-red-50 rounded px-1.5 py-0.5 inline-block mb-1">Needs Help Closing</div>
      )}
      {deal.company && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground"><Building2 className="h-3 w-3" />{deal.company}</div>
      )}
      {deal.contactName && (
        <div className="text-xs text-muted-foreground">{deal.contactName}</div>
      )}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs font-semibold text-foreground">{money(deal.estimatedValue)}</span>
        <span className="flex items-center gap-1">
          {deal.language === "es" && <Languages className="h-3 w-3 text-[var(--color-gold,theme(colors.amber.600))]" />}
          {deal.referralCode && <Badge variant="outline" className="text-[10px]">{deal.referralCode}</Badge>}
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      </div>
    </button>
  );
}

// ─── New deal dialog ────────────────────────────────────────────────────────
function NewDealDialog({ lang, affiliateId }: { lang: Lang; affiliateId?: number }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", contactName: "", contactEmail: "", contactPhone: "",
    company: "", location: "", estimatedValue: "", priority: "medium" as CrmPriority,
    language: lang as Lang, notes: "",
  });
  const create = trpc.crm.create.useMutation({
    onSuccess: () => {
      toast.success(lang === "es" ? "Trato creado" : "Deal created");
      utils.crm.board.invalidate();
      setOpen(false);
      setForm({ title: "", contactName: "", contactEmail: "", contactPhone: "", company: "", location: "", estimatedValue: "", priority: "medium", language: lang, notes: "" });
    },
    onError: () => toast.error("Couldn't create deal"),
  });
  function submit() {
    if (!form.title.trim()) { toast.error(lang === "es" ? "El título es obligatorio" : "Title is required"); return; }
    create.mutate({
      title: form.title.trim(),
      contactName: form.contactName || null,
      contactEmail: form.contactEmail || null,
      contactPhone: form.contactPhone || null,
      company: form.company || null,
      location: form.location || null,
      estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : null,
      priority: form.priority,
      language: form.language,
      notes: form.notes || null,
      ...(affiliateId != null ? { affiliateId } : {}),
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[var(--color-navy,#1a2b4a)] text-white"><Plus className="h-4 w-4 mr-1" />{L(lang).newDeal}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{L(lang).newDeal}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Field label={lang === "es" ? "Título" : "Title"}>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={lang === "es" ? "Remodelación de cocina — J. Rivera" : "Kitchen remodel — J. Rivera"} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={lang === "es" ? "Contacto" : "Contact"}><Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></Field>
            <Field label={lang === "es" ? "Empresa" : "Company"}><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
            <Field label="Email"><Input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></Field>
            <Field label={lang === "es" ? "Teléfono" : "Phone"}><Input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} /></Field>
            <Field label={lang === "es" ? "Ubicación / ZIP" : "Location / ZIP"}><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
            <Field label={lang === "es" ? "Valor estimado" : "Estimated value"}><Input type="number" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} /></Field>
            <Field label={lang === "es" ? "Prioridad" : "Priority"}>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as CrmPriority })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["low", "medium", "high"] as CrmPriority[]).map((p) => <SelectItem key={p} value={p}>{CRM_PRIORITY_LABELS[p][lang]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={lang === "es" ? "Idioma del cliente" : "Customer language"}>
              <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v as Lang })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label={lang === "es" ? "Notas" : "Notes"}><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={create.isPending} className="bg-[var(--color-navy,#1a2b4a)] text-white">
            {create.isPending ? "…" : (lang === "es" ? "Crear" : "Create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

// ─── Import leads dialog ──────────────────────────────────────────────────────
function ImportLeadsDialog({ lang }: { lang: Lang }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = trpc.crm.importableLeads.useQuery(undefined, { enabled: open });
  const importLead = trpc.crm.importLead.useMutation({
    onSuccess: () => {
      toast.success(lang === "es" ? "Prospecto importado" : "Lead imported");
      utils.crm.board.invalidate();
      utils.crm.importableLeads.invalidate();
    },
    onError: () => toast.error("Couldn't import lead"),
  });
  const reqs = data?.orderRequests ?? [];
  const apps = data?.proApplications ?? [];
  const nothing = !isLoading && reqs.length === 0 && apps.length === 0;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-card"><Inbox className="h-4 w-4 mr-1" />{L(lang).importLeads}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{L(lang).importLeads}</DialogTitle></DialogHeader>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : nothing ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {lang === "es" ? "No hay prospectos nuevos para importar." : "No new leads to import."}
          </p>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {reqs.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">{lang === "es" ? "Solicitudes de pedido" : "Order requests"}</p>
                <div className="space-y-2">
                  {reqs.map((r: { id: number; requestNumber: string; originatorName: string | null; totalAmount: string | null }) => (
                    <div key={r.id} className="flex items-center justify-between rounded border border-border p-2">
                      <div className="text-sm">
                        <div className="font-medium text-foreground">{r.requestNumber}</div>
                        <div className="text-xs text-muted-foreground">{r.originatorName ?? "—"} · {money(r.totalAmount)}</div>
                      </div>
                      <Button size="sm" variant="outline" disabled={importLead.isPending} onClick={() => importLead.mutate({ type: "order_request", id: r.id })}>
                        {lang === "es" ? "Importar" : "Import"}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {apps.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">{lang === "es" ? "Solicitudes de profesionales" : "Pro applications"}</p>
                <div className="space-y-2">
                  {apps.map((a: { id: number; companyName: string; contactName: string }) => (
                    <div key={a.id} className="flex items-center justify-between rounded border border-border p-2">
                      <div className="text-sm">
                        <div className="font-medium text-foreground">{a.companyName}</div>
                        <div className="text-xs text-muted-foreground">{a.contactName}</div>
                      </div>
                      <Button size="sm" variant="outline" disabled={importLead.isPending} onClick={() => importLead.mutate({ type: "pro_application", id: a.id })}>
                        {lang === "es" ? "Importar" : "Import"}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Deal detail drawer ───────────────────────────────────────────────────────
function DealDrawer({ dealId, lang, onClose }: { dealId: number | null; lang: Lang; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data } = trpc.crm.deal.useQuery({ id: dealId! }, { enabled: dealId != null });
  const [note, setNote] = useState("");
  const addActivity = trpc.crm.addActivity.useMutation({
    onSuccess: () => { setNote(""); utils.crm.deal.invalidate({ id: dealId! }); utils.crm.board.invalidate(); },
    onError: () => toast.error("Couldn't add note"),
  });
  const updateStage = trpc.crm.moveStage.useMutation({
    onSuccess: () => { utils.crm.deal.invalidate({ id: dealId! }); utils.crm.board.invalidate(); },
  });
  const remove = trpc.crm.remove.useMutation({
    onSuccess: () => { toast.success(lang === "es" ? "Trato eliminado" : "Deal removed"); utils.crm.board.invalidate(); onClose(); },
  });
  const updateDeal = trpc.crm.update.useMutation({
    onSuccess: () => { utils.crm.deal.invalidate({ id: dealId! }); utils.crm.board.invalidate(); },
    onError: () => toast.error("Update failed"),
  });

  const { data: linkable } = trpc.crm.linkableDesigns.useQuery(undefined, { enabled: dealId != null });
  const [designToLink, setDesignToLink] = useState<string>("");
  const linkDesign = trpc.crm.linkDesign.useMutation({
    onSuccess: (r) => {
      setDesignToLink("");
      utils.crm.deal.invalidate({ id: dealId! });
      toast.success(r?.alreadyLinked ? (lang === "es" ? "Ya estaba vinculado" : "Already linked") : (lang === "es" ? "Dise\u00f1o vinculado" : "Design linked"));
    },
    onError: () => toast.error(lang === "es" ? "No se pudo vincular" : "Couldn't link design"),
  });
  const unlinkDesign = trpc.crm.unlinkDesign.useMutation({
    onSuccess: () => utils.crm.deal.invalidate({ id: dealId! }),
    onError: () => toast.error(lang === "es" ? "No se pudo desvincular" : "Couldn't unlink"),
  });

  const deal = data?.deal as DealRow | undefined;
  const activities = (data?.activities ?? []) as { id: number; kind: string; body: string; createdAt: string | Date }[];
  const linkedDesigns = (data?.linkedDesigns ?? []) as { id: number; designId: number; designName: string }[];
  const emails = (data?.emails ?? []) as {
    id: number; toEmail: string; fromEmail: string; subject: string; body: string;
    sentByName: string | null; sentAt: string | Date;
  }[];
  const linkedIds = new Set(linkedDesigns.map((l) => l.designId));
  const availableDesigns = (linkable ?? []).filter((d) => !linkedIds.has(d.id));

  return (
    <Sheet open={dealId != null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {deal ? (
          <>
            <SheetHeader>
              <SheetTitle className="pr-6">{deal.title}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-4">
              <div className="flex items-center gap-2">
                <Select value={deal.stage} onValueChange={(v) => updateStage.mutate({ id: deal.id, stage: v as CrmStage })}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CRM_STAGES.map((s) => <SelectItem key={s} value={s}>{CRM_STAGE_LABELS[s][lang]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className={`text-xs font-medium px-2 py-1 rounded ${priorityColor[deal.priority]}`}>{CRM_PRIORITY_LABELS[deal.priority][lang]}</span>
                {deal.language === "es" && <Badge variant="outline"><Languages className="h-3 w-3 mr-1" />ES</Badge>}
              </div>

              <div className="rounded-lg border border-border p-3 space-y-1.5 text-sm">
                {deal.company && <div className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-muted-foreground" />{deal.company}</div>}
                {deal.contactName && <div>{deal.contactName}</div>}
                {deal.contactEmail && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><a className="text-primary hover:underline" href={`mailto:${deal.contactEmail}`}>{deal.contactEmail}</a></div>}
                {deal.contactPhone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><a className="text-primary hover:underline" href={`tel:${deal.contactPhone}`}>{deal.contactPhone}</a></div>}
                {deal.location && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />{deal.location}</div>}
                <div className="flex items-center gap-2 font-semibold pt-1"><CircleDollarSign className="h-3.5 w-3.5 text-muted-foreground" />{money(deal.estimatedValue)}</div>
                {deal.notes && <p className="text-xs text-muted-foreground pt-1 whitespace-pre-wrap">{deal.notes}</p>}
              </div>

              {/* Activity timeline */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">{lang === "es" ? "Actividad" : "Activity"}</p>
                <div className="flex gap-2 mb-3">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={lang === "es" ? "Agregar nota…" : "Add a note…"} onKeyDown={(e) => { if (e.key === "Enter" && note.trim()) addActivity.mutate({ dealId: deal.id, body: note.trim() }); }} />
                  <Button variant="outline" disabled={!note.trim() || addActivity.isPending} onClick={() => addActivity.mutate({ dealId: deal.id, body: note.trim() })}>{lang === "es" ? "Agregar" : "Add"}</Button>
                </div>
                <div className="space-y-2">
                  {activities.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{lang === "es" ? "Sin actividad todavía." : "No activity yet."}</p>
                  ) : activities.map((a) => (
                    <div key={a.id} className="text-xs border-l-2 border-border pl-3 py-0.5">
                      <span className="text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</span>
                      <span className="ml-2 uppercase text-[10px] tracking-wide text-muted-foreground">{a.kind}</span>
                      <p className="text-foreground">{a.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Email the contact */}
              <EmailSection deal={deal} lang={lang} emails={emails} dealId={deal.id} />

              {/* Linked designs */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">{lang === "es" ? "Dise\u00f1os vinculados" : "Linked Designs"}</p>
                <div className="flex gap-2 mb-3">
                  <Select value={designToLink} onValueChange={setDesignToLink}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder={availableDesigns.length ? (lang === "es" ? "Elegir un dise\u00f1o guardado\u2026" : "Choose a saved design\u2026") : (lang === "es" ? "Sin dise\u00f1os guardados" : "No saved designs")} /></SelectTrigger>
                    <SelectContent>
                      {availableDesigns.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" disabled={!designToLink || linkDesign.isPending} onClick={() => linkDesign.mutate({ dealId: deal.id, designId: Number(designToLink) })}>{lang === "es" ? "Vincular" : "Attach"}</Button>
                </div>
                <div className="space-y-2">
                  {linkedDesigns.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{lang === "es" ? "Ning\u00fan dise\u00f1o vinculado." : "No designs linked yet."}</p>
                  ) : linkedDesigns.map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-sm border border-border rounded-md px-3 py-1.5">
                      <a href={`/designer?load=${l.designId}`} className="text-primary hover:underline truncate">{l.designName}</a>
                      <button className="text-muted-foreground hover:text-red-600 shrink-0 ml-2" onClick={() => unlinkDesign.mutate({ dealId: deal.id, linkId: l.id })} aria-label="Unlink design"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>

              <QuickInvoiceDialog deal={deal} dealId={deal.id} linkedDesigns={linkedDesigns} lang={lang} />

              <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => remove.mutate({ id: deal.id })} disabled={remove.isPending}>
                <Trash2 className="h-4 w-4 mr-1" />{lang === "es" ? "Eliminar trato" : "Delete deal"}
              </Button>

              {/* Help closing toggle */}
              <Button
                variant={deal.needsHelpClosing ? "default" : "outline"}
                className={deal.needsHelpClosing ? "bg-red-600 hover:bg-red-700 text-white" : "border-red-200 text-red-600 hover:bg-red-50"}
                onClick={() => updateDeal.mutate({ id: deal.id, needsHelpClosing: !deal.needsHelpClosing })}
                disabled={updateDeal.isPending}
              >
                {deal.needsHelpClosing
                  ? (lang === "es" ? "Ayuda solicitada" : "Help Requested")
                  : (lang === "es" ? "Solicitar ayuda para cerrar" : "Request Help Closing")}
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3 mt-6"><Skeleton className="h-8" /><Skeleton className="h-24" /></div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function QuickInvoiceDialog({
  deal,
  dealId,
  linkedDesigns,
  lang,
}: {
  deal: DealRow;
  dealId: number;
  linkedDesigns: { id: number; designId: number; designName: string }[];
  lang: Lang;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [cabinetOrder, setCabinetOrder] = useState({ enabled: Number(deal.estimatedValue ?? 0) > 0, amount: deal.estimatedValue ?? "" });
  const [kitchenDesign, setKitchenDesign] = useState({ enabled: false, amount: "" });
  const [installation, setInstallation] = useState({ enabled: false, amount: "" });
  const [selectedDesignId, setSelectedDesignId] = useState<string>(linkedDesigns[0] ? String(linkedDesigns[0].id) : "none");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setCabinetOrder({ enabled: Number(deal.estimatedValue ?? 0) > 0, amount: deal.estimatedValue ?? "" });
    setKitchenDesign({ enabled: false, amount: "" });
    setInstallation({ enabled: false, amount: "" });
    setSelectedDesignId(linkedDesigns[0] ? String(linkedDesigns[0].id) : "none");
    setNotes("");
  }, [deal.id, deal.estimatedValue, linkedDesigns.length, linkedDesigns[0]?.id]);

  const addActivity = trpc.crm.addActivity.useMutation({
    onSuccess: () => utils.crm.deal.invalidate({ id: dealId }),
  });
  const selectedDesign = linkedDesigns.find((design) => String(design.id) === selectedDesignId) ?? null;
  const label = (english: string, spanish: string) => lang === "es" ? spanish : english;

  function lineFor(enabled: boolean, description: string, amount: string): CrmQuickInvoiceLine | null {
    if (!enabled) return null;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return { description, amount: parsed };
  }

  function createInvoice() {
    const lines = [
      lineFor(cabinetOrder.enabled, label("Cabinet Order", "Pedido de gabinetes"), cabinetOrder.amount),
      lineFor(kitchenDesign.enabled, label("Kitchen Design", "Diseño de cocina"), kitchenDesign.amount),
      lineFor(installation.enabled, label("Installation", "Instalación"), installation.amount),
    ].filter((line): line is CrmQuickInvoiceLine => line !== null);
    if (!lines.length) {
      toast.error(label("Select at least one service and enter a valid amount.", "Seleccione al menos un servicio e ingrese un importe válido."));
      return;
    }
    const now = new Date();
    const opened = openCrmQuickInvoicePdf({
      invoiceNumber: `CRM-${dealId}-${now.toISOString().slice(0, 10).replaceAll("-", "")}`,
      issuedOn: now.toLocaleDateString(),
      customerName: deal.contactName || deal.company || deal.title,
      customerEmail: deal.contactEmail,
      customerPhone: deal.contactPhone,
      linkedDesignName: selectedDesign?.designName ?? null,
      notes: notes.trim() || null,
      lines,
    });
    if (!opened) {
      toast.error(label("Your browser blocked the PDF window. Please allow pop-ups and try again.", "El navegador bloqueó la ventana de PDF. Permita ventanas emergentes e inténtelo de nuevo."));
      return;
    }
    addActivity.mutate({
      dealId,
      kind: "note",
      body: `Quick PDF invoice prepared: ${lines.map((line) => line.description).join(", ")}${selectedDesign ? ` · Linked design: ${selectedDesign.designName}` : ""}.`,
    });
    toast.success(label("Invoice opened. Use Print / Save as PDF to finish.", "Factura abierta. Use Imprimir / Guardar como PDF para finalizar."));
    setOpen(false);
  }

  const ServiceRow = ({ id, title, state, setState }: {
    id: string;
    title: string;
    state: { enabled: boolean; amount: string };
    setState: (state: { enabled: boolean; amount: string }) => void;
  }) => (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_7rem] items-center gap-2 rounded-md border border-border p-2.5">
      <Checkbox id={id} checked={state.enabled} onCheckedChange={(checked) => setState({ ...state, enabled: checked === true })} />
      <Label htmlFor={id} className="cursor-pointer text-sm font-medium">{title}</Label>
      <Input aria-label={`${title} amount`} type="number" min="0" step="0.01" placeholder="$0.00" value={state.amount} onChange={(event) => setState({ ...state, amount: event.target.value })} disabled={!state.enabled} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full bg-card"><FileText className="mr-2 h-4 w-4" />{label("Quick PDF Invoice", "Factura PDF rápida")}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{label("Quick PDF Invoice", "Factura PDF rápida")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{label("Select the parts of this lead to bill. The PDF opens immediately so you can print or save it.", "Seleccione las partes de este prospecto para facturar. El PDF se abre de inmediato para imprimirlo o guardarlo.")}</p>
        <div className="space-y-2">
          <ServiceRow id="invoice-cabinet-order" title={label("Cabinet Order", "Pedido de gabinetes")} state={cabinetOrder} setState={setCabinetOrder} />
          <ServiceRow id="invoice-kitchen-design" title={label("Kitchen Design", "Diseño de cocina")} state={kitchenDesign} setState={setKitchenDesign} />
          <ServiceRow id="invoice-installation" title={label("Installation", "Instalación")} state={installation} setState={setInstallation} />
        </div>
        <Field label={label("Linked design (optional)", "Diseño vinculado (opcional)")}>
          <Select value={selectedDesignId} onValueChange={setSelectedDesignId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{label("No linked design", "Sin diseño vinculado")}</SelectItem>
              {linkedDesigns.map((design) => <SelectItem key={design.id} value={String(design.id)}>{design.designName}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label={label("Invoice notes (optional)", "Notas de la factura (opcional)")}>
          <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={label("Scope, payment terms, or next steps", "Alcance, condiciones de pago o próximos pasos")} />
        </Field>
        <DialogFooter><Button onClick={createInvoice} disabled={addActivity.isPending} className="bg-[var(--color-navy,#1a2b4a)] text-white"><FileText className="mr-2 h-4 w-4" />{label("Open PDF Invoice", "Abrir factura PDF")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Email the deal contact ───────────────────────────────────────────────────
function EmailSection({
  deal,
  lang,
  emails,
  dealId,
}: {
  deal: DealRow;
  lang: Lang;
  emails: {
    id: number; toEmail: string; fromEmail: string; subject: string; body: string;
    sentByName: string | null; sentAt: string | Date;
  }[];
  dealId: number;
}) {
  const utils = trpc.useUtils();
  const { data: readiness } = trpc.crm.emailReadiness.useQuery();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(deal.contactEmail ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const configured = readiness?.configured ?? false;
  const enabled = readiness?.enabled ?? false;
  const blockReason = crmEmailBlockedReason({ configured, enabled });
  const canSend = blockReason == null;

  // Keep the To field synced with the deal's contact email when a new deal opens.
  const [seededFor, setSeededFor] = useState<number | null>(null);
  if (seededFor !== dealId) {
    setSeededFor(dealId);
    setTo(deal.contactEmail ?? "");
    setSubject("");
    setBody("");
  }

  const send = trpc.crm.sendEmail.useMutation({
    onSuccess: () => {
      toast.success(lang === "es" ? "Correo enviado" : "Email sent");
      setOpen(false);
      setSubject("");
      setBody("");
      utils.crm.deal.invalidate({ id: dealId });
      utils.crm.emailLog.invalidate({ dealId });
      utils.crm.board.invalidate();
    },
    onError: (e) => {
      // The server returns "not_configured" / "disabled" for guard failures.
      const raw = e.message;
      if (raw === "not_configured" || raw === "disabled") {
        toast.error(CRM_EMAIL_BLOCK_MESSAGES[raw][lang]);
      } else {
        toast.error(raw || (lang === "es" ? "No se pudo enviar" : "Couldn't send email"));
      }
    },
  });

  function submit() {
    const t = to.trim();
    if (!t) { toast.error(lang === "es" ? "Falta el destinatario" : "Recipient is required"); return; }
    if (!subject.trim()) { toast.error(lang === "es" ? "Falta el asunto" : "Subject is required"); return; }
    if (!body.trim()) { toast.error(lang === "es" ? "El mensaje está vacío" : "Message is empty"); return; }
    send.mutate({ dealId, to: t, subject: subject.trim(), body: body.trim() });
  }

  const heading = lang === "es" ? "Correo" : "Email";
  const sentLabel = lang === "es" ? "Enviados" : "Sent";

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground">{heading}</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="bg-card h-7">
              <Send className="h-3.5 w-3.5 mr-1" />
              {lang === "es" ? "Enviar correo" : "Send email"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{lang === "es" ? "Enviar correo" : "Send email"}</DialogTitle>
            </DialogHeader>

            {!canSend ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p>{CRM_EMAIL_BLOCK_MESSAGES[blockReason!][lang]}</p>
                    <a
                      href="/admin?tab=email-settings"
                      className="mt-2 inline-flex items-center gap-1 font-medium text-amber-900 underline"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      {lang === "es" ? "Abrir Configuración de correo" : "Open Email Settings"}
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                {readiness?.from && (
                  <p className="text-xs text-muted-foreground">
                    {lang === "es" ? "Desde" : "From"}: <span className="font-medium text-foreground">{readiness.from}</span>
                  </p>
                )}
                <Field label={lang === "es" ? "Para" : "To"}>
                  <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" type="email" />
                </Field>
                <Field label={lang === "es" ? "Asunto" : "Subject"}>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </Field>
                <Field label={lang === "es" ? "Mensaje" : "Message"}>
                  <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
                </Field>
              </div>
            )}

            <DialogFooter>
              {canSend && (
                <Button onClick={submit} disabled={send.isPending} className="bg-[var(--color-navy,#1a2b4a)] text-white">
                  {send.isPending ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner className="h-4 w-4" />
                      {lang === "es" ? "Enviando…" : "Sending…"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Send className="h-4 w-4" />
                      {lang === "es" ? "Enviar" : "Send"}
                    </span>
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Sent history */}
      {emails.length === 0 ? (
        <p className="text-xs text-muted-foreground">{lang === "es" ? "Ningún correo enviado aún." : "No emails sent yet."}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{sentLabel} ({emails.length})</p>
          {emails.map((m) => (
            <details key={m.id} className="text-xs rounded-md border border-border bg-card px-3 py-2">
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground truncate">{m.subject}</span>
                  <span className="shrink-0 text-muted-foreground">{new Date(m.sentAt).toLocaleDateString()}</span>
                </div>
                <div className="text-muted-foreground truncate">
                  {lang === "es" ? "Para" : "To"}: {m.toEmail}
                </div>
              </summary>
              <div className="mt-2 border-t border-border pt-2 text-muted-foreground">
                <div>{lang === "es" ? "De" : "From"}: {m.fromEmail}</div>
                {m.sentByName && <div>{lang === "es" ? "Enviado por" : "Sent by"}: {m.sentByName}</div>}
                <div>{new Date(m.sentAt).toLocaleString()}</div>
                <p className="mt-2 whitespace-pre-wrap text-foreground">{m.body}</p>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
