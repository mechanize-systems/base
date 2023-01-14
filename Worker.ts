import { Deferred, deferred } from "./Promise";
import { Result, error, ok } from "./Result";

type AnyMethods = { [name: string]: (...args: any[]) => Promise<any> | any };

export function defineWorker<Methods extends AnyMethods>(methods: Methods) {
  addEventListener("message", async (event) => {
    let [id, name, params] = event.data as [number, string, any[]];
    let process = methods[name];
    if (process == null)
      return postMessage([id, error(`no such method '${name}'`)]);
    try {
      postMessage([id, ok(await process(...params))]);
    } catch (err) {
      postMessage([id, error(err)]);
    }
  });
}

export class WorkerManager<Methods extends AnyMethods, E = string> {
  private _id: number;
  private _worker: Promise<Worker> | null;
  private _waiting: Map<number, Deferred<Result<any, E>>>;
  private _create: () => Worker | Promise<Worker>;

  constructor(create: () => Worker | Promise<Worker>) {
    this._id = 0;
    this._create = create;
    this._worker = null;
    this._waiting = new Map();
  }

  onmessage = (evt: MessageEvent) => {
    let [id, result] = evt.data as [number, Result<any, E>];
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

  async submit<N extends keyof Methods>(
    name: N,
    params: Parameters<Methods[N]>
  ): Promise<Result<Awaited<ReturnType<Methods[N]>>, E>> {
    let id = (this._id += 1);
    let def = deferred<Result<any, E>>();
    this._waiting.set(id, def);
    (await this.worker).postMessage([id, name, params]);
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
    new Worker("blob://", tester);
  } finally {
    return supports;
  }
}
