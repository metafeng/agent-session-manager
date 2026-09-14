const zhNumber = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 2
});

export function formatChineseMagnitude(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";

  const magnitude = Math.abs(number);
  if (magnitude >= 100_000_000) return `${zhNumber.format(number / 100_000_000)} 亿`;
  if (magnitude >= 10_000_000) return `${zhNumber.format(number / 10_000_000)} 千万`;
  if (magnitude >= 10_000) return `${zhNumber.format(number / 10_000)} 万`;
  return zhNumber.format(number);
}
