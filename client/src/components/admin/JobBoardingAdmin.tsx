import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { NON_COMPETE_PLACEHOLDER, DEFAULT_NON_COMPETE_TERM_YEARS } from "@shared/jobBoarding";

export default function JobBoardingAdmin() {
  const list = trpc.jobBoarding.adminList.useQuery();
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("Salesperson non-compete");
  const [termYears, setTermYears] = useState(String(DEFAULT_NON_COMPETE_TERM_YEARS));
  const [body, setBody] = useState(NON_COMPETE_PLACEHOLDER);
  const [templateId, setTemplateId] = useState("");
  const publish = trpc.jobBoarding.adminPublishNonCompete.useMutation({
    onSuccess: (result) => {
      toast.success(`Published version ${result.version ?? ""} · ${result.termLabel}`);
      utils.jobBoarding.adminList.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const issue = trpc.jobBoarding.adminIssueVerificationLink.useMutation({
    onSuccess: async (result) => {
      const href = `${window.location.origin}${result.path}`;
      try {
        await navigator.clipboard.writeText(href);
        toast.success("Verification link copied");
      } catch {
        toast.success(href);
      }
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-bold">Job Boarding</h2>
        <p className="text-sm text-muted-foreground">Salesperson onboarding. Each row links to that person's e-documents. Tax IDs and ID images stay on the review screen.</p>
      </div>
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm font-medium">Non-compete version</p>
          <p className="text-xs text-muted-foreground">The box starts with the placeholder. Replace it with the document from Tom or his attorney, or leave the placeholder and publish it as the next version. The term is metadata and starts at 2 years.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="nc-title">Title</Label>
              <Input id="nc-title" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-term">Term (years)</Label>
              <Input id="nc-term" value={termYears} onChange={(event) => setTermYears(event.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="nc-body">Document text</Label>
            <Textarea id="nc-body" rows={4} value={body} onChange={(event) => setBody(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nc-template">DocuSeal template id (optional)</Label>
            <Input id="nc-template" value={templateId} onChange={(event) => setTemplateId(event.target.value)} placeholder="Leave blank until the template exists" />
          </div>
          <Button
            onClick={() => {
              const years = Number(termYears);
              if (!Number.isInteger(years) || years < 1) {
                toast.error("Enter a whole number of years.");
                return;
              }
              publish.mutate({
                title,
                termYears: years,
                bodyMarkdown: body,
                docusealTemplateId: templateId.trim() ? Number(templateId) : null,
              });
            }}
            disabled={publish.isPending}
          >
            Publish new version
          </Button>
        </CardContent>
      </Card>
      {list.isLoading && <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>}
      {list.error && <p className="text-sm text-destructive">{list.error.message}</p>}
      <div className="space-y-3">
        {(list.data ?? []).map((row) => (
          <Card key={row.userId}>
            <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{row.fullName || `User ${row.userId}`}</span>
                  <Badge variant={row.verified ? "default" : "secondary"}>Verified {row.verifiedLabel}</Badge>
                </div>
                <p className="text-muted-foreground">{row.email || "No email"}{row.phone ? ` · ${row.phone}` : ""}</p>
                <p>Signed non-compete version: {row.nonCompeteSigned ? `${row.nonCompeteVersion ?? "—"} (${row.nonCompeteTermYears ?? "—"} years)` : "not signed"}</p>
                <p>W-9 submitted: {row.w9Submitted ? "yes" : "no"} · IDs uploaded: {row.identityCount > 0 ? "yes" : "no"} ({row.identityCount})</p>
              </div>
              <div className="flex flex-col gap-2">
                <a href={row.eDocPath}><Button size="sm">E-documents</Button></a>
                <Button size="sm" variant="outline" onClick={() => issue.mutate({ userId: row.userId })}>Verification link</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {list.data && list.data.length === 0 && <p className="text-sm text-muted-foreground">No salespeople have started Job Boarding.</p>}
      </div>
    </div>
  );
}
