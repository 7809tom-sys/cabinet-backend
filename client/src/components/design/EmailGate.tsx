import { useEffect, useState } from "react";
import { Ruler, Mail, User, Phone, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/_core/hooks/useAuth";

export interface LeadContact {
  email: string;
  name?: string;
  phone?: string;
}

interface Props {
  // Called once a valid email is provided (with optional name + phone).
  onVerified: (contact: LeadContact) => void;
}

// Lightweight contact gate before entering the design tool.
// Email is required (it gates entry). Name + phone are optional so we keep the
// gate low-friction, but capturing them gives reps real contact info to follow
// up on. If the user is already logged in, we skip straight through.
export function EmailGate({ onVerified }: Props) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);

  // Logged-in users bypass the gate. Run as an effect (never during render)
  // to avoid "setState during render" warnings in the parent.
  useEffect(() => {
    if (user?.email) {
      onVerified({ email: user.email, name: user.name ?? undefined });
    }
  }, [user?.email, user?.name, onVerified]);

  // While we have a logged-in user, render nothing (the effect will verify).
  if (user?.email) {
    return null;
  }

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const submit = () => {
    if (!valid) return;
    onVerified({
      email: email.trim(),
      name: name.trim() || undefined,
      phone: phone.trim() || undefined,
    });
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-gradient-to-br from-[#1a2744] to-[#2a3a5a] px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="flex items-center justify-center h-14 w-14 rounded-xl bg-[#1a2744] mx-auto mb-5">
          <Ruler className="h-7 w-7 text-[#d4a75a]" />
        </div>
        <h1 className="font-serif text-2xl font-bold text-center text-[#1a2744] mb-2">
          Start Your Kitchen Design
        </h1>
        <p className="text-center text-sm text-muted-foreground mb-6">
          Tell us where to send your design. Your email launches the designer and
          saves your bill of materials — add your name and phone so a Cabinet Dealz
          rep can help if you'd like.
        </p>

        <div className="space-y-3">
          {/* Name (optional) */}
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              autoComplete="name"
              placeholder="Full name (optional)"
              className="pl-9"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
          </div>

          {/* Email (required) */}
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="pl-9"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
          </div>

          {/* Phone (optional) */}
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="tel"
              autoComplete="tel"
              placeholder="Phone (optional)"
              className="pl-9"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
          </div>

          {touched && !valid && (
            <p className="text-xs text-destructive">Please enter a valid email address.</p>
          )}
          <Button
            className="w-full bg-[#1a2744] text-white hover:bg-[#1a2744]/90 gap-2"
            disabled={!valid}
            onClick={submit}
          >
            Launch Designer <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground text-center mt-5">
          By continuing you agree to receive design-related emails. No spam.
        </p>
      </div>
    </div>
  );
}
