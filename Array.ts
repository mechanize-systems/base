export function* reversed<V>(it: readonly V[]): Iterable<V> {
  for (let i = it.length - 1; i >= 0; i--) yield it[i];
}
