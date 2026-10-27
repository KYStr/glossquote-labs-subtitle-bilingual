export function intersectionMs(a, b) {
  return Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs));
}

export function unionMs(a, b) {
  return (a.endMs - a.startMs) + (b.endMs - b.startMs) - intersectionMs(a, b);
}

export function normalizeRatio(numerator, denominator) {
  if (!Number.isSafeInteger(numerator) || numerator < 0 || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError('INVALID_RATIO');
  }
  if (!numerator) return { numerator: 0, denominator: 1 };
  let a = BigInt(numerator);
  let b = BigInt(denominator);
  while (b) [a, b] = [b, a % b];
  return { numerator: Number(BigInt(numerator) / a), denominator: Number(BigInt(denominator) / a) };
}

export function compareRatio(a, b) {
  const left = BigInt(a.numerator) * BigInt(b.denominator);
  const right = BigInt(b.numerator) * BigInt(a.denominator);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function eligible(a, b) {
  return BigInt(intersectionMs(a, b)) * 2n >= BigInt(unionMs(a, b));
}

export function measure(a, b) {
  const intersection = intersectionMs(a, b);
  const union = unionMs(a, b);
  return { intersectionMs: intersection, unionMs: union, iou: normalizeRatio(intersection, union) };
}
