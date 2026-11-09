// The phrase marks scripts/build/phrases.ts puts in the sentences the pages show (a zero-width
// space between phrases, so lines break between them in every browser). Kept apart from the
// segmenter so the pages can strip them without bundling it.

export const BREAK = '\u200b';

/** `text` without the phrase marks: for text taken out of the page (a meta description). */
export const plain = (text: string) => text.replaceAll(BREAK, '');
