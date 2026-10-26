import { readFileSync } from "node:fs";
import { appRouter } from "../server/routers.ts";

const b64 = readFileSync("/home/ubuntu/webdev-static-assets/test-quote.png").toString("base64");
const dataUrl = `data:image/png;base64,${b64}`;

const ctx = {
  user: null,
  req: { protocol: "https", headers: {} },
  res: { clearCookie: () => {} },
};

const caller = appRouter.createCaller(ctx);
const res = await caller.orders.extractFromImage({ imageUrl: dataUrl });
console.log("matched:", res.matchedCount, "unmatched:", res.unmatchedCount);
for (const l of res.lines) {
  console.log(
    `${l.matched ? "OK " : "?? "} qty=${l.qty}\tcode=${l.code}\t-> ${l.matched ? l.masterCode + " / " + (l.name ?? "") : "(no match)"}`
  );
}
process.exit(0);
