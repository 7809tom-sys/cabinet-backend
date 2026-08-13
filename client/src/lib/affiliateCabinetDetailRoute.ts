export function affiliateCabinetDetailHref({
  slug,
  masterCode,
  styleId,
}: {
  slug?: string;
  masterCode: string;
  styleId: number;
}): string {
  const code = encodeURIComponent(masterCode);
  const query = `?style=${styleId}`;
  return slug ? `/store/${slug}/catalog/${code}${query}` : `/catalog/${code}${query}`;
}
