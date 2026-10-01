---
"@solidjs/web": patch
---

`reconcileArrays` keeps an inserted run in order when its anchor is the run's own first node. After hydration a slot can hold only a prefix of the nodes rendered in it; reconciling to the full list then re-inserted nodes already in place before themselves, the DOM order stopped matching the slot, and the next update threw `NotFoundError` from `insertBefore` (since rc.10 the page just goes blank).
