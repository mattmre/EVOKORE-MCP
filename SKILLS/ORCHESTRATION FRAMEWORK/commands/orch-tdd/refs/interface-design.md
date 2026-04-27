> Adapted from mattpocock/skills @ 90ea8eec / tdd/interface-design.md (MIT, (c) 2026 Matt Pocock).

# Interface Design for Testability

Good interfaces make testing natural:

1. **Accept dependencies, don't create them**

   ```typescript
   // Testable
   function processOrder(order, paymentGateway) {}

   // Hard to test
   function processOrder(order) {
     const gateway = new StripeGateway();
   }
   ```

2. **Return results, don't produce side effects**

   ```typescript
   // Testable
   function calculateDiscount(cart): Discount {}

   // Hard to test
   function applyDiscount(cart): void {
     cart.total -= discount;
   }
   ```

3. **Small surface area**
   - Fewer methods = fewer tests needed
   - Fewer params = simpler test setup

## Why this matters for the slice-shape gate

The slice-shape panel rejects slices framed as "DB layer", "API layer",
or "UI layer". Interfaces that follow the rules above naturally express
themselves as a single end-to-end assertion (input -> observable
output) — no layer name needed. If you find yourself unable to phrase a
slice without saying "the controller method", that is a signal that the
interface needs to be deepened (see deep-modules.md) before a tracer
bullet test is meaningful.
