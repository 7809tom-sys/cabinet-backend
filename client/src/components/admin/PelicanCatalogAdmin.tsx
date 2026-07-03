import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Search, Star } from "lucide-react";

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

export default function PelicanCatalogAdmin() {
  const [category, setCategory] = useState<string>("Flooring");
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.pelican.adminList.useQuery({
    category: category as (typeof CATEGORIES)[number],
    search: search.trim() || undefined,
    limit: 200,
  });

  const setPopular = trpc.pelican.setPopular.useMutation({
    onSuccess: () => utils.pelican.adminList.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const setVisibility = trpc.pelican.setVisibility.useMutation({
    onSuccess: () => utils.pelican.adminList.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const setPricing = trpc.pelican.setPricing.useMutation({
    onSuccess: () => {
      utils.pelican.adminList.invalidate();
      toast.success("Price updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, code, description"
            className="pl-8"
          />
        </div>
        <Badge variant="secondary">{data?.total ?? 0} items</Badge>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading catalog...
        </div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">No products match.</div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Sub-category</TableHead>
                <TableHead className="w-[120px]">List Price</TableHead>
                <TableHead className="text-center">Popular</TableHead>
                <TableHead className="text-center">Catalog</TableHead>
                <TableHead className="text-center">Designer</TableHead>
                <TableHead className="text-center">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it: any) => (
                <TableRow key={it.id}>
                  <TableCell className="font-mono text-xs">{it.pelicanCode}</TableCell>
                  <TableCell className="max-w-[280px]">
                    <div className="font-medium text-sm truncate">{it.name}</div>
                    {it.description ? (
                      <div className="text-[11px] text-muted-foreground truncate">{it.description}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{it.subCategory ?? "-"}</TableCell>
                  <TableCell>
                    <Input
                      defaultValue={it.listPrice ?? ""}
                      className="h-8 w-[100px]"
                      onBlur={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!Number.isNaN(v) && String(v) !== String(it.listPrice)) {
                          setPricing.mutate({ id: it.id, listPrice: v });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant={it.isPopular ? "default" : "outline"}
                      size="sm"
                      className="h-8 px-2"
                      onClick={() =>
                        setPopular.mutate({
                          id: it.id,
                          isPopular: !it.isPopular,
                          popularRank: it.popularRank ?? 0,
                        })
                      }
                    >
                      <Star className={"h-3.5 w-3.5 " + (it.isPopular ? "fill-current" : "")} />
                    </Button>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={!!it.showInCatalog}
                      onCheckedChange={(v) => setVisibility.mutate({ id: it.id, showInCatalog: v })}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={!!it.showInDesigner}
                      onCheckedChange={(v) => setVisibility.mutate({ id: it.id, showInDesigner: v })}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={!!it.isActive}
                      onCheckedChange={(v) => setVisibility.mutate({ id: it.id, isActive: v })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
