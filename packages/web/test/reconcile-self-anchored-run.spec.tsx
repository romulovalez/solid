/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from "vitest";
import { createRoot, createSignal, flush } from "solid-js";
import { insert } from "@solidjs/web";
import reconcileArrays from "../src/reconcile.js";

// After hydration a slot can hold only part of what the server rendered in it
// (a sibling resolved later), so its first value is a prefix of the nodes
// already in place. Reconciling to the full list then "appends" nodes that are
// already there, and the anchor picked for the run (`prefix.nextSibling`) is
// the run's own first node: insertBefore(menu, menu) is a no-op and
// insertBefore(page, menu) moves the page above the menu.
function element(tag: string, id: string) {
  const el = document.createElement(tag);
  el.id = id;
  return el;
}

function setup() {
  const parent = document.createElement("div");
  const style = element("style", "accent");
  const menu = element("nav", "menu");
  const page = element("section", "page");
  const end = document.createComment("/");
  parent.append(style, menu, page, end);
  return { parent, style, menu, page, end };
}

describe("reconcileArrays with the anchor inside the inserted run", () => {
  test("a run already in place stays in place", () => {
    const { parent, style, menu, page, end } = setup();
    reconcileArrays(parent, [style], [style, menu, page], end);
    expect([...parent.childNodes]).toEqual([style, menu, page, end]);
  });

  test("insert() keeps the slot's order, and the next update does not throw", () => {
    const { parent, style, menu, page, end } = setup();
    const next = element("main", "next");
    const [nodes, setNodes] = createSignal<Node[]>([style, menu, page]);
    const dispose = createRoot(d => {
      insert(parent, nodes, end, [style]);
      return d;
    });
    flush();
    expect([...parent.childNodes]).toEqual([style, menu, page, end]);

    // A navigation: the page is replaced. With the run inserted out of order
    // the slot's `a` no longer matched the DOM and this insertBefore'd
    // against a node it had just removed (NotFoundError).
    setNodes([style, menu, next]);
    flush();
    expect([...parent.childNodes]).toEqual([style, menu, next, end]);
    dispose();
  });
});
