import { Deferred, deferred } from "./Promise";
import { Result, error, ok } from "./Result";

export function defineWorker<P extends any[], R>(
  process: (...args: P) => R | Promise<R>,
) {
  addEventListener("message", async (event) => {
    let [id, params] = event.data as [number, P];
    try {
      postMessage([id, ok(await process(...params))]);
    } catch (err) {
      postMessage([id, error(err)]);
    }
  });
}

export class WorkerManager<P extends any[], R, E = string> {
  private _id: number;
  private _worker: Promise<Worker> | null;
  private _waiting: Map<number, Deferred<Result<R, E>>>;
  private _create: () => Worker | Promise<Worker>;

  constructor(create: () => Worker | Promise<Worker>) {
    this._id = 0;
    this._create = create;
    this._worker = null;
    this._waiting = new Map();
  }

  onmessage = (evt: MessageEvent) => {
    let [id, result] = evt.data as [number, Result<R, E>];
    let deferred = this._waiting.get(id);
    if (deferred == null)
      throw new Error(`WorkerManager: orphaned result ${id}`);
    this._waiting.delete(id);
    deferred.resolve(result);
  };

  get worker() {
    if (this._worker == null) {
      this._worker = Promise.resolve(this._create());
      this._worker.then((worker) => {
        worker.onmessage = this.onmessage;
      });
    }
    return this._worker;
  }

  async submit(...params: P) {
    let id = (this._id += 1);
    let def = deferred<Result<R, E>>();
    this._waiting.set(id, def);
    (await this.worker).postMessage([id, params]);
    return def.promise;
  }

  async terminate() {
    if (this._worker != null) {
      (await this._worker).terminate();
      this._worker = null;
    }
    this._waiting.clear();
  }
}

export function supportsWorkerModule(): boolean {
  let supports = false;
  const tester = {
    get type() {
      // it's been called, it's supported
      supports = true;
      return undefined as any;
    },
  };
  try {
    // We use "blob://" as url to avoid an useless network request.
    // This will either throw in Chrome
    // either fire an error event in Firefox
    // which is perfect since
    // we don't need the worker to actually start,
    // checking for the type of the script is done before trying to load it.
    const worker = new Worker("blob://", tester);
  } finally {
    return supports;
  }
}
