import { createMemo, createRenderEffect, getOwner, onCleanup } from "solid-js";
import {
  NOT_STATIC,
  bindingSite,
  probeAbort,
  probeStatic,
  sharedConfig,
  siteFlags
} from "solid-js/internal";

// Replaced with a boolean literal by the build (see rollup.config.js); the cast
// keeps the typed module honest about it being a build-time flag.
const IS_DEV = "_SOLID_DEV_" as unknown as boolean;
const IS_OBSERVE = "_SOLID_OBSERVE_" as unknown as boolean;

const transparentOptions = { transparent: true, sync: true };

// Observe/dev: the element tag a `spread` is being applied for, while its
// body runs (`spread` sets it, see client.ts). The effects and inserts the
// body creates take their labels from it — `<tag>.spread` for the attribute
// effect, `<tag>.children` for the children insert — instead of `spread`
// passing an options argument to each of its call sites, which would leave a
// trailing `undefined` argument in the production artifact. Synchronous:
// `spread` creates its nodes before it returns and restores the outer value.
export let spreadName: string | undefined;
export function setSpreadName(name: string | undefined): void {
  spreadName = name;
}
const syncOptions = { sync: true };

// Dev: the binding effect whose callback is currently writing the DOM. The
// DOM helpers (setAttribute, insertExpression, …) tag it with the element they
// touch, so a diagnostic about that effect can print a live element reference
// beside its message — hover highlights it, click jumps to Elements.
let bindingEffect: { _devElement?: Node } | null = null;

/** Dev: remember the element the running binding effect writes (first one wins). */
export function tagElement(node: Node): void {
  if (IS_DEV && bindingEffect !== null && bindingEffect._devElement === undefined)
    bindingEffect._devElement = node;
}

// `scope: true` (set by insert for compiler-tagged hole accessors) makes the
// render effect non-transparent so the hole gets its own id scope, mirroring
// the server's ssrScope owner. `name` is the binding's target as the
// compiler wrote it under `sourceNames.bindings` (`span.textContent`,
// `div.class:active`); the dev and observe runtimes label the effect node
// with it, production ignores it.
//
// Static-binding elision: a binding whose first pass reads nothing reactive
// and creates nothing can never re-run, so it gets no render effect — the
// probe's value is applied directly (`probeStatic` in @solidjs/signals). A
// scoped binding still consumes its child id, and is refused while hydration
// holds a serialized value for that id. A binding site (component, index)
// that was ever not static is not probed again.
const claimableId = (id: string) =>
  !sharedConfig.hydrating || !sharedConfig.has || !sharedConfig.has(id);

export function effect<T>(
  fn: (prev?: T) => T,
  effectFn: (value: T, prev?: T) => void | (() => void),
  options?: { scope?: boolean; name?: string; schedule?: boolean; defer?: boolean }
): void {
  // A binding nested in an enclosing probe makes that probe not static; bail
  // before running anything of our own under it.
  if (probeAbort()) return;
  const site = bindingSite();
  const flags = site < 0 ? null : siteFlags();
  if (
    (options === undefined || !(options.schedule || options.defer)) &&
    (flags === null || flags[site] !== true)
  ) {
    const scoped = options !== undefined && !!options.scope;
    const value = probeStatic(fn, !scoped, scoped ? claimableId : undefined);
    if (value !== NOT_STATIC) {
      const cleanup = effectFn(value as T, undefined);
      if (typeof cleanup === "function") onCleanup(cleanup);
      return;
    }
    if (flags !== null) flags[site] = true;
  }
  renderEffect(fn, effectFn, options);
}

/**
 * A render effect with no static probe: for the runtime's own effects whose
 * compute has side effects (head registrations, asset warming), as opposed
 * to compiled bindings.
 */
export function renderEffect<T>(
  fn: (prev?: T) => T,
  effectFn: (value: T, prev?: T) => void | (() => void),
  options?: { scope?: boolean; name?: string; schedule?: boolean; defer?: boolean }
): void {
  if (
    IS_OBSERVE &&
    spreadName !== undefined &&
    (options === undefined || options.name === undefined)
  )
    options = { ...options, name: spreadName + ".spread" };
  const nodeOptions = options
    ? { sync: true, ...options, transparent: !options.scope }
    : transparentOptions;
  if (IS_DEV) {
    // The compute half runs as the effect node's owner; capture it there and
    // surround the imperative half with it for tagElement.
    let node: { _devElement?: Node } | null = null;
    createRenderEffect(
      (prev?: T) => {
        node = getOwner() as typeof node;
        return fn(prev);
      },
      (value: T, prev?: T) => {
        const outer = bindingEffect;
        bindingEffect = node;
        try {
          // The callback's return (a cleanup) must pass through untouched.
          return effectFn(value, prev);
        } finally {
          bindingEffect = outer;
        }
      },
      nodeOptions
    );
    return;
  }
  createRenderEffect(fn, effectFn, nodeOptions);
}

// NOT transparent, despite the temptation (#3033): the compiler emits
// `_$memo` in two roles, and one is id-load-bearing. Besides pure condition
// memos (`() => !!cond`), the ssr generate wraps whole hole bodies in
// `_$memo` — the compute CREATES the branch's templates (`ssrHydrationKey()`
// mints inside it), so the memo's id slot is the retry-stable scope a
// deferred hole re-runs under. Making it transparent leaks the branch keys
// onto the parent's live counter and breaks async-hole parity (pinned by the
// async-cond-before-for harness scenario).
export function memo<T>(fn: () => T): () => T {
  if (probeAbort()) return () => undefined as T;
  return createMemo(() => fn(), syncOptions);
}
