import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const ANALYTICS_WEBSITE_ID = import.meta.env.VITE_ANALYTICS_WEBSITE_ID || "";
const ANALYTICS_ENDPOINT = import.meta.env.VITE_ANALYTICS_ENDPOINT || "";

export function AnalyticsAdmin() {
  // Umami share URL pattern: {endpoint}/share/{websiteId}/{name}
  // If no share URL is configured, show the embedded iframe with the dashboard
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
