/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 *
 * A sole reactive hole claims its parent's children only when its first
 * value needs them. A text value adopts the server's text node without the
 * claim (no read of `childNodes`); the hole must still update in place and
 * toggle to an element and back cleanly.
 *
 * Server markup (ssr generate of the same component): <span _hk=0>a</span>
 */
import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { createSignal, flush, enableHydration } from "solid-js";
import { hydrate } from "@solidjs/web";

enableHydration();

function countChildNodesReads(el: Element) {
  const proto = Object.getOwnPropertyDescriptor(Node.prototype, "childNodes")!;
  let reads = 0;
  Object.defineProperty(el, "childNodes", {
    configurable: true,
    get() {
      reads++;
      return proto.get!.call(this);
    }
  });
  return () => reads;
}

describe("lazy claim of a sole hole", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    (globalThis as any)._$HY = { events: [], completed: new WeakSet(), r: {} };
    container.innerHTML = "";
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  test("a text value adopts the server text without claiming, then updates and toggles", async () => {
    container.innerHTML = "<span _hk=0>a</span>";
    const span = container.querySelector("span")!;
    const serverText = span.firstChild!;
    const reads = countChildNodesReads(span);

    let setValue!: (v: string | null) => void;
    dispose = hydrate(() => {
      const [value, _setValue] = createSignal<string | null>("a");
      setValue = _setValue;
      return <span>{value() ?? <i>none</i>}</span>;
    }, container);
    await new Promise(r => setTimeout(r, 0));

    expect([
      reads(),
      container.querySelector("span") === span,
      span.firstChild === serverText
    ]).toEqual([0, true, true]);

    setValue("b");
    flush();
    expect([span.innerHTML, span.firstChild === serverText]).toEqual(["b", true]);

    setValue(null);
    flush();
    expect(span.innerHTML).toBe("<i>none</i>");

    setValue("c");
    flush();
    expect([span.innerHTML, span.childNodes.length]).toEqual(["c", 1]);
  });
});
