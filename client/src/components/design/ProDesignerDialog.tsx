import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CalendarCheck, Video, Phone, MapPin, Loader2, CheckCircle2, UserRound } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultName?: string;
  defaultEmail?: string;
  defaultPhone?: string;
  designId?: number | null;
  designName?: string | null;
};

const MODE_ICON: Record<string, React.ReactNode> = {
  video: <Video className="h-3.5 w-3.5" />,
  phone: <Phone className="h-3.5 w-3.5" />,
  in_person: <MapPin className="h-3.5 w-3.5" />,
};
const MODE_LABEL: Record<string, string> = {
  video: "Video call",
  phone: "Phone call",
  in_person: "In person",
};

export function ProDesignerDialog({
  open,
  onOpenChange,
  defaultName,
  defaultEmail,
  defaultPhone,
  designId,
  designName,
}: Props) {
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [name, setName] = useState(defaultName ?? "");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [topic, setTopic] = useState("");
  const [done, setDone] = useState(false);

  const utils = trpc.useUtils();
  const { data: slots, isLoading } = trpc.consultations.openSlots.useQuery(undefined, {
    enabled: open,
  });

  const book = trpc.consultations.book.useMutation({
    onSuccess: () => {
      setDone(true);
      utils.consultations.openSlots.invalidate();
      toast.success("Consultation booked — we'll be in touch to confirm.");
    },
    onError: (e) => {
      toast.error(e.message || "Could not book that time. Please pick another.");
      utils.consultations.openSlots.invalidate();
    },
  });

  // Group slots by local calendar day for a tidy picker.
  const grouped = useMemo(() => {
    const out = new Map<string, Array<NonNullable<typeof slots>[number]>>();
    (slots ?? []).forEach((s) => {
      const key = new Date(s.startAt).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const arr = out.get(key) ?? [];
      arr.push(s);
      out.set(key, arr);
    });
    return Array.from(out.entries());
  }, [slots]);

  const canBook = selectedSlotId != null && name.trim() && /\S+@\S+\.\S+/.test(email);

  function reset() {
    setDone(false);
    setSelectedSlotId(null);
    setTopic("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        {done ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h3 className="mt-3 text-lg font-semibold">You're booked!</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              A Cabinet Dealz designer will confirm your consultation by email
              {phone ? " or phone" : ""}. We'll review your design together and answer any questions.
            </p>
            <Button className="mt-5" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserRound className="h-5 w-5 text-[#a87f33]" />
                Get a professional designer
              </DialogTitle>
              <DialogDescription>
                Book a free consultation with a Cabinet Dealz designer. Pick a time that works for
                you and we'll walk through your kitchen together.
                {designName ? (
                  <span className="mt-1 block font-medium text-foreground">
                    Design attached: {designName}
                  </span>
                ) : null}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Slot picker */}
              <div>
                <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Choose a time
                </Label>
                {isLoading ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading available times…
                  </div>
                ) : grouped.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                    No open times right now. Leave your info below and a designer will reach out to
                    schedule.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                    {grouped.map(([day, daySlots]) => (
                      <div key={day}>
                        <p className="mb-1 text-xs font-medium text-foreground">{day}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {daySlots.map((s) => {
                            const selected = s.id === selectedSlotId;
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => setSelectedSlotId(s.id)}
                                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                  selected
                                    ? "border-[#a87f33] bg-[#a87f33] text-white"
                                    : "border-border hover:border-[#a87f33]/60 hover:bg-muted/50"
                                }`}
                                title={`${MODE_LABEL[s.mode]} with ${s.designerName ?? "a designer"}`}
                              >
                                {new Date(s.startAt).toLocaleTimeString(undefined, {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                                <span className={selected ? "opacity-90" : "text-muted-foreground"}>
                                  {MODE_ICON[s.mode]}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Contact */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <Label htmlFor="pd-name" className="text-xs">
                    Your name
                  </Label>
                  <Input id="pd-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label htmlFor="pd-phone" className="text-xs">
                    Phone (optional)
                  </Label>
                  <Input id="pd-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="pd-email" className="text-xs">
                    Email
                  </Label>
                  <Input id="pd-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="pd-topic" className="text-xs">
                    What would you like help with? (optional)
                  </Label>
                  <Textarea
                    id="pd-topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Finalizing my layout, picking a door style, getting an accurate quote…"
                    rows={2}
                  />
                </div>
              </div>

              <Button
                className="w-full gap-2 bg-[#a87f33] hover:bg-[#946e2b]"
                disabled={!canBook || book.isPending}
                onClick={() =>
                  selectedSlotId != null &&
                  book.mutate({
                    slotId: selectedSlotId,
                    customerName: name.trim(),
                    customerEmail: email.trim(),
                    customerPhone: phone.trim() || undefined,
                    topic: topic.trim() || undefined,
                    designId: designId ?? undefined,
                    designName: designName ?? undefined,
                  })
                }
              >
                {book.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Booking…
                  </>
                ) : (
                  <>
                    <CalendarCheck className="h-4 w-4" /> Book my consultation
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
