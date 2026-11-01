// Break points for identifiers such as repository names, so they wrap between words
// (zundamon-|explainer, Kotonoha|Collector) rather than wherever the line runs out.

/**
 * Splits a name after `-`, `_`, `.` and `/`, and between the words of a PascalCase name
 * (KotonohaCollector). A capital inside a lower-case word (traQ, traQing) is not a word start.
 * Joining the parts gives back the name.
 * @param {string} name
 * @returns {string[]}
 */
export function nameParts(name) {
  return name.split(/(?<=[-_./])(?=.)|(?<=(?:^|[^A-Za-z])[A-Z][a-z0-9]+)(?=[A-Z][a-z])/);
}
