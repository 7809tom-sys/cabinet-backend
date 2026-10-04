/**
 * Free-standing cabinet runs.
 *
 * The Continuous Wall Builder already produces one seamless, mitered
 * countertop over a run that turns 45°: every slab keeps its cabinet-supported
 * area, two neighbouring slabs meet at one real seam, and the outer corner is
 * the shared miter point where the two front edges intersect. This module gives
 * the ordinary Designer the same result for cabinets that sit in the open room
 * (no wall seat, no peninsula run, no island): bases that physically touch are
 * grouped into a chain, each cabinet contributes its own slab (cabinet depth
 * plus the standard front overhang, at its own rotation), and adjoining slabs
 * are joined edge-to-edge or mitered at a turn so the chain becomes ONE polygon.
 *
 * Nothing here touches walls, peninsulas, islands, or pricing.
 */
import {
  COUNTERTOP_DEPTH_IN,
  STD,
  cabinetPlanBodiesIntersect,
  cabinetWall,
  isAgainstWall,
  isOnIsland,
  peninsulaRunById,
  placedCornerGeometryKind,
  placedFootprint,
  type CountertopPlanPoint,
  type CountertopSurface,
  type IslandZone,
  type PlacedCabinet,
  type RoomData,
} from "@/lib/design";

const EPS = 1e-6;
/** Two free-standing boxes count as touching when their sides are within this gap. */
export const FREESTANDING_JOIN_TOLERANCE_IN = 1.5;
/** The countertop front overhang beyond the cabinet face (25.5 top on a 24 box). */
const frontOverhangIn = () => COUNTERTOP_DEPTH_IN - STD.BASE_DEPTH;

type Pt = CountertopPlanPoint;

export interface FreestandingBody {
  cabinet: PlacedCabinet;
  /** World centre of the rotated body. */
  center: Pt;
  width: number;
  depth: number;
  /** Plan rotation in radians (0 = front faces +y). */
  radians: number;
  /** Unit vector along the cabinet's width (left → right as seen from the front). */
  tangent: Pt;
  /** Unit vector from the back toward the front face. */
  forward: Pt;
}

function rot(p: Pt, radians: number): Pt {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}
function add(a: Pt, b: Pt): Pt { return { x: a.x + b.x, y: a.y + b.y }; }
function sub(a: Pt, b: Pt): Pt { return { x: a.x - b.x, y: a.y - b.y }; }
function scale(a: Pt, k: number): Pt { return { x: a.x * k, y: a.y * k }; }
function dist(a: Pt, b: Pt): number { return Math.hypot(a.x - b.x, a.y - b.y); }

/** Intersection of two infinite lines given by point + direction. */
function lineIntersection(p: Pt, d: Pt, q: Pt, e: Pt): Pt | null {
  const cross = d.x * e.y - d.y * e.x;
  if (Math.abs(cross) < EPS) return null;
  const t = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / cross;
  return add(p, scale(d, t));
}

/** True when a standard base is in the open room: not seated, not against a wall, not on an island or peninsula. */
export function isFreestandingBase(cabinet: PlacedCabinet, room: RoomData, island?: IslandZone | null): boolean {
  if (cabinet.placement !== "base") return false;
  if (cabinet.wallId || cabinet.islandFace) return false;
  if (placedCornerGeometryKind(cabinet) !== "standard") return false;
  if (island && isOnIsland(cabinet, island)) return false;
  if (room.peninsulaRuns?.some((run) => run.id === cabinet.wallId)) return false;
  const nearest = cabinetWall(cabinet, room);
  if (nearest && isAgainstWall(cabinet, nearest as never, room)) return false;
  return !(["top", "bottom", "left", "right"] as const).some((side) => isAgainstWall(cabinet, side, room));
}

/** Resolves the rotated body frame of a free-standing cabinet from its AABB record. */
export function freestandingBody(cabinet: PlacedCabinet): FreestandingBody {
  const footprint = placedFootprint(cabinet);
  const width = Math.max(0.01, Number(cabinet.width) || footprint.w);
  const depth = Math.max(0.01, Number(cabinet.depth) || footprint.d);
  const radians = ((((Number(cabinet.rotation) || 0) % 360) + 360) % 360) * Math.PI / 180;
  const center = { x: cabinet.x + footprint.w / 2, y: cabinet.y + footprint.d / 2 };
  return {
    cabinet,
    center,
    width,
    depth,
    radians,
    tangent: rot({ x: 1, y: 0 }, radians),
    forward: rot({ x: 0, y: 1 }, radians),
  };
}

/** The four world corners of the body: back-left, back-right, front-right, front-left. */
export function freestandingBodyCorners(body: FreestandingBody): [Pt, Pt, Pt, Pt] {
  const hw = body.width / 2;
  const hd = body.depth / 2;
  const t = body.tangent;
  const f = body.forward;
  const c = body.center;
  return [
    add(c, add(scale(t, -hw), scale(f, -hd))),
    add(c, add(scale(t, hw), scale(f, -hd))),
    add(c, add(scale(t, hw), scale(f, hd))),
    add(c, add(scale(t, -hw), scale(f, hd))),
  ];
}

