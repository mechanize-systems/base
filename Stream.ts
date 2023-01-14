import { Readable as NodeReadable } from "node:stream";
import type { ReadableStream } from "stream/web";

export async function readToString(s0: ReadableStream | NodeReadable) {
  let s: ReadableStream =
    s0 instanceof NodeReadable ? NodeReadable.toWeb(s0) : s0;
  let reader = s.getReader();
  try {
    let res = "";
    while (true) {
      let { done, value } = await reader.read();
      if (done) return res;
      res += value;
    }
  } finally {
    reader.releaseLock();
  }
}
