/**
 * A square-ish image (a site that only offers its app icon, such as a Marketplace listing) is not
 * stretched to fill the OG frame: it sits at no more than its own size on the placeholder pattern.
 * @param {{ width?: number | null; height?: number | null } | undefined} preview
 */
export const isIconImage = (preview) =>
  Boolean(preview?.width && preview?.height && preview.width / preview.height < 1.3);
