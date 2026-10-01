---
"@solidjs/web": patch
---

A hydrating `insert` with a single reactive hole claims its parent's children only when its first value needs them (an array, an empty value, a function); a text or node value adopts the server node without the claim's allocation.
