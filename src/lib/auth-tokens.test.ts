import test from "node:test";
import assert from "node:assert/strict";

import {
  generateAuthToken,
  hashAuthToken,
  invitationEmailMatches,
  isAuthTokenUsable,
  isWellFormedAuthToken,
} from "./auth-tokens.ts";
import { membershipVisibleToScope, scopeCanBeAdmin } from "./session-scope.ts";

const future = new Date(Date.now() + 60_000).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();

void test("token undangan/reset: 32 byte, base64url, unik", () => {
  const a = generateAuthToken();
  const b = generateAuthToken();
  assert.equal(a.length, 43);
  assert.ok(isWellFormedAuthToken(a));
  assert.notEqual(a, b);
  assert.notEqual(hashAuthToken(a), a);
});

void test("token tidak sah setelah dipakai/diterima/direvoke/kedaluwarsa", () => {
  assert.equal(isAuthTokenUsable({ expires_at: future }), true);
  assert.equal(isAuthTokenUsable({ expires_at: future, used_at: future }), false);
  assert.equal(isAuthTokenUsable({ expires_at: future, accepted_at: future }), false);
  assert.equal(isAuthTokenUsable({ expires_at: future, revoked_at: future }), false);
  assert.equal(isAuthTokenUsable({ expires_at: past }), false);
});

void test("email undangan dicocokkan case-insensitive", () => {
  assert.equal(invitationEmailMatches("Budi@Bisnis.id", "budi@bisnis.id"), true);
  assert.equal(invitationEmailMatches("budi@bisnis.id", "lain@bisnis.id"), false);
});

void test("scope staff tidak pernah melihat membership owner/manager atau admin", () => {
  assert.equal(membershipVisibleToScope("staff", "staff"), true);
  assert.equal(membershipVisibleToScope("owner", "staff"), false);
  assert.equal(membershipVisibleToScope("manager", "staff"), false);
  assert.equal(membershipVisibleToScope("owner", undefined), true);
  assert.equal(scopeCanBeAdmin("staff"), false);
  assert.equal(scopeCanBeAdmin(undefined), true);
});