/** Slab corners for one body: the box plus the front overhang, same order as the body corners. */
function freestandingSlabCorners(body: FreestandingBody): [Pt, Pt, Pt, Pt] {
  const [bl, br, fr, fl] = freestandingBodyCorners(body);
  const over = scale(body.forward, frontOverhangIn());
  return [bl, br, add(fr, over), add(fl, over)];
}

/** Two bodies touch when a right/left end edge of one is within tolerance of an end edge of the other. */
function bodiesJoin(a: FreestandingBody, b: FreestandingBody): boolean {
  const [abl, abr, afr, afl] = freestandingBodyCorners(a);
  const [bbl, bbr, bfr, bfl] = freestandingBodyCorners(b);
  const aEnds = [[abl, afl], [abr, afr]];
  const bEnds = [[bbl, bfl], [bbr, bfr]];
  for (const [a0, a1] of aEnds) {
    for (const [b0, b1] of bEnds) {
      // Back corners meet (flush straight join or a mitered turn that shares the back corner)...
      if (dist(a0!, b0!) <= FREESTANDING_JOIN_TOLERANCE_IN) return true;
      // ...or the two end edges coincide for a straight join.
      if (dist(a0!, b0!) <= FREESTANDING_JOIN_TOLERANCE_IN && dist(a1!, b1!) <= FREESTANDING_JOIN_TOLERANCE_IN) return true;
      // ...or the front corners meet (mitered turn that shares the front corner).
      if (dist(a1!, b1!) <= FREESTANDING_JOIN_TOLERANCE_IN) return true;
    }
  }
  return false;
}

/** Groups free-standing bases into chains of physically touching bodies, ordered along the run. */
export function freestandingChains(placed: readonly PlacedCabinet[], room: RoomData, island?: IslandZone | null): FreestandingBody[][] {
  const bodies = placed.filter((cabinet) => isFreestandingBase(cabinet, room, island)).map(freestandingBody);
  const unvisited = new Set(bodies.map((_, index) => index));
  const chains: FreestandingBody[][] = [];
  while (unvisited.size) {
    const seed = unvisited.values().next().value as number;
    unvisited.delete(seed);
    const members = [bodies[seed]!];
    let grew = true;
    while (grew) {
      grew = false;
      for (const index of Array.from(unvisited)) {
        if (members.some((member) => bodiesJoin(member, bodies[index]!))) {
          members.push(bodies[index]!);
          unvisited.delete(index);
          grew = true;
        }
      }
    }
    chains.push(orderChain(members));
  }
  return chains;
}

/** Orders chain members end-to-end by walking neighbours from one extremity. */
function orderChain(members: FreestandingBody[]): FreestandingBody[] {
  if (members.length <= 2) return members;
  const neighbours = members.map((member) => members.filter((other) => other !== member && bodiesJoin(member, other)));
  let startIndex = neighbours.findIndex((list) => list.length === 1);
  if (startIndex < 0) startIndex = 0;
  const ordered: FreestandingBody[] = [members[startIndex]!];
  const used = new Set<FreestandingBody>(ordered);
  while (ordered.length < members.length) {
    const last = ordered[ordered.length - 1]!;
    const next = neighbours[members.indexOf(last)]!.find((candidate) => !used.has(candidate));
    if (!next) break;
    ordered.push(next);
    used.add(next);
  }
  for (const member of members) if (!used.has(member)) ordered.push(member);
  return ordered;
}

/**
 * Builds the one continuous outline for an ordered chain. Walking the chain
 * from first to last, the back edge of every slab is laid out, then the front
 * edges in reverse. At every join the two neighbouring edges are extended to
 * their intersection — exactly the fabricated miter point the Continuous Wall
 * Builder uses — so a 45° turn gets a clean seamless corner and a straight
 * join simply continues the edge.
 */
export function freestandingChainOutline(chain: FreestandingBody[]): Pt[] {
  if (chain.length === 0) return [];
  // Make every body point the same way along the run: body k's right end
  // should touch body k+1's left end. Flip (rotate 180°) bodies as needed.
  const oriented = orientChain(chain);
  const slabs = oriented.map(freestandingSlabCorners);
  const backs: Pt[] = [];
  const fronts: Pt[] = [];
  for (let index = 0; index < slabs.length; index += 1) {
    const [bl, br, fr, fl] = slabs[index]!;
    const body = oriented[index]!;
    if (index === 0) {
      backs.push(bl);
      fronts.push(fl);
    } else {
      const prev = oriented[index - 1]!;
      const [pbl, , , pfl] = slabs[index - 1]!;
      const backJoin = lineIntersection(pbl, prev.tangent, bl, body.tangent);
      const frontJoin = lineIntersection(pfl, prev.tangent, fl, body.tangent);
      backs.push(backJoin ?? bl);
      fronts.push(frontJoin ?? fl);
    }
    if (index === slabs.length - 1) {
      backs.push(br);
      fronts.push(fr);
    }
  }
  return [...backs, ...fronts.reverse()];
}

