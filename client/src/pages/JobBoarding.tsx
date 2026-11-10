import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getSiteSignInUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { ContractorApplicationFields } from "@/components/contractor/ContractorApplicationFields";
import {
  TAX_CLASSIFICATION_LABELS,
  W9_PLACEHOLDER_NOTE,
  type SalespersonTaxClassification,
} from "@shared/jobBoarding";

type InformationDraft = {
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  licenseNumber: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
};

const EMPTY_INFO: InformationDraft = {
  fullName: "",
  email: "",
  phone: "",
  businessName: "",
  licenseNumber: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  postalCode: "",
};

export default function JobBoarding() {
  const { user, loading } = useAuth();
  const [, verifyParams] = useRoute<{ token: string }>("/job-boarding/verify/:token");
  const [, reviewParams] = useRoute<{ userId: string }>("/job-boarding/review/:userId");
  const reviewUserId = reviewParams ? Number(reviewParams.userId) : null;
  const isAdminReview = reviewUserId != null && Number.isInteger(reviewUserId);

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;
  }
  if (!user) {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    return (
      <div className="container max-w-lg py-16 text-center">
        <h1 className="font-serif text-2xl font-bold">Sign in to open your e-documents</h1>
        <p className="mt-2 text-sm text-muted-foreground">The verification link continues after you sign in with the salesperson account.</p>
        <a href={getSiteSignInUrl(returnTo)} className="mt-4 inline-block"><Button>Sign in</Button></a>
      </div>
    );
  }
  if (isAdminReview && user.role !== "admin") {
    return (
      <div className="container max-w-lg py-16">
        <h1 className="font-serif text-2xl font-bold">Admins only</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tax IDs and government IDs are visible to admins.</p>
      </div>
    );
  }
  if (isAdminReview) return <AdminReview userId={reviewUserId} />;
  return <SalespersonFlow token={verifyParams?.token ?? null} />;
}

