// Classifies a customer's reply. Every reply stops the sequence and goes to
// Tom; nothing here ever answers the customer automatically. A question about
// whether this is a person or a bot is flagged so Tom answers it himself and
// the system never denies that the emails are automated.

export type ReplyKind = "unsubscribe" | "asks_if_automated" | "auto_reply" | "reply";

const UNSUBSCRIBE = [
  /\bunsubscribe\b/i,
  /^\s*stop\s*\.?\s*$/im,
  /\bremove me\b/i,
  /\btake me off\b/i,
  /\b(do not|don't|dont|stop)\s+(email|emailing|contact|contacting|message|messaging)\s+me\b/i,
  /\bopt[\s-]?out\b/i,
  /\bno more emails\b/i,
];

const ASKS_IF_AUTOMATED = [
  /\b(are|r)\s+(you|u)\s+(a\s+|an\s+)?(bot|robot|ai|machine|computer|automated|real|human|person|actual person|real person)\b/i,
  /\bis\s+this\s+(an?\s+)?(bot|robot|ai|automated|auto[\s-]?generated|machine|computer|real|a real person|a person|a human|spam)\b/i,
  /\b(talking|speaking|chatting)\s+(to|with)\s+(a\s+|an\s+)?(bot|robot|ai|machine|computer|real person|human|person)\b/i,
  /\b(automated|auto[\s-]?generated|ai[\s-]?(generated|written)|written by (an? )?(ai|bot|computer|machine))\b/i,
  /\bchat\s*gpt\b/i,
  /\bwho\s+(wrote|is writing|sent)\s+this\b/i,
];

const AUTO_REPLY = [
  /\bout of (the )?office\b/i,
  /\bauto(matic)?[\s-]?reply\b/i,
  /\bon vacation\b/i,
  /\bundeliverable\b/i,
  /\bdelivery status notification\b/i,
];

export function classifyReply(subject: string, text: string): ReplyKind {
  const all = `${subject}\n${text}`;
  // A person asking about automation is the most important signal: it must
  // reach Tom even when the same message also says "unsubscribe".
  if (ASKS_IF_AUTOMATED.some((pattern) => pattern.test(all))) return "asks_if_automated";
  if (UNSUBSCRIBE.some((pattern) => pattern.test(all))) return "unsubscribe";
  if (AUTO_REPLY.some((pattern) => pattern.test(subject)) || /^auto(matic)?\s*reply/i.test(subject)) return "auto_reply";
  return "reply";
}

/** Strips quoted history so classification reads only what the customer wrote. */
export function latestReplyText(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cut = lines.findIndex((line) => /^\s*>/.test(line) || /^On .+ wrote:\s*$/.test(line.trim()) || /^-{2,}\s*Original Message/i.test(line.trim()) || /^From:\s/.test(line.trim()));
  return (cut >= 0 ? lines.slice(0, cut) : lines).join("\n").trim();
}

/** Pulls the bare address from a header such as `"Jane" <jane@example.com>`. */
export function bareAddress(value: string): string {
  const angle = /<([^>]+)>/.exec(value);
  return (angle ? angle[1] : value).trim().toLowerCase();
}
