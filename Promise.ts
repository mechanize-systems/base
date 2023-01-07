class NOTHING {}
const nothing = new NOTHING();

export interface Suspendable<T> extends PromiseLike<T> {
  getOrSuspend(): T;
}

class Deferred<T> implements Suspendable<T> {
  promise: Promise<T>;
  error: Error | null;
  _value: T | NOTHING;
  _resolve: (value: T) => void;
  _reject: (err: Error) => void;

  constructor() {
    this._resolve = null as any;
    this._reject = null as any;
    this._value = nothing;
    this.error = null;
    this.promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    }) as Promise<T>;
  }

  resolve = (value: T) => {
    if (this.isCompleted) throw new Error("promise already completed");
    this._value = value;
    this._resolve(value);
  };

  reject = (error: Error) => {
    if (this.isCompleted) throw new Error("promise already completed");
    this.error = error;
    this._reject(error);
  };

  get isResolved() {
    return this._value !== nothing;
  }

  get isRejected() {
    return this.error !== null;
  }

  get isCompleted() {
    return this.isResolved || this.isRejected;
  }

  get value() {
    if (this.isResolved) return this._value as T;
    if (this.isRejected) throw this.error;
    throw new Error("value is not yet available");
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null
  ): Deferred<TResult1 | TResult2> {
    return Deferred.ofPromise(this.promise.then(onfulfilled, onrejected));
  }

  getOrSuspend(): T {
    if (this.isResolved) return this._value as T;
    if (this.isRejected) throw this.error;
    throw this.promise;
  }

  static ofPromise<T>(promise: T | PromiseLike<T>) {
    let deferred = new Deferred<T>();
    Promise.resolve(promise).then(deferred.resolve, deferred.reject);
    return deferred;
  }
}

export type { Deferred };

export function isDeferred<T>(
  value: Deferred<T> | unknown
): value is Deferred<T> {
  return value instanceof Deferred;
}

export function deferred<T>(): Deferred<T> {
  return new Deferred<T>();
}

export function suspendable<T>(
  f: () => T | PromiseLike<T>
): () => Suspendable<T> {
  let deferred: Deferred<T> | null = null;
  return () => {
    if (deferred == null) {
      deferred = Deferred.ofPromise(f());
    }
    return deferred;
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Execute async tasks with limited concurrency. */
export type Pool = {
  /** Pool size. */
  size: number;

  /** Execute `f` once there's a free slot in pool. */
  run<T>(f: () => Promise<T>): Promise<T>;
};

/** Create a pool with `size` of simultaneously executing tasks. */
export function pool(size: number): Pool {
  if (size <= 0) throw new Error("Pool: size must be > 0");
  let slot: Deferred<void> = deferred();
  return {
    size,
    async run<T>(f: () => Promise<T>): Promise<T> {
      while (size === 0)
        // No free slot, must wait for a free one. As there could me multiple
        // tasks racing for the slot we wait in a loop.
        await slot;
      size = size - 1;
      if (size === 0)
        // Afterwards no free slot left, refresh deferred.
        slot = deferred();
      try {
        return await f();
      } finally {
        if (size === 0)
          // There's a free slot, resolve deferred.
          slot.resolve();
        size = size + 1;
      }
    },
  };
}
