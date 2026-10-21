export type CrmHelpNotificationKind = "design" | "shipping";

export type CrmHelpFlags = {
  needsHelpDesigning?: boolean | null;
  needsHelpShipping?: boolean | null;
};

export type CrmHelpNotificationSettings = {
  enabled: boolean;
  notifyOnCrmDesignHelp: boolean;
  notifyOnCrmShippingHelp: boolean;
  onCrmDesignHelp: string;
  onCrmShippingHelp: string;
};

function recipientList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,;]+/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

/**
 * Returns a matching internal team only after every required opt-in is active.
 * It deliberately never falls back to a general design-lead recipient list.
 */
export function recipientsForCrmHelpNotification(
  settings: CrmHelpNotificationSettings | null | undefined,
  kind: CrmHelpNotificationKind,
): string[] {
  if (!settings?.enabled) return [];
  if (kind === "design") {
    return settings.notifyOnCrmDesignHelp ? recipientList(settings.onCrmDesignHelp) : [];
  }
  return settings.notifyOnCrmShippingHelp ? recipientList(settings.onCrmShippingHelp) : [];
}

/**
 * A help notification is event-based: it is eligible only for an explicit
 * transition from not requested to requested. Re-saving a deal or setting an
 * already-true flag does not create an additional team email.
 */
export function newlyRequestedCrmHelpKinds(
  current: CrmHelpFlags,
  input: CrmHelpFlags,
): CrmHelpNotificationKind[] {
  const kinds: CrmHelpNotificationKind[] = [];
  if (input.needsHelpDesigning === true && !current.needsHelpDesigning) kinds.push("design");
  if (input.needsHelpShipping === true && !current.needsHelpShipping) kinds.push("shipping");
  return kinds;
}
