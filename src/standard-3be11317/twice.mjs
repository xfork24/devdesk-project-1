export function twice(n) {
  if (!Number.isFinite(n)) {
    throw new TypeError('n must be a finite number');
  }
  return n * 2;
}
