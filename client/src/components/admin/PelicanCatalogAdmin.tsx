import { useMemo, useState } from "react";
import { Search, Star, Eye, EyeOff, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

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

type Category = (typeof CATEGORIES)[number];

export default function PelicanCatalogAdmin() {
  const [category, setCategory] = useState<Category | "all">("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const utils = trpc.useUtils();

  // Debounce the search box so we don't hammer the endpoint on every keystroke.
  useMemo(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const listInput = useMemo(
    () => ({
      category: category === "all" ? undefined : (category as Category),
      search: debounced || undefined,
      limit: 100,
      offset: 0,
    }),
    [category, debounced],
  );

  const { data, isLoading } = trpc.pelican.adminList.useQuery(listInput);
  const setPopular = trpc.pelican.setPopular.useMutation({
    onSuccess: () => utils.pelican.adminList.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const setVisibility = trpc.pelican.setVisibility.useMutation({
    onSuccess: () => utils.pelican.adminList.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Pelican International Catalog</h2>
        <p className="text-sm text-muted-foreground">
          Control which surfaces &amp; fixtures appear in the storefront and the design tool, and mark the
          items you want to push to the top as popular.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setCategory("all")}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              category === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                category === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="relative ml-auto min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name / code…"
            className="pl-8 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">MSRP</TableHead>
              <TableHead className="text-center">Popular</TableHead>
              <TableHead className="text-center">Catalog</TableHead>
              <TableHead className="text-center">Designer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  No products match this filter.
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => {
                const msrp = row.msrp ?? row.listPrice;
                const busyPop = setPopular.isPending && setPopular.variables?.id === row.id;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.pelicanCode}</TableCell>
                    <TableCell className="max-w-[280px] truncate">{row.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {row.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {msrp
                        ? Number(msrp).toLocaleString(undefined, {
                            style: "currency",
                            currency: "USD",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        variant={row.isPopular ? "default" : "outline"}
                        className="h-7 px-2"
                        disabled={busyPop}
                        onClick={() =>
                          setPopular.mutate({
                            id: row.id,
                            isPopular: !row.isPopular,
                            popularRank: row.popularRank ?? 0,
                          })
                        }
                      >
                        <Star className={`h-3.5 w-3.5 ${row.isPopular ? "fill-current" : ""}`} />
                      </Button>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={row.showInCatalog}
                        onCheckedChange={(v) => setVisibility.mutate({ id: row.id, showInCatalog: v })}
                        aria-label="Show in catalog"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={row.showInDesigner}
                        onCheckedChange={(v) => setVisibility.mutate({ id: row.id, showInDesigner: v })}
                        aria-label="Show in designer"
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Eye className="h-3.5 w-3.5" /> visible /
        <EyeOff className="h-3.5 w-3.5" /> hidden. Popular items surface first in both the storefront and the
        design tool.
      </p>
    </div>
  );
}
