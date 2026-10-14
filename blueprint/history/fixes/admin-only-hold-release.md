# Fix: Admin-only hold release

**Type:** Fix
**Status:** verified
**Branch:** `fix/admin-only-hold-release`

Found while checking the client's V1 test plan (14 Oct 2026), step T3.04 and rule R15:
"Only the roles allowed for a hold type can release it; admin can release all. Anyone
else gets 'Only admin can release this' instead of an error."

## The problem

The "Count differs from rider count" hold (`count_differs_from_rider`) was seeded with
`requiresAdminApproval: true` on 8 Oct, but no release path read that flag. S1 could
release the hold through `PATCH /intake-user/hold/{id}/release`, which waved through
the exact count disagreement the client said only an admin may settle. The same
endpoint also let S1 "release" an unpaid payment hold. Tagging stayed blocked by the
payment gate, so no money was at risk, but the unpaid order dropped out of Payment holds.

## The fix

- `util/releaseItemHold.js` `adminOnlyRefusal()`: one check for every release path. If
  the caller is not an admin and any hold being cleared (the order-level
  `orderHold.holdTypeKey`, or a piece's `holdDetails.reason`) has a type with
  `requiresAdminApproval`, it returns `{ error: 'Only admin can release this.',
  requiresAdmin: true }`.
- Called from Intake's `releaseFromHold` and from S2, S3, S4 and QC `releaseFromHold`.
- Intake also refuses a payment hold for non-admins (`requiresPayment: true`). A
  payment hold clears when the customer pays, when Intake records a POS or transfer
  payment, or when an admin waives it.
- Admin release paths are unchanged.
- Swagger: a 400 response is documented on all five release endpoints. The Intake
  summary now says "tagging queue" (it wrongly said "wash queue").

## Verify

- `holdReleaseStaging.js` (new, testingdb): 15 passed. Against the old code the same
  script fails 9 checks: S1 released both holds, and QC released an admin-only piece.
- Regression: briefCheck 565/0, stationFlowStaging 97/0, counterPaymentStaging 51/0,
  quickBookingStaging 67/0; boot on PORT=7999 showed 0 errors; Swagger envelope check 0.
