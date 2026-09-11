import assert from "node:assert/strict";
import test from "node:test";
import {
  countPendingInboxNotifications,
  formatInboxPendingBadge,
} from "../../src/lib/inbox-pending-count";

test("Inbox pending count matches the action-needed notification categories", () => {
  assert.equal(
    countPendingInboxNotifications([
      { type: "assigned" },
      { type: "mentioned" },
      { type: "due_soon" },
      { type: "commented" },
      { type: "status_changed" },
    ]),
    3,
  );
});

test("Inbox badge stays compact for large pending counts", () => {
  assert.equal(formatInboxPendingBadge(7), "7");
  assert.equal(formatInboxPendingBadge(125), "99+");
});
