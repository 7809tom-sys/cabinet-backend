import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
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
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connecting, setConnecting] = useState(false);

  const chat = trpc.assistant.chat.useMutation();

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

  return (
    <>
      {/* Floating launcher */}
      <button
        aria-label={open ? "Close chat" : "Open chat"}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full",
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
            "fixed bottom-24 right-5 z-50 w-[min(380px,calc(100vw-2.5rem))]",
            "rounded-xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden",
            "flex flex-col",
          )}
          style={{ maxHeight: "min(620px, calc(100vh - 8rem))" }}
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
