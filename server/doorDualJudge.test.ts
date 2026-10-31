import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { evaluateDoor, kitchenCraftGate, sourcePhotoProblem, DOOR_DUAL_JUDGE_CRITERIA, type DoorAuditEntry, type DoorJudgeScores } from "../shared/doorDualJudge";

const all = (n: number): DoorJudgeScores => Object.fromEntries(DOOR_DUAL_JUDGE_CRITERIA.map((c) => [c, n])) as DoorJudgeScores;
const photo = { path: "source/a.jpg", width: 800, height: 1000 };
const door = (claude: DoorJudgeScores | undefined, cursor: DoorJudgeScores | undefined, p = photo): DoorAuditEntry => ({
  doorStyle: "A", distributor: "DL", sourcePhoto: p, rounds: [{ round: 1, renderPath: "r.png", change: "", scores: { claude, cursor } }],
});

describe("dual-judge door audit", () => {
  it("passes only when both judges give 7+ on every criterion", () => {
    expect(evaluateDoor(door(all(7), all(7))).status).toBe("pass");
    expect(evaluateDoor(door(all(10), all(6))).status).toBe("fail");
    expect(evaluateDoor(door(all(6), all(10))).status).toBe("fail");
    const one = { ...all(9), sheen: 6 };
    expect(evaluateDoor(door(one, all(9))).failing).toEqual(["claude:sheen=6"]);
  });
  it("is incomplete until both judges have scored the latest round", () => {
    expect(evaluateDoor(door(all(9), undefined)).status).toBe("incomplete");
    expect(evaluateDoor({ ...door(all(9), all(9)), rounds: [] }).status).toBe("incomplete");
  });
  it("rejects non-integer or out-of-range scores", () => {
    expect(evaluateDoor(door({ ...all(9), grain: 7.5 }, all(9))).status).toBe("fail");
    expect(evaluateDoor(door({ ...all(9), grain: 11 }, all(9))).status).toBe("fail");
  });
  it("blocks (and says what is needed) when the source photo is missing or too small", () => {
    expect(evaluateDoor(door(all(9), all(9), { path: null })).reasons[0]).toMatch(/missing/);
    expect(sourcePhotoProblem({ path: "x.jpg", width: 300, height: 900 })).toMatch(/too small.*400px/);
    expect(evaluateDoor(door(all(9), all(9), { path: "x.jpg", width: 300, height: 900 })).status).toBe("blocked");
  });
  it("judges the latest round only, so a fixed re-render can pass", () => {
    const e = door(all(5), all(5));
    e.rounds.push({ round: 2, renderPath: "r2.png", change: "match grain", scores: { claude: all(8), cursor: all(7) } });
    expect(evaluateDoor(e).status).toBe("pass");
  });
  it("KitchenCraft gate is closed with no doors, or any door not passing; open only when all pass", () => {
    expect(kitchenCraftGate([]).open).toBe(false);
    expect(kitchenCraftGate([door(all(8), all(8)), door(all(8), all(6))]).open).toBe(false);
    expect(kitchenCraftGate([door(all(8), all(8)), door(all(7), all(9))]).open).toBe(true);
  });
  it("committed manifest follows the rule and currently has no door marked passed", () => {
    const m = JSON.parse(readFileSync(path.resolve(process.cwd(), "data/door-audit/scores_manifest.json"), "utf8"));
    expect(m.passScore).toBe(7);
    expect(kitchenCraftGate(m.doors).open).toBe(false);
  });
});
