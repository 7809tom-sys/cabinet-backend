import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Waves, Search, Star } from "lucide-react";

const CATEGORIES = [
  "Sinks & Faucets",
  "Flooring",
  "Shower & Bath",
  "Toilets & Bidets",
  "Tile & Mosaic",
  "Quartz Slabs (Countertops)",
  "Samples",
  "Marketing & Merchandise",
] as const;

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toFixed(2)}`;

export default function PelicanCatalogAdmin() {
  const utils = trpc.useUtils();
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  // simple debounce
  useMemo(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, error } = trpc.pelican.adminList.useQuery({
    category: category === "all" ? undefined : (category as any),
    search: debounced || undefined,
    limit: 200,
    offset: 0,
  });

  const setVisibility = trpc.pelican.setVisibility.useMutation({
    onSuccess: () => utils.pelican.adminList.invalidate(),
    onError: (e) => toast.error(e.message || "Failed to update"),
  });
  const setPopular = trpc.pelican.setPopular.useMutation({
    onSuccess: () => utils.pelican.adminList.invalidate(),
    onError: (e) => toast.error(e.message || "Failed to update"),
  });
  const setCoverage = trpc.pelican.setCoverage.useMutation({
    onSuccess: () => utils.pelican.adminList.invalidate(),
    onError: (e) => toast.error(e.message || "Failed to update"),
  });
  const setMaterialImage = trpc.pelican.setMaterialImage.useMutation({
    onSuccess: () => {
      void utils.pelican.adminList.invalidate();
      toast.success("3D material swatch updated.");
    },
    onError: (e) => toast.error(e.message || "The material swatch could not be updated."),
  });

  const items = data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Waves className="h-5 w-5" /> Pelican Catalog
        </CardTitle>
        <CardDescription>
          Manage which Pelican items are active, shown in the catalog and
          designer, and flagged as featured. Sell prices come from the per-category
          markups on the Pricing &amp; Margins tab.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, code, description…"
              className="pl-9"
            />
          </div>
          {data && (
            <span className="text-sm text-muted-foreground">
              {data.total} item{data.total === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-destructive">
            {error.message || "Could not load Pelican items."}
          </p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No Pelican items match your filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Sell</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-center">Catalog</TableHead>
                  <TableHead className="text-center">Designer</TableHead>
                  <TableHead className="text-center">Featured</TableHead>
                  <TableHead className="text-right">Sq ft/Box</TableHead>
                  <TableHead className="min-w-[220px]">3D Material Swatch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it: any) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      <div className="font-medium">{it.name}</div>
                      <div className="text-xs text-muted-foreground">{it.pelicanCode}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {it.category}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {money(it.yourCost ?? it.listPrice)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {money(it.sellPrice)}
                      {typeof it.markupBps === "number" && (
                        <Badge variant="outline" className="ml-1 text-[10px]">
                          {(it.markupBps / 100).toFixed(0)}%
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={!!it.isActive}
                        onCheckedChange={(v) =>
                          setVisibility.mutate({ id: it.id, isActive: v })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={!!it.showInCatalog}
                        onCheckedChange={(v) =>
                          setVisibility.mutate({ id: it.id, showInCatalog: v })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={!!it.showInDesigner}
                        onCheckedChange={(v) =>
                          setVisibility.mutate({ id: it.id, showInDesigner: v })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        variant={it.isPopular ? "default" : "outline"}
                        className="h-8 w-8 p-0"
                        onClick={() =>
                          setPopular.mutate({
                            id: it.id,
                            isPopular: !it.isPopular,
                            popularRank: it.popularRank ?? 0,
                          })
                        }
                        title={it.isPopular ? "Unfeature" : "Feature"}
                      >
                        <Star
                          className={`h-4 w-4 ${it.isPopular ? "fill-current" : ""}`}
                        />
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        className="w-16 rounded border border-border bg-transparent px-1.5 py-0.5 text-right text-xs"
                        defaultValue={it.coverageSqFt ? parseFloat(String(it.coverageSqFt)) : ""}
                        placeholder="—"
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          const num = val ? parseFloat(val) : null;
                          if (num !== (it.coverageSqFt ? parseFloat(String(it.coverageSqFt)) : null)) {
                            setCoverage.mutate({ id: it.id, coverageSqFt: num && num > 0 ? num : null });
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 min-w-[210px] text-xs"
                        type="url"
                        defaultValue={it.materialImageUrl ?? ""}
                        placeholder="Approved repeatable material image URL"
                        onBlur={(event) => {
                          const nextValue = event.target.value.trim() || null;
                          if (nextValue !== (it.materialImageUrl ?? null)) {
                            setMaterialImage.mutate({ id: it.id, materialImageUrl: nextValue });
                          }
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
