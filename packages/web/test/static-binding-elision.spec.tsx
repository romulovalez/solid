/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { describe, expect, test } from "vitest";
import { createRoot, createSignal, createStore, flush, getOwner, Show, For } from "solid-js";
import { render, type JSX } from "@solidjs/web";

// A compiled binding whose first pass reads nothing reactive and creates
// nothing gets no render effect (`probeStatic` in @solidjs/signals). Reactive
// bindings must keep theirs, update as before, and run their pass once.

type DevOwner = { _firstChild: DevOwner | null; _nextSibling: DevOwner | null };

function childCount(owner: unknown): number {
  let n = 0;
  for (let c = (owner as DevOwner)._firstChild; c; c = c._nextSibling) n++;
  return n;
}

function mount(code: () => JSX.Element) {
  const container = document.createElement("div");
  const dispose = render(code, container);
  return { container, dispose };
}

describe("static-binding elision", () => {
  test("static bindings get no node; reactive ones still update", () => {
    const [label, setLabel] = createSignal("a");
    const [state, setState] = createStore({ on: false });
    const row = { title: "Row 1", id: 7 };
    let owner: unknown;
    const Row = (props: { children?: JSX.Element }) => {
      owner = getOwner();
      return (
        <p data-id={row.id} class={state.on ? "on" : "off"}>
          <span>{row.title}</span>
          <b>{label()}</b>
          {props.children}
        </p>
      );
    };
    const { container, dispose } = mount(() => <Row>tail</Row>);
    // The class binding and the <b> text read state; data-id, the <span>
    // text and the static children do not.
    expect(childCount(owner)).toBe(2);
    setLabel("b");
    setState(s => {
      s.on = true;
    });
    flush();
    expect(container.innerHTML).toBe(
      '<p data-id="7" class="on"><span>Row 1</span><b>b</b>tail</p>'
    );
    dispose();
  });

  test("a reactive binding adopts its probe: the pass runs once, then once per change", () => {
    const [label, setLabel] = createSignal("a");
    let passes = 0;
    const pass = () => {
      passes++;
      return label();
    };
    const { container, dispose } = mount(() => <b>{pass()}</b>);
    expect(passes).toBe(1);
    setLabel("b");
    flush();
    expect([passes, container.innerHTML]).toEqual([2, "<b>b</b>"]);
    dispose();
  });

  test("a binding holding a component, a Show or a For keeps working", () => {
    const [items, setItems] = createSignal(["x", "y"]);
    const [shown, setShown] = createSignal(false);
    let bodies = 0;
    const Leaf = (props: { v: string }) => {
      bodies++;
      return <i>{props.v}</i>;
    };
    const { container, dispose } = mount(() => (
      <div>
        <For each={items()}>{item => <Leaf v={item} />}</For>
        <Show when={shown()}>
          <u>on</u>
        </Show>
      </div>
    ));
    const html = () => container.innerHTML.replace(/<!---->/g, "");
    expect([bodies, html()]).toEqual([2, "<div><i>x</i><i>y</i></div>"]);
    setItems(["x", "y", "z"]);
    setShown(true);
    flush();
    expect([bodies, html()]).toEqual([3, "<div><i>x</i><i>y</i><i>z</i><u>on</u></div>"]);
    dispose();
  });

  test("a site that was reactive once is not probed again for the next instance", () => {
    const [n] = createSignal(1);
    let probes = 0;
    const read = () => {
      probes++;
      return n();
    };
    const Cell = () => <td>{read()}</td>;
    const { dispose } = mount(() => (
      <tr>
        <Cell />
        <Cell />
        <Cell />
      </tr>
    ));
    // First instance: probe (adopted by its effect, one pass). Later ones:
    // effect only. Without site learning every instance would probe too.
    expect(probes).toBe(3);
    dispose();
  });
});
