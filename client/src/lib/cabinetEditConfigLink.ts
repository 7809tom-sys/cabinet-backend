export type CabinetEditConfigLink = {
  href: string;
  target: "_blank";
  rel: "noopener noreferrer";
};

/**
 * Returns the safe external-navigation contract for a cabinet's Edit Config
 * destination. An absent master-config URL means the current viewer is not
 * entitled to see an edit destination.
 */
export function cabinetEditConfigLink(masterConfigHref?: string): CabinetEditConfigLink | null {
  if (!masterConfigHref) return null;

  return {
    href: masterConfigHref,
    target: "_blank",
    rel: "noopener noreferrer",
  };
}
