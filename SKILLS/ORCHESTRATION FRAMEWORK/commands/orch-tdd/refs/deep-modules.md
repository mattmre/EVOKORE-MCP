> Adapted from mattpocock/skills @ 90ea8eec / tdd/deep-modules.md (MIT, (c) 2026 Matt Pocock).

# Deep Modules

From "A Philosophy of Software Design":

**Deep module** = small interface + lots of implementation

```
+---------------------+
|   Small Interface   |  <- Few methods, simple params
+---------------------+
|                     |
|                     |
|  Deep Implementation|  <- Complex logic hidden
|                     |
|                     |
+---------------------+
```

**Shallow module** = large interface + little implementation (avoid)

```
+---------------------------------+
|       Large Interface           |  <- Many methods, complex params
+---------------------------------+
|  Thin Implementation            |  <- Just passes through
+---------------------------------+
```

When designing interfaces, ask:

- Can I reduce the number of methods?
- Can I simplify the parameters?
- Can I hide more complexity inside?

## Why this matters for vertical slices

A vertical slice exposes *one* observable behavior to the test. If the
underlying module is **shallow**, the test ends up wired through every
intermediate layer (controller -> service -> repo -> mapper) and starts
asserting on layer boundaries instead of behavior. Deep modules let a
single tracer-bullet test stay anchored to the public interface even
when the implementation rearranges itself during refactor.
