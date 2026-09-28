export const sameStamp = (a, b) => ['anchor', 'x', 'y', 'kind', 'angle'].every((key) => a[key] === b[key]);
export function projectStamps(remote, operations, owner) {
  let result = [...remote];
  for (const op of operations) {
    if (op.type === 'remove') {
      result = result.filter((s) => s.id !== op.target.id);
      continue;
    }
    // A stream event can arrive before the PUT response. Keep one visual copy.
    result = result.filter((s) => !(s.owner === owner && sameStamp(s, op.stamp)));
    const own = result
      .filter((s) => s.owner === owner || s.owner === 'local')
      .sort((a, b) => a.createdAt - b.createdAt);
    if (own.length >= 5) result = result.filter((s) => s.id !== own[0].id);
    result.push(op.stamp);
  }
  return result;
}
