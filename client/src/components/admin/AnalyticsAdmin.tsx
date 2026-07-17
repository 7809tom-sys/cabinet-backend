import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, ExternalLink, Eye, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";

const ANALYTICS_WEBSITE_ID = import.meta.env.VITE_ANALYTICS_WEBSITE_ID || "";
const ANALYTICS_ENDPOINT = import.meta.env.VITE_ANALYTICS_ENDPOINT || "";

export function AnalyticsAdmin() {
  const [days, setDays] = useState(30);
  const { data: vendorBreakdown, isLoading } = trpc.analytics.adminVendorBreakdown.useQuery({ days });

  const dashboardUrl = ANALYTICS_ENDPOINT
    ? `${ANALYTICS_ENDPOINT}/websites/${ANALYTICS_WEBSITE_ID}`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Site Analytics</h2>
          <p className="text-muted-foreground">
            View traffic, page views, and visitor data for your site.
          </p>
        </div>
        {dashboardUrl && (
          <Button variant="outline" asChild>
            <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" /> Open Full Dashboard
            </a>
          </Button>
        )}
      </div>

      {/* Per-vendor product view breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              Product Views by Vendor
            </CardTitle>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !vendorBreakdown?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="mx-auto h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No product views recorded in this period.</p>
              <p className="text-xs mt-1">Views are tracked when customers visit cabinet detail pages.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left py-2 pr-4">Vendor</th>
                    <th className="text-right py-2 pr-4">Total Views</th>
                    <th className="text-right py-2">Unique Products</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorBreakdown.map((row, i) => (
                    <tr key={row.distributorId ?? i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pr-4 font-medium">
                        {row.vendorName ?? <span className="text-muted-foreground italic">Unknown vendor</span>}
                        <span className="ml-2 text-xs text-muted-foreground">#{row.distributorId}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        <Badge variant="secondary" className="font-mono">
                          {Number(row.totalViews).toLocaleString()}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right text-muted-foreground">
                        {Number(row.uniqueProducts).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {ANALYTICS_ENDPOINT && ANALYTICS_WEBSITE_ID ? (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <iframe
              src={`${ANALYTICS_ENDPOINT}/share/${ANALYTICS_WEBSITE_ID}/Cabinet%20Dealz`}
              className="w-full border-0"
              style={{ height: "calc(100vh - 200px)", minHeight: "600px" }}
              title="Site Analytics"
              loading="lazy"
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <BarChart3 className="mx-auto h-16 w-16 mb-4 opacity-40" />
            <p className="text-lg font-medium">Analytics Not Configured</p>
            <p className="text-sm mt-2">
              Set VITE_ANALYTICS_ENDPOINT and VITE_ANALYTICS_WEBSITE_ID environment variables to enable the analytics dashboard.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tracking</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              <span className="font-medium">Umami Analytics</span> is installed and tracking page views, referrers, devices, and countries automatically.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Privacy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              No cookies, GDPR compliant. Visitor data is anonymized and never shared with third parties.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Data Retention</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Analytics data is retained indefinitely. Historical trends are available for all time periods.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
