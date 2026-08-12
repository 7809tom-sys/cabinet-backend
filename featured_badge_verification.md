# Featured Badge Verification

The storefront family picker now receives affiliate-scoped family metadata from `storefront.families({ slug })`, including `featured`. Family cards render a visible `Featured` badge with a sparkle icon in the image overlay. The badge is positioned at the top-right, below any promotional badge when both are present, and uses the affiliate accent color.

The desktop Reeves Way storefront route rendered successfully at `/store/reaves-way-cabinet-shop`. A full-page mobile capture also rendered successfully at 390x844 without route or layout errors. The capture was long and visually compressed in the tool preview, so the badge's exact lower-page pixels were not readable from the contact-style output; TypeScript validation passed after the implementation.
