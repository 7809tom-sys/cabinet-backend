import { useEffect } from "react";

/**
 * Minimal, dependency-free SEO helper. Sets document.title and the
 * <meta name="description"> content while the component is mounted, then
 * restores the previous values on unmount. Keeps us SEO-friendly without
 * pulling in react-helmet.
 */
export function useSeo(title: string, description?: string) {
  useEffect(() => {
    const prevTitle = document.title;
    if (title) document.title = title;

    let metaEl: HTMLMetaElement | null = null;
    let prevDesc: string | null = null;
    let createdMeta = false;

    if (description) {
      metaEl = document.querySelector('meta[name="description"]');
      if (!metaEl) {
        metaEl = document.createElement("meta");
        metaEl.setAttribute("name", "description");
        document.head.appendChild(metaEl);
        createdMeta = true;
      } else {
        prevDesc = metaEl.getAttribute("content");
      }
      metaEl.setAttribute("content", description);
    }

    return () => {
      document.title = prevTitle;
      if (metaEl) {
        if (createdMeta) {
          metaEl.remove();
        } else if (prevDesc !== null) {
          metaEl.setAttribute("content", prevDesc);
        }
      }
    };
  }, [title, description]);
}
