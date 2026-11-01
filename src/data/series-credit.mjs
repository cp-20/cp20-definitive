// How a manga's credit is shown on the /about shelf. The full credit (src/data/series.json)
// names everyone, e.g. "柳ゆうと (原作：もちもち物質 キャラクター原案：ペペロン)"; a narrow
// spine only has room for the first name, so the caption and the book's label carry the rest.

/**
 * The name printed on a spine: the credit up to its first bracketed part.
 * @param {string} author
 * @returns {string}
 */
export function spineAuthor(author) {
  return author.replace(/\s*[（(].*$/, '');
}
