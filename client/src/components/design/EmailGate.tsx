import { useState } from "react";
import { Ruler, Mail, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/_core/hooks/useAuth";

interface Props {
  onVerified: (email: string) => void;
}

// Lightweight email gate before entering the design tool.
// If the user is already logged in, we skip straight through.
export function EmailGate({ onVerified }: Props) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);

  // Logged-in users bypass the gate.
  if (user?.email) {
    onVerified(user.email);
    return null;
  }

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-gradient-to-br from-[#1a2744] to-[#2a3a5a] px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="flex items-center justify-center h-14 w-14 rounded-xl bg-[#1a2744] mx-auto mb-5">
          <Ruler className="h-7 w-7 text-[#d4a75a]" />
        </div>
        <h1 className="font-serif text-2xl font-bold text-center text-[#1a2744] mb-2">
          Start Your Kitchen Design
        </h1>
        <p className="text-center text-sm text-muted-foreground mb-6">
          Enter your email to launch the designer. We'll use it to save your design
          and send your bill of materials.
        </p>

        <div className="space-y-3">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="email"
              placeholder="you@example.com"
              className="pl-9"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              onKeyDown={(e) => { if (e.key === "Enter" && valid) onVerified(email); }}
            />
          </div>
          {touched && !valid && (
            <p className="text-xs text-destructive">Please enter a valid email address.</p>
          )}
          <Button
            className="w-full bg-[#1a2744] text-white hover:bg-[#1a2744]/90 gap-2"
            disabled={!valid}
            onClick={() => onVerified(email)}
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
