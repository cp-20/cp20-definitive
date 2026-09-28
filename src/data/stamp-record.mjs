// Firebase may encode numeric slot keys as an array with null holes.
export const stampEntries = (record) =>
  Object.entries(record?.stamps || {}).filter(([, stamp]) => stamp != null);
