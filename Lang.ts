/**
 * Assert that `value` is truthy, throws an error is not.
 */
export function assert(value: unknown, msg: string = "oops!"): asserts value {
  if (!Boolean(value)) throw new Error(`Assertion failed: ${msg}`);
}

/**
 * Assert that `value` is never going to exist.
 *
 * This is useful to mark some branches of if/switch statements as "impossible".
 * At runtime this just throws an error.
 */
export function never(_value: never, msg: string = "oops!"): never {
  throw new Error(`Impossible: ${msg}`);
}

export type NarrowTuple<A> =
  | (A extends [] ? [] : never)
  | { [K in keyof A]: A[K] };
