---
name: tdd
description: "Use when implementing a feature using test-driven development — write failing tests first, then implement to make them pass."
aliases: [test-driven, red-green-refactor]
category: quality
tags: [tdd, testing, red-green, vitest, test-first]
archetype: AGT-017
version: 1.0.0
---

# /tdd — Test-Driven Development

Enforces the Red-Green-Refactor TDD cycle: write failing tests first, implement to pass, then refactor.

## Usage

```
/tdd "implement TrustLedger.record() method"
```

## The TDD Cycle

### Red (Write failing test)
Write a test that describes the desired behavior. Run it — it must fail:
```
npx vitest run --reporter=verbose tests/integration/TrustLedger.test.ts
```

### Green (Make it pass)
Write the minimum implementation to make the test pass. No more.

### Refactor (Clean up)
Clean up both the implementation and the test without changing behavior. Re-run tests — still green.

## Done Criteria

- [ ] Tests written BEFORE implementation code
- [ ] All tests pass: `npx vitest run`
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] No implementation code without a corresponding test

## Integration

- Pairs with `/verify-quality` to compute truth score
- AGT-017 (Quality Engineer) tracks test-to-code ratio
- eval-harness PAT-002 measures test-before-commit compliance
