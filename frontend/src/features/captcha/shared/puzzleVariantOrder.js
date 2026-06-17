export function getPuzzleVariantOrder({
  variants = [],
  top3 = [],
  reverse = false,
} = {}) {
  const indexes = variants.map((_, index) => index);

  if (reverse) {
    return indexes.reverse();
  }

  return indexes.sort((a, b) => {
    const rankA = top3.indexOf(String(a));
    const rankB = top3.indexOf(String(b));
    if (rankA >= 0 && rankB >= 0) return rankA - rankB;
    if (rankA >= 0) return -1;
    if (rankB >= 0) return 1;
    return a - b;
  });
}
