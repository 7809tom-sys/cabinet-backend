export type DoorFrameMetricInput = {
  railWidth?: string | number | null;
  stileWidth?: string | number | null;
  sourceSpecification?: string | null;
};

export type CompleteDoorFrameMetrics = {
  railWidth: number;
  stileWidth: number;
};

/**
 * A styled face is only safe to render when its own Door Style record has both
 * frame measurements and an official source citation. A partial or unbound
 * record must retain the neutral renderer rather than mixing a real dimension
 * with an inferred companion dimension.
 */
export function completeDoorFrameMetrics(
  input: DoorFrameMetricInput | null | undefined,
): CompleteDoorFrameMetrics | null {
  if (!input?.sourceSpecification?.trim()) return null;
  const railWidth = Number(input?.railWidth);
  const stileWidth = Number(input?.stileWidth);
  if (!Number.isFinite(railWidth) || railWidth <= 0) return null;
  if (!Number.isFinite(stileWidth) || stileWidth <= 0) return null;
  return { railWidth, stileWidth };
}
