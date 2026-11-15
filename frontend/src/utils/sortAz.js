/** A sorted copy of a list, A to Z by label (ignores case, numbers sort naturally). Used for every dropdown. */
export function sortAz(list, label = (x) => x) {
  return [...(list || [])].sort((a, b) =>
    String(label(a) ?? "").localeCompare(String(label(b) ?? ""), undefined, { sensitivity: "base", numeric: true }),
  );
}
