export function classifyParity(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < -1000000 || value > 1000000) {
    return '输入无效';
  }
  return value % 2 === 0 ? '偶数' : '奇数';
}
