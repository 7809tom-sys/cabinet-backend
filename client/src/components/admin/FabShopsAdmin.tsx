import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Search, Undo2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

/** The list renders at most this many rows; search narrows it down first. */
const MAX_ROWS = 200;

export default function FabShopsAdmin() {
  const utils = trpc.useUtils();
  const [stateFilter, setStateFilter] = useState("");
  const [search, setSearch] = useState("");

  const list = trpc.fabShops.list.useQuery({ state: stateFilter || null });
  const imports = trpc.fabShops.imports.useQuery();
  const undo = trpc.fabShops.undoImport.useMutation({
    onSuccess: async (result) => {
      toast.success(`Removed ${result.deletedShops} shop${result.deletedShops === 1 ? "" : "s"} and ${result.deletedQuoteMatches} quote match${result.deletedQuoteMatches === 1 ? "" : "es"}.`);
      await Promise.all([utils.fabShops.list.invalidate(), utils.fabShops.imports.invalidate()]);
    },
    onError: (error) => toast.error(error.message),
  });

  const shops = list.data?.shops ?? [];
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return shops;
    return shops.filter((shop) =>
      [shop.name, shop.city, shop.zip, shop.state, shop.phone, shop.email, shop.website, shop.sourceDoc]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [shops, search]);

  if (list.isLoading) {
    return <div className="flex justify-center py-12"><Spinner className="h-6 w-6 text-primary" /></div>;
  }

  if (list.error) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <p className="text-destructive">Couldn't load fabrication shops: {list.error.message}</p>
          <Button variant="outline" size="sm" onClick={() => list.refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (!list.data?.ready) {
    return (
      <Card>
        <CardContent className="py-10 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <p className="font-semibold">The fabrication shop tables are not created yet.</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Run blocks 1 and 2 of <strong>docs/sql/0291_fabrication_shops_countertop_zip.tidb.sql</strong> in the TiDB SQL
            editor. That creates <code>fabrication_shops</code> and <code>countertop_quote_fab_shops</code>. The Countertop
            Quotes tab keeps working without them.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="mr-auto">
              <p className="text-sm font-semibold">{list.data.total} fabrication shops</p>
              <p className="text-xs text-muted-foreground">
                Matched to a countertop quote by ZIP. Nothing here emails or calls a shop.
              </p>
            </div>
            <label className="text-xs text-muted-foreground">
              State
              <select
                className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
                value={stateFilter}
                onChange={(event) => setStateFilter(event.target.value)}
              >
                <option value="">All</option>
                {list.data.states.map((entry) => (
                  <option key={entry.state} value={entry.state}>{entry.state} ({entry.count})</option>
                ))}
              </select>
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="w-64 pl-8"
                placeholder="Name, city, ZIP, phone"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search fabrication shops"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No shops match that filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Shop</th>
                    <th className="py-2 pr-3">Location</th>
                    <th className="py-2 pr-3">Phone</th>
                    <th className="py-2 pr-3">Rating</th>
                    <th className="py-2 pr-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, MAX_ROWS).map((shop) => (
                    <tr key={shop.id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-3">
                        <span className="font-medium">{shop.name}</span>
                        {shop.website && (
                          <a
                            className="ml-2 text-xs text-primary underline underline-offset-2"
                            href={shop.website}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            site
                          </a>
                        )}
                        {!shop.isActive && <Badge variant="outline" className="ml-2 text-[10px]">inactive</Badge>}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {[shop.city, [shop.state, shop.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "-"}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{shop.phone ?? "-"}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {shop.googleRating ? Number(shop.googleRating).toFixed(1) : "-"}
                        {shop.reviewCount ? <span className="text-xs"> ({shop.reviewCount})</span> : null}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        <span className="line-clamp-2 max-w-[16rem]">{shop.sourceDoc ?? "-"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > MAX_ROWS && (
                <p className="pt-2 text-xs text-muted-foreground">
                  Showing the first {MAX_ROWS} of {filtered.length}. Narrow the search or pick a state to see the rest.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div>
            <p className="text-sm font-semibold">Past uploads</p>
            <p className="text-xs text-muted-foreground">
              One row per source file. Undo removes exactly the shops from that upload, plus the quote matches pointing at them.
            </p>
          </div>

          {imports.isLoading ? (
            <div className="flex justify-center py-6"><Spinner className="h-5 w-5 text-primary" /></div>
          ) : !imports.data?.ready ? (
            <p className="text-sm text-muted-foreground">The fabrication shop tables are not created yet.</p>
          ) : imports.data.imports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No uploads recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">Shops</th>
                    <th className="py-2 pr-3">Quote matches</th>
                    <th className="py-2 pr-3">Last upload</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {imports.data.imports.map((entry) => (
                    <tr key={entry.sourceDoc} className="border-b last:border-0">
                      <td className="py-2 pr-3">{entry.sourceDoc}</td>
                      <td className="py-2 pr-3">{entry.shops}</td>
                      <td className="py-2 pr-3">
                        {entry.quoteMatches}
                        {entry.quoteMatchesFollowedUp > 0 && (
                          <span className="text-xs text-muted-foreground"> ({entry.quoteMatchesFollowedUp} followed up)</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {entry.lastCreatedAt ? new Date(entry.lastCreatedAt).toLocaleString() : "-"}
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-destructive hover:text-destructive"
                          disabled={undo.isPending}
                          onClick={() => {
                            if (window.confirm(`Undo "${entry.sourceDoc}"?\n\nThis removes ${entry.shops} shop${entry.shops === 1 ? "" : "s"} and ${entry.quoteMatches} quote match${entry.quoteMatches === 1 ? "" : "es"}. It cannot be undone.`)) {
                              undo.mutate({ sourceDoc: entry.sourceDoc, confirmCount: entry.shops });
                            }
                          }}
                        >
                          <Undo2 className="h-3.5 w-3.5" /> Undo
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
