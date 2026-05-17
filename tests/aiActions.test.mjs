import test from "node:test";
import assert from "node:assert/strict";

import {
  isPendingActionApproval,
  isPendingActionCancellation,
  getRecoverablePendingActions,
} from "../src/lib/aiActionIntent.js";

test("isPendingActionApproval: recognizes common confirmations", () => {
  assert.equal(isPendingActionApproval("approve"), true);
  assert.equal(isPendingActionApproval("OK"), true);
  assert.equal(isPendingActionApproval("go ahead"), true);
  assert.equal(isPendingActionApproval("maybe later"), false);
});

test("isPendingActionCancellation: recognizes common cancellations", () => {
  assert.equal(isPendingActionCancellation("cancel"), true);
  assert.equal(isPendingActionCancellation("nope"), true);
  assert.equal(isPendingActionCancellation("do not"), true);
  assert.equal(isPendingActionCancellation("sure"), false);
});

test("getRecoverablePendingActions: returns pendingActions when present and not applied", () => {
  const messages = [
    { content: "hello" },
    {
      content: "Pending StudyBridge actions",
      pendingActions: [{ type: "create_note", title: "Test note" }],
    },
  ];

  const recovered = getRecoverablePendingActions(messages);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].type, "create_note");
  assert.equal(recovered[0].title, "Test note");
});

test("getRecoverablePendingActions: returns [] after applied marker", () => {
  const messages = [
    {
      content: "Pending StudyBridge actions",
      pendingActions: [{ type: "create_note", title: "Test note" }],
    },
    { content: "StudyBridge actions applied" },
  ];

  const recovered = getRecoverablePendingActions(messages);
  assert.equal(recovered.length, 0);
});
