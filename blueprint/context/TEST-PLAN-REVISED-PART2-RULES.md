# Revised test plan (14 Oct) — the rules and steps Batch 3 part 2 builds against (VERBATIM)

Source: `CHUVI_V1_Test_Plan_Back_End.pdf`, revised 14 Oct (re-sent by the user 16 Oct). The older
`plan.txt` extraction in a scratchpad was the ORIGINAL plan — do not use it. Client's 15 Oct list items 12, 14,
15, 16 ("Everything by Saturday") and the four switches (one per part, all off) apply.

## Rules
- **R2.** At receipt S2 checks every piece against the list and taps All received. A piece that is missing,
  untagged or wrongly tagged is held on its own with a reason and goes to S1's Holds; the rest are received. S2
  can correct S1's colour and stain tags. A second rejection of the same piece goes to admin.
- **R3.** Pieces move one by one between stations. QC receives an order only when every piece is there.
- **R4.** Routes by service: Wash and Iron goes S2, S3, S4, QC. Wash Only goes S2, S3, QC. Iron Only goes S2,
  S4, QC. Each piece follows its own route, and each queue shows only pieces routed to it.
- **R5.** A rejection is per piece and goes to the Holds of the station that sent it. The sender fixes it with a
  note and sends it again. A second rejection of the same piece goes to admin. Holds are raised only at receipt
  or at the workbench, never from a queue, and always with a reason.
- **R6.** Damage holds the piece. "Report problem: Damaged" at S2, S3 or S4 holds that piece and opens a damage
  case for the customer experience officer, with admin copied; the rest move on. The officer talks to the
  customer and marks "Customer informed". Only then can admin release the piece. If the hold will be long, the
  officer can approve partial delivery of the ready pieces; the second trip is free when the hold was our fault.
  Other problems found at the workbench also hold the piece, with a reason.
- **R7.** S2 can correct S1's colour and stain tags, and add inspection marks: stain, stain type, damage,
  fabric. After launch, keep both versions.
- **R8.** Iron Only pieces that look dirty: at S2 each piece has its own "Looks dirty, suggest washing" option.
  The suggestion appears for S1. S1 calls the customer, and the customer experience officer sends a photo if the
  customer wants to see it. If the customer agrees, S1 changes that piece to Wash and Iron and a payment link
  goes for the full difference. Paying is the approval. If the link is not paid within the time limit (setting,
  3 hours), the link is cancelled, the piece is pressed as booked, a note is saved and the customer is
  messaged. The other pieces carry on.
- **R17 (part).** The cover never applies to Quick Booking or to a service change the customer accepts.
- **R24 (part).** Iron Only answer time (3 hours) is a setting (test value 10 minutes).

## T3 · Obinna's missing piece and damaged piece (Wash Only)
- T3.07 S1 tags and sends; S2 accepts. → Route S2, S3, QC. S4 never sees T3. (R4)
- T3.08 S3 reports TAG 02 Damaged: "machine tore the hem". → TAG 02 held. Damage case for the officer, admin
  copied. The other 3 pieces go on to QC. (R6)
- T3.09 QC receives and packs. → QC waits: T3 is not complete while TAG 02 is held. (R6, R3)
- T3.10 Chioma calls Obinna and marks "Customer informed". → Admin can now release TAG 02 (Release is refused
  before this). It reaches QC, QC packs all 4, T3 becomes Ready. Ready SMS. Alternative: if the fix will take
  long, Chioma approves partial delivery of the 3 good pieces, and the later trip for TAG 02 is free. (R6)
- T3.11 Chioma closes the case: wallet refund N500, with a reason. → Saved with who, what and why. (R20)

## T4 · Emeka's Iron Only order with a dirty shirt
- T4.02 S1 counts 4 and tags 4; S2 accepts. → Route S2, S4, QC for every piece. (R4)
- T4.03 S2 marks TAG 03 "Looks dirty, suggest washing" and sends TAG 01, 02, 04 to ironing. → TAG 03 stays at
  S2. A suggestion is created for S1. The other 3 move on. (R8)
- T4.04 Emeka agrees on the phone; S1 changes TAG 03 to Wash and Iron. → Full difference charged (no recount
  cover). Payment link SMS. (R8, R17)
- T4.05 Emeka pays. → TAG 03's route becomes S2, S3, S4, QC. S2 sends it to washing. (R4, R8)
- T4.06 S4 presses TAG 01, 02, 04 and tries to send to QC. → Blocked, returning which piece is missing and
  where: TAG 03, at Wash and Dry. (R3)
- T4.07 TAG 03 is washed, pressed and sent. → QC receives T4 complete with 4 shirts. (R3)
- T4.08 Second run: S2 flags one shirt; S1 changes it; nobody pays for 10 minutes. → Link cancelled. Shirt
  pressed as booked. Note "customer did not pay for washing" saved. Message to the customer. (R8)

## T8 · Kene pays by transfer, and the tags are wrong
- T8.02 S1 tags TAG 02 White on purpose (dark shirt), leaves TAG 03 untagged, and sends. → Sent. (R2)
- T8.03 S2 changes TAG 02 to Dark. → Allowed. Saved with S2's name. (R7) [built in 3a]
- T8.04 S2 marks TAG 03 "Something is missing": no tag. → Only TAG 03 is held and goes to S1's Holds. TAG 01
  and TAG 02 are received. (R2)
- T8.05 S1 tags TAG 03, adds a note, sends it again. → TAG 03 arrives in S2's receiving. (R5)
- T8.06 S2 rejects TAG 03 again. → Second rejection goes to admin. (R2) [built in 3a]
- T8.07 Admin resolves; S2 receives TAG 03. → Saved with names and times. (R14)

## Client (15 Oct): switches
One switch per part (S2 holding one piece at receipt; routes by service; Iron Only per piece upgrade; damage
case with "Customer informed"), all off; say what happens to an order mid-floor when a switch goes on or off —
no order may get stuck or lose a piece. Ready by Saturday 12 noon; Sunday floor test with switches on.
