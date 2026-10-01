---
"@solidjs/web": patch
---

A `<Loading>` boundary that resolves before the shell flushes, while its placeholder is still inside an unresolved root hole, now ships its content. The splice into the shell missed silently there (an error boundary flattens its subtree into one root hole while anything in it is pending), so the document kept the fallback and an empty `pl-` template, and the client judged the fragment superseded and rebuilt the subtree. The content is now held and spliced once the hole lands.