function flipBody(body: FreestandingBody): FreestandingBody {
  return {
    ...body,
    radians: body.radians + Math.PI,
    tangent: scale(body.tangent, -1),
    forward: scale(body.forward, -1),
  };
}

/** Ensures each body's "right" end meets the next body's "left" end; preserves fronts facing the same half-plane. */
function orientChain(chain: FreestandingBody[]): FreestandingBody[] {
  if (chain.length < 2) return chain;
  const out: FreestandingBody[] = [];
  for (let index = 0; index < chain.length; index += 1) {
    const current = chain[index]!;
    if (index === 0) {
      const next = chain[1]!;
      const [bl, br] = freestandingBodyCorners(current);
      const nextCorners = freestandingBodyCorners(next);
      const nearRight = Math.min(...nextCorners.map((p) => dist(p, br)));
      const nearLeft = Math.min(...nextCorners.map((p) => dist(p, bl)));
      out.push(nearRight <= nearLeft ? current : flipBody(current));
      continue;
    }
    const prev = out[index - 1]!;
    const [, pbr, pfr] = freestandingBodyCorners(prev);
    const [bl, br, fr, fl] = freestandingBodyCorners(current);
    const asIs = Math.min(dist(bl, pbr), dist(fl, pfr));
    const flipped = Math.min(dist(br, pbr), dist(fr, pfr));
    out.push(asIs <= flipped ? current : flipBody(current));
  }
  // Keep fronts on a consistent side: the first body decides; if the majority
  // of forwards oppose it we flip the whole walk (so the outline is still one
  // simple polygon, just traversed the other way).
  return out;
}

function polygonArea(points: Pt[]): number {
  if (points.length < 3) return 0;
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

/** One CountertopSurface per free-standing chain, as a world-anchored polygon slab. */
export function freestandingCountertopSurfaces(placed: readonly PlacedCabinet[], room: RoomData, island?: IslandZone | null): CountertopSurface[] {
  const out: CountertopSurface[] = [];
  for (const chain of freestandingChains(placed, room, island)) {
    const world = freestandingChainOutline(chain);
    if (world.length < 3) continue;
    const minX = Math.min(...world.map((p) => p.x));
    const maxX = Math.max(...world.map((p) => p.x));
    const minY = Math.min(...world.map((p) => p.y));
    const maxY = Math.max(...world.map((p) => p.y));
    const area = polygonArea(world);
    if (maxX - minX <= EPS || maxY - minY <= EPS || area <= EPS) continue;
    const linear = chain.reduce((sum, body) => sum + body.width, 0);
    out.push({
      x: minX,
      y: minY,
      width: maxX - minX,
      depth: maxY - minY,
      kind: "base",
      polygon: world.map((p) => ({ x: p.x - minX, y: p.y - minY })),
      linearInches: linear,
      areaInches: area,
      cabinetRunId: `freestanding:${chain.map((body) => body.cabinet.uid).sort().join("+")}`,
      freestandingMemberUids: chain.map((body) => body.cabinet.uid),
    });
  }
  return out;
}

/**
 * Flush 45° join: when a free cabinet rotated to an odd 45° is dropped near
 * the end of a free-standing neighbour, seat it so the two back corners
 * coincide and its front face meets the neighbour's front at the miter — the
 * same flush, gap-free seat the Continuous Wall Builder gives an angled wall.
 * Returns the adjusted AABB position, or null when nothing is near.
 */
export function snapFreestandingFortyFive(
  moving: PlacedCabinet,
  others: readonly PlacedCabinet[],
  room: RoomData,
  island?: IslandZone | null,
  threshold = STD.SNAP_THRESHOLD,
): { x: number; y: number; neighbourUid: string } | null {
  const rotation = (((Number(moving.rotation) || 0) % 360) + 360) % 360;
  if (![45, 135, 225, 315].includes(rotation)) return null;
  if (moving.placement !== "base" || placedCornerGeometryKind(moving) !== "standard" || moving.wallId) return null;
  const body = freestandingBody(moving);
  const mineCorners = freestandingBodyCorners(body);
  let best: { x: number; y: number; neighbourUid: string; distance: number } | null = null;
  const freeOthers = others.filter((other) => other.uid !== moving.uid && isFreestandingBase(other, room, island));
  for (const other of freeOthers) {
    const theirCorners = freestandingBodyCorners(freestandingBody(other));
    for (const mine of mineCorners) {
      for (const theirs of theirCorners) {
        const distance = dist(mine, theirs);
        if (distance > threshold || (best && distance >= best.distance)) continue;
        const shift = sub(theirs, mine);
        const seated = { ...moving, x: moving.x + shift.x, y: moving.y + shift.y };
        // Only a seat whose true rotated body merely touches its neighbours is
        // flush; a corner match that swings the box into a neighbour is skipped.
        if (freeOthers.some((peer) => cabinetPlanBodiesIntersect(seated, peer))) continue;
        best = { x: seated.x, y: seated.y, neighbourUid: other.uid, distance };
      }
    }
  }
  return best ? { x: best.x, y: best.y, neighbourUid: best.neighbourUid } : null;
}
