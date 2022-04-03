export function* reversed<V>(it: readonly V[]): Iterable<V> {
  for (let i = it.length - 1; i >= 0; i--) yield it[i];
}

export function sum(it: number[]): number {
  let acc = 0;
  for (let v of it) acc += v;
  return acc;
}

export function max(it: number[]): number {
  let acc = -Infinity;
  for (let v of it) acc = Math.max(acc, v);
  return acc;
}

export function min(it: number[]): number {
  let acc = Infinity;
  for (let v of it) acc = Math.min(acc, v);
  return acc;
}
