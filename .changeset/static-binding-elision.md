---
"@solidjs/signals": patch
"solid-js": patch
"@solidjs/web": patch
---

RFC: a compiled binding whose first pass reads nothing reactive and creates nothing gets no render effect. `probeStatic` runs the pass under a throwaway observer; a static binding applies its value with no node (a scoped one still consumes its child id), and a reactive one's effect adopts the probe's reads instead of running the pass again.
