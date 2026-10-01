---
"@solidjs/web": patch
---

`renderToStream` no longer finalizes a render while the shell still has unresolved root holes. A `<Loading>` boundary (or a released hold) resolving inside a pending root hole called `flushEnd()`, which drained the serializer and disposed the root; a memo whose retry was parked on a pending promise then re-threw its cached `NotReadyError` forever and the flush loop spun at 100% CPU, never yielding the event loop. The awaited form resolved with an empty document.
