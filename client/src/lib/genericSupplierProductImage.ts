/**
 * Neutral placeholder for a supplier item without a verified product photo.
 * It intentionally depicts a labeled shipping carton rather than a cabinet,
 * so it never represents unknown merchandise as a source-verified product.
 */
export const GENERIC_SUPPLIER_PRODUCT_IMAGE = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" role="img" aria-label="Generic supplier item">
  <rect width="320" height="240" rx="18" fill="#f4efe6"/>
  <path d="M72 82 160 42l88 40v94l-88 42-88-42V82Z" fill="#c9a46c" stroke="#6b4f2f" stroke-width="7" stroke-linejoin="round"/>
  <path d="m72 82 88 42 88-42M160 124v94" fill="none" stroke="#6b4f2f" stroke-width="7" stroke-linejoin="round"/>
  <rect x="121" y="140" width="78" height="34" rx="4" fill="#fffaf0" stroke="#6b4f2f" stroke-width="4"/>
  <path d="M135 151h50M135 162h36" stroke="#a87f33" stroke-width="4" stroke-linecap="round"/>
  <circle cx="256" cy="48" r="27" fill="#1a2744"/>
  <path d="M248 48h16M256 40v16" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
</svg>`)}
`;
