export function csvEscape(value: string): string {
  const prefixed = /^[=+\-@|]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(prefixed) || prefixed !== value) {
    return `"${prefixed.replace(/"/g, '""')}"`;
  }
  return prefixed;
}

export function toCsv(headers: string[], rows: Array<Array<string | null | undefined>>): string {
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map((cell) => csvEscape(cell ?? "")).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