function SalespersonFlow({ token }: { token: string | null }) {
  const utils = trpc.useUtils();
  const status = trpc.jobBoarding.myStatus.useQuery();
  const opened = trpc.jobBoarding.openVerification.useQuery(
    { token: token ?? "" },
    { enabled: Boolean(token), retry: false },
  );
  const begin = trpc.jobBoarding.begin.useMutation({
    onSuccess: () => utils.jobBoarding.myStatus.invalidate(),
    onError: (error) => toast.error(error.message),
  });
  const data = status.data;
  const [step, setStep] = useState(0);

  if (status.isLoading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;
  if (data?.schemaMissing) {
    return (
      <div className="container max-w-lg py-16">
        <h1 className="font-serif text-2xl font-bold">Job Boarding is not installed yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tom still needs to run the Job Boarding SQL before new salespeople can verify.</p>
      </div>
    );
  }
  if (!data?.enrolled) {
    return (
      <div className="container max-w-lg py-16">
        <h1 className="font-serif text-2xl font-bold">Job Boarding</h1>
        <p className="mt-2 text-sm text-muted-foreground">Start salesperson onboarding. Your salesperson account stays inactive until all four steps are verified.</p>
        <Button className="mt-4" onClick={() => begin.mutate()} disabled={begin.isPending}>Start</Button>
      </div>
    );
  }

  const steps = ["Information", "Non-compete", "W-9", "ID"];
  return (
    <div className="container max-w-2xl py-10">
      <h1 className="font-serif text-3xl font-bold">Job Boarding</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {data.verified
          ? "Verification is complete and your salesperson account is active."
          : "Finish these four steps. Salesperson tools stay closed until verification is yes."}
      </p>
      {token && opened.error && <p className="mt-3 text-sm text-destructive">{opened.error.message}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {steps.map((label, index) => (
          <Button key={label} size="sm" variant={step === index ? "default" : "outline"} onClick={() => setStep(index)}>
            {index + 1}. {label}
          </Button>
        ))}
        <Badge variant={data.verified ? "default" : "secondary"}>Verified {data.verified ? "yes" : "no"}</Badge>
      </div>
      <div className="mt-6">
        {step === 0 && <InformationStep initial={data.information} onDone={() => setStep(1)} />}
        {step === 1 && <NonCompeteStep packet={data.nonCompete} onDone={() => setStep(2)} />}
        {step === 2 && <W9Step packet={data.w9} unlocked={data.blockers.includes("non_compete") === false} onDone={() => setStep(3)} />}
        {step === 3 && <IdentityStep packet={data.identity} unlocked={!data.blockers.includes("w9") && !data.blockers.includes("non_compete")} />}
      </div>
      <VerificationLink />
    </div>
  );
}

function InformationStep({
  initial,
  onDone,
}: {
  initial: InformationDraft | null;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<InformationDraft>(initial ?? EMPTY_INFO);
  useEffect(() => {
    if (initial) setDraft(initial);
  }, [initial]);
  const save = trpc.jobBoarding.saveInformation.useMutation({
    onSuccess: async () => {
      await utils.jobBoarding.myStatus.invalidate();
      toast.success("Information saved");
      onDone();
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Card>
      <CardHeader><CardTitle>1. Information</CardTitle></CardHeader>
      <CardContent>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate({
              ...draft,
              licenseNumber: draft.licenseNumber.trim() || null,
              address2: draft.address2.trim() || null,
            });
          }}
        >
          <ContractorApplicationFields
            idPrefix="job"
            fullName={draft.fullName}
            email={draft.email}
            businessName={draft.businessName}
            phone={draft.phone}
            licenseNumber={draft.licenseNumber}
            address1={draft.address1}
            address2={draft.address2}
            city={draft.city}
            state={draft.state}
            postalCode={draft.postalCode}
            onFullNameChange={(fullName) => setDraft({ ...draft, fullName })}
            onEmailChange={(email) => setDraft({ ...draft, email })}
            onBusinessNameChange={(businessName) => setDraft({ ...draft, businessName })}
            onPhoneChange={(phone) => setDraft({ ...draft, phone })}
            onLicenseNumberChange={(licenseNumber) => setDraft({ ...draft, licenseNumber })}
            onAddress1Change={(address1) => setDraft({ ...draft, address1 })}
            onAddress2Change={(address2) => setDraft({ ...draft, address2 })}
            onCityChange={(city) => setDraft({ ...draft, city })}
            onStateChange={(state) => setDraft({ ...draft, state })}
            onPostalCodeChange={(postalCode) => setDraft({ ...draft, postalCode })}
          />
          <Button type="submit" disabled={save.isPending}>Save and continue</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function NonCompeteStep({
  packet,
  onDone,
}: {
  packet: {
    title: string;
    version: number | null;
    termYears: number;
    termLabel: string;
    placeholder: boolean;
    body: string;
    signed: boolean;
    signingReady: boolean;
    providerConfigured: boolean;
    inProgress: boolean;
    metadata: { termYears: number; termLabel: string; placeholder: boolean };
  } | null;
  onDone: () => void;
}) {
  const [consent, setConsent] = useState(false);
  const [legalName, setLegalName] = useState("");
  const [embedSrc, setEmbedSrc] = useState<string | null>(null);
  const start = trpc.jobBoarding.startSigning.useMutation({
    onSuccess: (result) => setEmbedSrc(result.embedSrc),
    onError: (error) => toast.error(error.message),
  });
  if (!packet) return null;
  return (
    <Card>
      <CardHeader><CardTitle>2. Non-compete</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Document</dt><dd>{packet.title}</dd>
          <dt className="text-muted-foreground">Version</dt><dd>{packet.version ?? "—"}</dd>
          <dt className="text-muted-foreground">Term</dt><dd>{packet.metadata.termLabel}</dd>
          <dt className="text-muted-foreground">Term years</dt><dd>{packet.metadata.termYears}</dd>
        </dl>
        <div className="rounded-md border border-dashed bg-muted/40 p-3 text-sm">
          <p className="font-medium">{packet.placeholder ? "Placeholder document" : "Current version"}</p>
          <p className="mt-1 whitespace-pre-wrap">{packet.body}</p>
          {packet.placeholder && <p className="mt-2 text-xs text-muted-foreground">An admin can replace this text by publishing a new version.</p>}
        </div>
        {packet.signed ? (
          <Button onClick={onDone}>Continue</Button>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              start.mutate({ consent: true, typedLegalName: legalName });
            }}
          >
            {!packet.providerConfigured && <p className="text-sm text-muted-foreground">DocuSeal is not configured, so signing cannot start.</p>}
            {!packet.signingReady && packet.providerConfigured && <p className="text-sm text-muted-foreground">An admin still needs to attach a DocuSeal template to this version.</p>}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>I agree to sign this document electronically.</span>
            </label>
            <div className="space-y-1">
              <Label htmlFor="noncompete-name">Legal name</Label>
              <Input id="noncompete-name" value={legalName} onChange={(event) => setLegalName(event.target.value)} />
            </div>
            <Button type="submit" disabled={!consent || legalName.trim().length < 2 || start.isPending}>Open the DocuSeal signing link</Button>
          </form>
        )}
        {embedSrc && (
          <iframe title="Non-compete signing" src={embedSrc} className="h-[32rem] w-full rounded-md border" />
        )}
      </CardContent>
    </Card>
  );
}

function W9Step({
  packet,
  unlocked,
  onDone,
}: {
  packet: {
    submitted: boolean;
    legalName: string;
    businessName: string;
    taxClassification: SalespersonTaxClassification | null;
    llcClassification: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    tinType: "ssn" | "ein" | null;
    tinMasked: string | null;
    signatureName: string;
    signedOn: string;
    officialPdfUrl: string;
    aboutUrl: string;
    placeholderNote: string;
  } | null;
  unlocked: boolean;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const [legalName, setLegalName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [taxClassification, setTaxClassification] = useState<SalespersonTaxClassification>("individual");
  const [llcClassification, setLlcClassification] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [tinType, setTinType] = useState<"ssn" | "ein">("ssn");
  const [tin, setTin] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [signedOn, setSignedOn] = useState("");
  useEffect(() => {
    if (!packet) return;
    setLegalName(packet.legalName);
    setBusinessName(packet.businessName);
    if (packet.taxClassification) setTaxClassification(packet.taxClassification);
    setLlcClassification(packet.llcClassification);
    setAddress(packet.address);
    setCity(packet.city);
    setState(packet.state);
    setZip(packet.zip);
    if (packet.tinType) setTinType(packet.tinType);
    setSignatureName(packet.signatureName);
    setSignedOn(packet.signedOn);
  }, [packet]);
  const save = trpc.jobBoarding.submitW9.useMutation({
    onSuccess: async (result) => {
      setTin("");
      await utils.jobBoarding.myStatus.invalidate();
      toast.success(result.tinMasked ? `W-9 saved. Tax ID on file ${result.tinMasked}` : "W-9 saved");
      onDone();
    },
    onError: (error) => toast.error(error.message),
  });
  if (!packet) return null;
  return (
    <Card>
      <CardHeader><CardTitle>3. W-9</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-dashed bg-muted/40 p-3 text-sm">
          <p>{packet.placeholderNote || W9_PLACEHOLDER_NOTE}</p>
          <p className="mt-2">
            Official IRS Form W-9:{" "}
            <a className="text-primary underline" href={packet.officialPdfUrl} target="_blank" rel="noreferrer">PDF</a>
            {" · "}
            <a className="text-primary underline" href={packet.aboutUrl} target="_blank" rel="noreferrer">About Form W-9</a>
          </p>
        </div>
        {packet.tinMasked && <p className="text-sm">Tax ID on file: {packet.tinMasked}. Enter the full number again only to replace it.</p>}
        {!unlocked && <p className="text-sm text-muted-foreground">Sign the non-compete first.</p>}
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate({
              legalName,
              businessName: businessName.trim() || null,
              taxClassification,
              llcClassification: llcClassification.trim() || null,
              address,
              city,
              state,
              zip,
              tinType,
              tin,
              signatureName,
              signedOn,
            });
          }}
        >
          <div className="space-y-1"><Label htmlFor="w9-name">Name</Label><Input id="w9-name" value={legalName} onChange={(event) => setLegalName(event.target.value)} required /></div>
          <div className="space-y-1"><Label htmlFor="w9-business">Business name</Label><Input id="w9-business" value={businessName} onChange={(event) => setBusinessName(event.target.value)} /></div>
          <div className="space-y-1">
            <Label htmlFor="w9-class">Tax classification</Label>
            <select id="w9-class" className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={taxClassification} onChange={(event) => setTaxClassification(event.target.value as SalespersonTaxClassification)}>
              {Object.entries(TAX_CLASSIFICATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {taxClassification === "llc" && (
            <div className="space-y-1"><Label htmlFor="w9-llc">LLC tax classification (C, S, or P)</Label><Input id="w9-llc" value={llcClassification} onChange={(event) => setLlcClassification(event.target.value)} maxLength={8} /></div>
          )}
          <div className="space-y-1"><Label htmlFor="w9-address">Address</Label><Input id="w9-address" value={address} onChange={(event) => setAddress(event.target.value)} required /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label htmlFor="w9-city">City</Label><Input id="w9-city" value={city} onChange={(event) => setCity(event.target.value)} required /></div>
            <div className="space-y-1"><Label htmlFor="w9-state">State</Label><Input id="w9-state" value={state} onChange={(event) => setState(event.target.value)} required /></div>
            <div className="space-y-1"><Label htmlFor="w9-zip">ZIP</Label><Input id="w9-zip" value={zip} onChange={(event) => setZip(event.target.value)} required /></div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="w9-tin-type">TIN type</Label>
            <select id="w9-tin-type" className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={tinType} onChange={(event) => setTinType(event.target.value as "ssn" | "ein")}>
              <option value="ssn">SSN</option>
              <option value="ein">EIN</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="w9-tin">{tinType === "ssn" ? "SSN" : "EIN"}</Label>
            <Input id="w9-tin" value={tin} onChange={(event) => setTin(event.target.value)} autoComplete="off" placeholder={packet.tinMasked ?? ""} required />
          </div>
          <div className="space-y-1"><Label htmlFor="w9-sign">Signature</Label><Input id="w9-sign" value={signatureName} onChange={(event) => setSignatureName(event.target.value)} required /></div>
          <div className="space-y-1"><Label htmlFor="w9-date">Date</Label><Input id="w9-date" type="date" value={signedOn} onChange={(event) => setSignedOn(event.target.value)} required /></div>
          <Button type="submit" disabled={!unlocked || save.isPending}>Submit W-9</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function IdentityStep({
  packet,
  unlocked,
}: {
  packet: { uploaded: boolean; files: Array<{ id: number; label: string; originalName: string | null; uploadedAt: Date | string }> } | null;
  unlocked: boolean;
}) {
  const utils = trpc.useUtils();
  const [label, setLabel] = useState<"front" | "back" | "other">("front");
  const upload = trpc.jobBoarding.uploadIdentity.useMutation({
    onSuccess: async () => {
      await utils.jobBoarding.myStatus.invalidate();
      toast.success("ID uploaded");
    },
    onError: (error) => toast.error(error.message),
  });
  if (!packet) return null;
  return (
    <Card>
      <CardHeader><CardTitle>4. Government ID</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Upload the front and, if you have one, the back. The image stays private. You will see the file name, not a public link.</p>
        {!unlocked && <p className="text-sm text-muted-foreground">Submit the W-9 first.</p>}
        <ul className="text-sm">
          {packet.files.map((file) => (
            <li key={file.id}>{file.label}: {file.originalName || "Uploaded ID"}</li>
          ))}
          {packet.files.length === 0 && <li>No ID uploaded yet.</li>}
        </ul>
        <div className="space-y-1">
          <Label htmlFor="id-label">Side</Label>
          <select id="id-label" className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={label} onChange={(event) => setLabel(event.target.value as "front" | "back" | "other")}>
            <option value="front">Front</option>
            <option value="back">Back</option>
            <option value="other">Other</option>
          </select>
        </div>
        <Input
          type="file"
          accept="image/jpeg,image/png,image/heic,application/pdf"
          disabled={!unlocked || upload.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const value = typeof reader.result === "string" ? reader.result : "";
              upload.mutate({ fileBase64: value, fileName: file.name, mimeType: file.type || "application/octet-stream", label });
            };
            reader.readAsDataURL(file);
          }}
        />
      </CardContent>
    </Card>
  );
}

function VerificationLink() {
  const [path, setPath] = useState<string | null>(null);
  const issue = trpc.jobBoarding.issueMyVerificationLink.useMutation({
    onSuccess: (result) => setPath(result.path),
    onError: (error) => toast.error(error.message),
  });
  const href = path ? `${window.location.origin}${path}` : null;
  return (
    <div className="mt-6 rounded-md border p-4 text-sm">
      <p className="font-medium">E-document verification link</p>
      <p className="mt-1 text-muted-foreground">This link opens the non-compete, W-9, and ID steps. The salesperson account is not activated until verification is yes.</p>
      <Button className="mt-3" variant="outline" size="sm" onClick={() => issue.mutate()} disabled={issue.isPending}>Create verification link</Button>
      {href && <p className="mt-2 break-all"><a className="text-primary underline" href={href}>{href}</a></p>}
    </div>
  );
}

function AdminReview({ userId }: { userId: number }) {
  const review = trpc.jobBoarding.adminReview.useQuery({ userId });
  const [showTin, setShowTin] = useState(false);
  const reveal = trpc.jobBoarding.adminRevealTin.useQuery({ userId }, { enabled: showTin });
  const link = trpc.jobBoarding.adminIdentityLink.useMutation({
    onSuccess: (result) => window.open(result.url, "_blank", "noopener,noreferrer"),
    onError: (error) => toast.error(error.message),
  });
  const issue = trpc.jobBoarding.adminIssueVerificationLink.useMutation({
    onError: (error) => toast.error(error.message),
  });
  if (review.isLoading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;
  if (review.error || !review.data) return <p className="container py-10 text-destructive">{review.error?.message ?? "Not found"}</p>;
  const row = review.data;
  const verificationHref = issue.data ? `${window.location.origin}${issue.data.path}` : null;
  return (
    <div className="container max-w-2xl py-10 space-y-4">
      <h1 className="font-serif text-3xl font-bold">E-documents</h1>
      <p className="text-sm text-muted-foreground">{row.information.fullName || "Salesperson"} · {row.information.email}</p>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Verified</dt><dd>{row.verifiedLabel}</dd>
        <dt className="text-muted-foreground">Signed non-compete version</dt><dd>{row.nonCompete.signed ? row.nonCompete.version ?? "—" : "not signed"}</dd>
        <dt className="text-muted-foreground">Term</dt><dd>{row.nonCompete.termLabel}</dd>
        <dt className="text-muted-foreground">W-9 submitted</dt><dd>{row.w9.submitted ? "yes" : "no"}</dd>
        <dt className="text-muted-foreground">IDs uploaded</dt><dd>{row.identity.length}</dd>
      </dl>
      {"tinMasked" in row.w9 && row.w9.tinMasked && <p className="text-sm">TIN on file: {row.w9.tinMasked}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowTin(true)}>Reveal TIN</Button>
        <Button size="sm" variant="outline" onClick={() => issue.mutate({ userId })}>Copy verification link</Button>
      </div>
      {reveal.data && <p className="text-sm">Revealed TIN: {reveal.data.tin}</p>}
      {verificationHref && <p className="break-all text-sm"><a className="text-primary underline" href={verificationHref}>{verificationHref}</a></p>}
      <ul className="space-y-2 text-sm">
        {row.identity.map((file) => (
          <li key={file.id} className="flex items-center justify-between gap-2">
            <span>{file.label}: {file.originalName || "Government ID"}</span>
            <Button size="sm" variant="outline" onClick={() => link.mutate({ documentId: file.id })}>Open</Button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{row.placeholderNote}</p>
    </div>
  );
}
