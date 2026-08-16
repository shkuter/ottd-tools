export function money(value: number): string {
  return '£' + Math.round(value).toLocaleString('en-GB');
}

export function num(value: number, digits = 0): string {
  return value.toLocaleString('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}
