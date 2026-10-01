import {
  NOT_STATIC,
  bindingSite,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  createStore,
  flush,
  getNextChildId,
  getOwner,
  onCleanup,
  probeAbort,
  probeStatic,
  setSite,
  siteFlags,
  takeAdoptable,
  untrack
} from "../src/index.js";

// `probeStatic` decides that a render effect's first pass can never re-run,
// so the renderer can apply its value with no node. That is only sound if
// every way a pass can depend on the graph is refused; these pin the verdicts.

afterEach(() => flush());

type ProbeOwner = { _firstChild: unknown; _disposal: unknown; _childCount: number };

function inRoot<T>(fn: (owner: ProbeOwner) => T): T {
  let out!: T;
  createRoot(
    dispose => {
      out = fn(getOwner() as unknown as ProbeOwner);
      dispose();
    },
    { id: "t" }
  );
  return out;
}

describe("probeStatic verdicts", () => {
  it("refuses a pass that touches the graph, and leaves nothing behind", () => {
    const [signal, setSignal] = createSignal(1);
    const [store] = createStore({ n: 1 });
    const result = inRoot(owner => {
      const memo = createMemo(() => signal() + 1);
      const firstChild = owner._firstChild;
      const cases = {
        plain: probeStatic(() => "text", true),
        untracked: probeStatic(() => untrack(signal), true),
        signal: probeStatic(() => signal(), true),
        store: probeStatic(() => store.n, true),
        memo: probeStatic(() => memo(), true),
        child: probeStatic(() => createMemo(() => 1)(), true),
        cleanup: probeStatic(() => onCleanup(() => {}), true),
        write: probeStatic(() => setSignal(2), true),
        aborted: probeStatic(() => (probeAbort() ? "bailed" : "ran"), true),
        promise: probeStatic(() => Promise.resolve(1), true)
      };
      takeAdoptable();
      return {
        cases,
        childAdded: owner._firstChild !== firstChild,
        disposal: owner._disposal
      };
    });
    expect(result).toEqual({
      cases: {
        plain: "text",
        untracked: 1,
        signal: NOT_STATIC,
        store: NOT_STATIC,
        memo: NOT_STATIC,
        child: NOT_STATIC,
        cleanup: NOT_STATIC,
        write: NOT_STATIC,
        aborted: NOT_STATIC,
        promise: NOT_STATIC
      },
      childAdded: false,
      disposal: null
    });
    expect(signal()).toBe(1);
  });

  it("probes nothing outside an owner, or outside the probe", () => {
    expect([probeStatic(() => "x", true), probeAbort()]).toEqual([NOT_STATIC, false]);
  });

  it("an id-carrying static pass consumes exactly the id its render effect would", () => {
    const nextId = (make: () => void) =>
      inRoot(() => {
        make();
        return getNextChildId(getOwner()!);
      });
    const refused = inRoot(() => [
      probeStatic(
        () => "x",
        false,
        () => false
      ),
      getNextChildId(getOwner()!)
    ]);
    expect({
      probed: nextId(() => probeStatic(() => "x", false)),
      effect: nextId(() =>
        createRenderEffect(
          () => "x",
          () => {}
        )
      ),
      refused
    }).toEqual({ probed: "t1", effect: "t1", refused: [NOT_STATIC, "t0"] });
  });
});

describe("adoption", () => {
  it("the effect created next adopts the probe's reads: one pass, then one per change", () => {
    const [label, setLabel] = createSignal("a");
    let passes = 0;
    const seen: string[] = [];
    const pass = () => {
      passes++;
      return label();
    };
    let dispose!: () => void;
    createRoot(d => {
      dispose = d;
      expect(probeStatic(pass, true)).toBe(NOT_STATIC);
      createRenderEffect(pass, v => {
        seen.push(v);
      });
    });
    expect([passes, seen]).toEqual([1, ["a"]]);
    setLabel("b");
    flush();
    expect([passes, seen]).toEqual([2, ["a", "b"]]);
    dispose();
  });

  it("a read whose value moved since the probe re-runs the pass", () => {
    const [label, setLabel] = createSignal("a", { ownedWrite: true });
    let passes = 0;
    const seen: string[] = [];
    const pass = () => {
      passes++;
      return label();
    };
    let dispose!: () => void;
    createRoot(d => {
      dispose = d;
      probeStatic(pass, true);
      setLabel("b");
      createRenderEffect(pass, v => {
        seen.push(v);
      });
    });
    flush();
    expect(seen[0]).toBe("b");
    expect(passes).toBe(2);
    dispose();
  });
});

describe("binding sites", () => {
  it("are (component, index), counted in the body only, remembered across instances", () => {
    const Comp = {};
    const seen: unknown[] = [];
    const body = () => {
      setSite(Comp, 0);
      const sites = [bindingSite(), bindingSite()];
      createRenderEffect(
        () => seen.push(bindingSite()),
        () => {}
      );
      if (siteFlags()[sites[1]]) seen.push("remembered");
      siteFlags()[sites[1]] = true;
      seen.push(...sites);
      setSite(null, 0);
    };
    createRoot(dispose => {
      body();
      body();
      dispose();
    });
    expect([bindingSite(), seen]).toEqual([-1, [-1, 0, 1, -1, "remembered", 0, 1]]);
  });
});
