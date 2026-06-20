import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  squareFeet: number;
  linearFeet: number;
  hasIsland: boolean;
  defaultEmail?: string;
  // Snapshot of the current design so the team can see what's being quoted.
  roomData?: unknown;
  placedCabinets?: unknown;
}

const MATERIALS = ["Quartz", "Granite", "Laminate", "Solid Surface", "Butcher Block", "Marble", "Not sure yet"];

export function CountertopQuoteDialog({
  open, onOpenChange, squareFeet, linearFeet, hasIsland, defaultEmail, roomData, placedCabinets,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [phone, setPhone] = useState("");
  const [zip, setZip] = useState("");
  const [material, setMaterial] = useState("Not sure yet");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submit = trpc.design.requestCountertopQuote.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Countertop quote request sent. We'll be in touch with pricing.");
    },
    onError: (e) => toast.error(e.message || "Could not send the request. Please try again."),
  });

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  function handleSubmit() {
    if (!emailValid) {
      toast.error("Please enter a valid email so we can send your quote.");
      return;
    }
    submit.mutate({
      contactName: name || undefined,
      contactEmail: email,
      contactPhone: phone || undefined,
      zip: zip || undefined,
      material: material === "Not sure yet" ? undefined : material,
      squareFeet,
      linearFeet,
      hasIsland,
      roomData: roomData ?? undefined,
      placedCabinets: placedCabinets ?? undefined,
      notes: notes || undefined,
    });
  }

  function handleClose(next: boolean) {
    onOpenChange(next);
    if (!next) {
      // reset after closing so a fresh request starts clean
      setTimeout(() => setSubmitted(false), 200);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {submitted ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
            <DialogTitle>Request sent</DialogTitle>
            <DialogDescription>
              Thanks! We received your countertop request for about {squareFeet} sq ft and will
              follow up at {email} with pricing.
            </DialogDescription>
            <Button className="mt-2" onClick={() => handleClose(false)}>Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Request a countertop quote</DialogTitle>
              <DialogDescription>
                Countertops are priced per project. Send us your plan and we&apos;ll quote it.
                Measured from your layout: <strong>~{squareFeet} sq ft</strong> ({linearFeet} linear ft
                {hasIsland ? ", incl. island" : ""}).
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ct-email">Email *</Label>
                <Input id="ct-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="ct-name">Name</Label>
                  <Input id="ct-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ct-phone">Phone</Label>
                  <Input id="ct-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="ct-zip">ZIP</Label>
                  <Input id="ct-zip" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="For local pricing" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ct-material">Material</Label>
                  <Select value={material} onValueChange={setMaterial}>
                    <SelectTrigger id="ct-material"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MATERIALS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ct-notes">Notes</Label>
                <Textarea id="ct-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Edge profile, seams, sink cutouts, timeline…" rows={3} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submit.isPending || !emailValid}>
                {submit.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Send request
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
