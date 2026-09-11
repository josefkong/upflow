import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiResponseError,
  buildSessionLoginPath,
  recoverExpiredSession,
} from "../../src/lib/client-auth-recovery";

test("session recovery preserves the current relative destination", () => {
  assert.equal(
    buildSessionLoginPath("/inbox", "?filter=unread&view=compact"),
    "/login?next=%2Finbox%3Ffilter%3Dunread%26view%3Dcompact",
  );
});

test("only an API 401 is treated as an expired session", () => {
  assert.equal(recoverExpiredSession(new ApiResponseError("Unauthorized", 401)), true);
  assert.equal(recoverExpiredSession(new ApiResponseError("Unavailable", 503)), false);
  assert.equal(recoverExpiredSession(new Error("Unauthorized")), false);
});
