export type DoorFrameMetricInput = {
  railWidth?: string | number | null;
  stileWidth?: string | number | null;
  sourceSpecification?: string | null;
};

export type CompleteDoorFrameMetrics = {
  railWidth: number;
  stileWidth: number;
};

export type DesignerFrameCompliance = {
  isCompliant: boolean;
  reason: string | null;
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

/**
 * The Featured Styles interfaces must show the same truth as the Designer:
 * incomplete measurements or an uncited profile render with the neutral face,
 * so they are not Designer-compliant until the source-bound profile is complete.
 */
export function designerFrameCompliance(
  input: DoorFrameMetricInput | null | undefined,
): DesignerFrameCompliance {
  if (completeDoorFrameMetrics(input)) return { isCompliant: true, reason: null };

  const railWidth = Number(input?.railWidth);
  const stileWidth = Number(input?.stileWidth);
  const hasBothMeasurements = Number.isFinite(railWidth) && railWidth > 0
    && Number.isFinite(stileWidth) && stileWidth > 0;
  const hasCitation = Boolean(input?.sourceSpecification?.trim());
  if (!hasBothMeasurements && !hasCitation) {
    return { isCompliant: false, reason: "Verified rail and stile measurements plus an official source citation are required." };
  }
  if (!hasBothMeasurements) {
    return { isCompliant: false, reason: "Verified rail and stile measurements are required." };
  }
  return { isCompliant: false, reason: "An official source citation is required." };
}
