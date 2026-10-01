/**
 * @jsxImportSource @solidjs/web
 */
// A boundary that resolves while the shell is still an unresolved ROOT HOLE.
//
// An error boundary flattens its subtree and, while any hole inside it is
// pending, rethrows them upward as one NotReadyError, so a single async read
// outside every <Loading> turns the whole subtree into one root hole
// (`<!--rh0-->`). A <Loading> inside that subtree whose content settles first
// resolves in the middle of that: its fragment-resolve path calls flushEnd(),
// and its placeholder is not in the shell html yet.
import { describe, expect, test } from "vitest";
import { renderToStream, Errored, Loading } from "@solidjs/web";
import { createMemo, NotReadyError } from "solid-js";

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// A read that throws NotReadyError(promise) until the promise settles — what
// every async source looks like to the server renderer.
function asyncRead<T>(ms: number, value: T): () => T {
  let settled = false;
  const promise = wait(ms).then(() => {
    settled = true;
  });
  return () => {
    if (!settled) throw new NotReadyError(promise as any);
    return value;
  };
}

function renderComplete(code: () => any): Promise<string> {
  return new Promise(resolve => {
    renderToStream(code).then(resolve);
  });
}

function pipeComplete(code: () => any): Promise<string> {
  return new Promise(resolve => {
    let html = "";
    renderToStream(code).pipe({
      write(chunk: string) {
        html += chunk;
      },
      end() {
        resolve(html);
      }
    });
  });
}

describe("a boundary resolving inside an unresolved root hole", () => {
  test("does not finalize the render before the root hole lands", async () => {
    const html = await renderComplete(() => {
      const fast = asyncRead(5, "FAST-CONTENT");
      const slow = asyncRead(40, "SLOW-CONTENT");
      return (
        <Errored fallback="ERRORED">
          <main>
            <Loading fallback="FALLBACK">
              <section>{fast()}</section>
            </Loading>
            <aside>{slow()}</aside>
          </main>
        </Errored>
      );
    });
    expect(html).toMatch(/<aside[^>]*>SLOW-CONTENT<\/aside>/);
    expect(html).not.toContain("ERRORED");
  });

  test("a memo parked on an async read in the root hole still resolves", async () => {
    // The memo's retry is subscribed to the pending promise. Finalizing early
    // disposed its owner first: the memo re-threw its cached NotReadyError
    // forever and the flush loop spun on microtasks, so on regression this
    // test hangs instead of failing.
    const Slow = () => {
      const read = asyncRead(40, "SLOW-CONTENT");
      const value = createMemo(() => read());
      return <aside>{value()}</aside>;
    };
    const html = await renderComplete(() => {
      const fast = asyncRead(5, "FAST-CONTENT");
      return (
        <Errored fallback="ERRORED">
          <main>
            <Loading fallback="FALLBACK">
              <section>{fast()}</section>
            </Loading>
            <Slow />
          </main>
        </Errored>
      );
    });
    expect(html).toMatch(/<aside[^>]*>SLOW-CONTENT<\/aside>/);
    expect(html).not.toContain("ERRORED");
    // The render is over: a macrotask gets to run again.
    await wait(10);
  });

  test.each([
    ["awaited", renderComplete],
    ["piped", pipeComplete]
  ])("ships the boundary's content, not its fallback (%s)", async (_, render) => {
    // The boundary's placeholder is inside the root hole when it resolves, so
    // the splice into the shell html misses; the content must be held and
    // spliced once the hole lands, or the document keeps the fallback and the
    // client finds an empty `pl-` template and rebuilds the subtree.
    const html = await render(() => {
      const fast = asyncRead(5, "FAST-CONTENT");
      const slow = asyncRead(40, "SLOW-CONTENT");
      return (
        <Errored fallback="ERRORED">
          <main>
            <Loading fallback="FALLBACK">
              <section>{fast()}</section>
            </Loading>
            <aside>{slow()}</aside>
          </main>
        </Errored>
      );
    });
    expect(html).toMatch(/<section[^>]*>FAST-CONTENT<\/section>/);
    expect(html).toMatch(/<aside[^>]*>SLOW-CONTENT<\/aside>/);
    expect(html).not.toContain('<template id="pl-');
    expect(html).not.toContain("FALLBACK");
  });
});
