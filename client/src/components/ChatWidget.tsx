import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useIsMobile } from "@/hooks/useMobile";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { openLiveChat, isTawkConfigured } from "@/lib/tawk";
import { MessageCircle, X, Headset } from "lucide-react";
import { toast } from "sonner";

const WELCOME =
  "Hi! I'm the Cabinet Dealz assistant. Ask me about cabinet styles, sizes, ordering, or your kitchen project. Want a human? Tap \u201cTalk to a live person\u201d below.";

const SUGGESTED = [
  "What door styles do you offer?",
  "How do I order cabinets?",
  "Help me plan a 10x10 kitchen",
];

export function ChatWidget() {
  const [location] = useLocation();
  // The Kitchen/Closet Designer uses a fixed bottom toolbar (Delete/Cart) on
  // touch layouts (<1024px). The floating chat launcher would sit on top of it,
  // covering those controls, so we hide the launcher there. Desktop keeps chat.
  const isDesignerTouch = useIsMobile(1024) && location.startsWith("/design");

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connecting, setConnecting] = useState(false);
  // The Designer's own "Design Consultant" panel is a second chat surface that
  // overlaps the bottom-right launcher. While it's open, hide this global
  // launcher/panel so the two never collide. The designer dispatches a
  // "cd:consultant" CustomEvent({ detail: { open } }) when it opens/closes.
  const [consultantOpen, setConsultantOpen] = useState(false);
  useEffect(() => {
    const onConsultant = (e: Event) => {
      setConsultantOpen(Boolean((e as CustomEvent<{ open?: boolean }>).detail?.open));
    };
    window.addEventListener("cd:consultant", onConsultant as EventListener);
    return () => window.removeEventListener("cd:consultant", onConsultant as EventListener);
  }, []);

  const chat = trpc.assistant.chat.useMutation();

  // If we navigate into the designer on a touch layout while the panel is open,
  // close it so nothing lingers over the toolbar.
  useEffect(() => {
    if (isDesignerTouch && open) setOpen(false);
  }, [isDesignerTouch, open]);

  const handleSend = useCallback(
    (content: string) => {
      const next: Message[] = [...messages, { role: "user", content }];
      setMessages(next);
      chat.mutate(
        { messages: next.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })) },
        {
          onSuccess: (res) => {
            setMessages((cur) => [...cur, { role: "assistant", content: res.reply }]);
          },
          onError: () => {
            setMessages((cur) => [
              ...cur,
              {
                role: "assistant",
                content:
                  "Sorry, I hit a snag. Please try again, or tap \u201cTalk to a live person\u201d.",
              },
            ]);
          },
        },
      );
    },
    [messages, chat],
  );

  const handleLiveChat = useCallback(async () => {
    setConnecting(true);
    const ok = await openLiveChat();
    setConnecting(false);
    if (ok) {
      setOpen(false);
      toast.success("Connecting you with our team\u2026");
    } else if (!isTawkConfigured()) {
      toast.info("Live chat is being set up", {
        description: "In the meantime, ask here or request a quote and we'll reach out.",
      });
    } else {
      toast.error("Couldn't open live chat. Please try again in a moment.");
    }
  }, []);

  if (isDesignerTouch || consultantOpen) return null;

  return (
    <>
      {/* Floating launcher */}
      <button
        aria-label={open ? "Close chat" : "Open chat"}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed top-20 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full",
          "bg-[var(--color-navy,#1a2740)] text-white shadow-lg",
          "transition-transform duration-200 ease-out hover:scale-105 active:scale-95",
        )}
        style={{ transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Panel */}
      {open && (
        <div
          className={cn(
            "fixed top-36 right-5 z-50 w-[min(380px,calc(100vw-2.5rem))]",
            "rounded-xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden",
            "flex flex-col",
          )}
          style={{ maxHeight: "min(620px, calc(100vh - 11rem))" }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border bg-[var(--color-navy,#1a2740)] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              <span className="font-medium">Cabinet Dealz Assistant</span>
            </div>
            <button aria-label="Close chat" onClick={() => setOpen(false)} className="opacity-80 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 min-h-0">
            <AIChatBox
              messages={messages}
              onSendMessage={handleSend}
              isLoading={chat.isPending}
              height="100%"
              placeholder="Ask about cabinets, styles, ordering\u2026"
              emptyStateMessage={WELCOME}
              suggestedPrompts={SUGGESTED}
            />
          </div>

          <div className="border-t border-border p-2.5">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleLiveChat}
              disabled={connecting}
            >
              <Headset className="h-4 w-4" />
              {connecting ? "Connecting\u2026" : "Talk to a live person"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export default ChatWidget;
