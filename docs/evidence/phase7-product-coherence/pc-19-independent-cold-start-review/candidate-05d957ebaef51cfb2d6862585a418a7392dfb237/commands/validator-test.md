# Whole-file PC-19 validator test

Candidate: `05d957ebaef51cfb2d6862585a418a7392dfb237`.

Executed as one complete target file:

```text
npm run test:targeted -- tests/scripts/pc-19-independent-cold-start-review.test.mjs
PASS p7-scripts tests/scripts/pc-19-independent-cold-start-review.test.mjs
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

The candidate-bound immutable review validator was then invoked with the
verifier-owned receipt and returned:

```text
PC19_INDEPENDENT_REVIEW_PASS candidate=05d957ebaef51cfb2d6862585a418a7392dfb237 coverage=16
```
