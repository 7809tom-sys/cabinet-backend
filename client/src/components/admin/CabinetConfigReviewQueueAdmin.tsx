import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { AlertTriangle, CheckCircle2, Pencil, RefreshCw, Search } from "lucide-react";
import {
  cabinetConfigAttentionReasons,
  cabinetConfigQuickEditUrl,
  needsCabinetConfigAttention,
} from "@shared/cabinetConfigReview";

type ReviewCabinet = {
  id: number;
  masterCode: string | null;
  description: string | null;
  category: string | null;
  subCategory: string | null;
  width: string | null;
  height: string | null;
  isActive: boolean | null;
  configVerified: boolean | null;
};

const PAGE_SIZE = 100;

export default function CabinetConfigReviewQueueAdmin() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading, refetch } = trpc.cabinets.adminListCabinetConfig.useQuery({
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    attentionOnly: true,
  });

  const rows = (data?.rows ?? []) as ReviewCabinet[];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const applySearch = () => {
    setSearch(searchInput);
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-semibold">Cabinet Attention Queue</h2>
        <Badge variant="secondary">{total} need review</Badge>
        <Button size="sm" variant="outline" className="ml-auto h-8 gap-1.5" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        This queue contains every master cabinet that is <strong className="text-foreground">inactive</strong>,
        <strong className="text-foreground"> unverified</strong>, or both. Use <strong className="text-foreground">Edit Config</strong>{" "}
        to open that exact record directly in Cabinet Config.
      </p>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-sm"
            placeholder="Search code or description…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applySearch();
            }}
          />
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={applySearch}>
          Search
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-600" />
          No inactive or unverified cabinet records match this search.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="w-28 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Code</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Description</th>
                <th className="hidden w-20 px-3 py-2 text-left text-xs font-medium text-muted-foreground sm:table-cell">W×H</th>
                <th className="w-44 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Needs attention</th>
                <th className="w-28 px-3 py-2 text-center text-xs font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const reasons = cabinetConfigAttentionReasons(row);
                if (!needsCabinetConfigAttention(row)) return null;
                return (
                  <tr key={row.id} className={index % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs font-semibold text-primary">{row.masterCode ?? "—"}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="block text-xs text-foreground">{row.description ?? "No description"}</span>
                      {row.category && (
                        <span className="block text-[10px] text-muted-foreground">
                          {row.category}{row.subCategory ? ` › ${row.subCategory}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
                      {row.width ? `${parseFloat(row.width)}″` : "—"}×{row.height ? `${parseFloat(row.height)}″` : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {reasons.map((reason) => (
                          <Badge
                            key={reason}
                            variant="outline"
                            className={reason === "Inactive" ? "border-rose-300 text-rose-700" : "border-amber-300 text-amber-700"}
                          >
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                        <a href={cabinetConfigQuickEditUrl(row.id)}>
                          <Pencil className="h-3 w-3" />
                          Edit Config
                        </a>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page + 1} of {totalPages} ({total} total)</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((value) => value + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
