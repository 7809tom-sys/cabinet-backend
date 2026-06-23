// Client-side auto-fill wrapper.
//
// The actual tiling math lives in shared/fillEngine.ts so the client "Auto-Fill
// Wall" button and the server AI design-consultant share ONE implementation and
// can never drift apart. This file simply re-exports it with client-friendly
// types (DesignCabinet) so existing imports keep working.

import type { DesignCabinet } from "./design";
import {
  autoFillSpan as autoFillSpanShared,
  candidatesForMode as candidatesForModeShared,
  makeFiller as makeFillerShared,
  type FillMode as SharedFillMode,
  type FillItem as SharedFillItem,
  type FillResult as SharedFillResult,
} from "../../../shared/fillEngine";

export type FillMode = SharedFillMode;

export interface FillItem extends SharedFillItem {
  cabinet: DesignCabinet;
}

export interface FillResult extends SharedFillResult {
  items: FillItem[];
}

export function candidatesForMode(mode: FillMode, catalog: DesignCabinet[]): DesignCabinet[] {
  return candidatesForModeShared(mode, catalog as never) as unknown as DesignCabinet[];
}

export function makeFiller(widthInches: number, placement: DesignCabinet["placement"] = "base"): DesignCabinet {
  return makeFillerShared(widthInches, placement) as unknown as DesignCabinet;
}

export function autoFillSpan(spanInches: number, mode: FillMode, catalog: DesignCabinet[]): FillResult {
  return autoFillSpanShared(spanInches, mode, catalog as never) as unknown as FillResult;
}
