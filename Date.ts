export function now() {
  return new Date();
}

export function parseUTC(v: string): Date {
  if (!v.endsWith("+00:00")) v = v + "+00:00";
  return new Date(v);
}
