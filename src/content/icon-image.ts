/**
 * Whether a work's image is an app icon (a site that only offers its app icon, such as a
 * Marketplace listing) rather than an OG card. Such an image is not stretched to fill the OG
 * frame: it sits at no more than its own size on the placeholder pattern.
 *
 * This is stated in works.json (`"imageKind": "icon"`), never guessed from the fetched image's
 * aspect ratio: square and portrait OG cards (sizu.me's 500×500 ones, for example) are cards.
 */
export const isIconImage = (work: { imageKind?: string } | undefined) => work?.imageKind === 'icon';
