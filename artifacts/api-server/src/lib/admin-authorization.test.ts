import assert from "node:assert/strict";
import test from "node:test";
import {
  getPrimaryEmail,
  getProtectedDeleteReason,
  isConfiguredAdminEmail,
  parseConfiguredAdminEmails,
} from "./admin-authorization.js";

test("uses Clerk's primary email instead of the first listed address", () => {
  const user = {
    primaryEmailAddressId: "email_primary",
    emailAddresses: [
      { id: "email_secondary", emailAddress: "secondary@example.com" },
      { id: "email_primary", emailAddress: "Admin@Example.com" },
    ],
  };

  assert.equal(getPrimaryEmail(user), "Admin@Example.com");
  assert.equal(
    isConfiguredAdminEmail(getPrimaryEmail(user), [" admin@example.com "]),
    true,
  );
});

test("parses one or more configured administrator emails safely", () => {
  assert.deepEqual(
    parseConfiguredAdminEmails(" Admin@Example.com, other@example.com ,, "),
    ["admin@example.com", "other@example.com"],
  );
  assert.deepEqual(parseConfiguredAdminEmails(undefined), []);
  assert.deepEqual(parseConfiguredAdminEmails("   "), []);
});

test("fails closed when admin configuration is missing", () => {
  assert.equal(isConfiguredAdminEmail("admin@example.com", []), false);
  assert.equal(
    getProtectedDeleteReason({
      actingUserId: "member_1",
      targetUserId: "member_2",
      targetPrimaryEmail: "admin@example.com",
      configuredAdminEmails: [],
    }),
    null,
  );
});

test("protects the signed-in administrator and other configured administrators", () => {
  assert.equal(
    getProtectedDeleteReason({
      actingUserId: "user_admin",
      targetUserId: "user_admin",
      targetPrimaryEmail: "admin@example.com",
      configuredAdminEmails: ["admin@example.com"],
    }),
    "self",
  );
  assert.equal(
    getProtectedDeleteReason({
      actingUserId: "user_admin",
      targetUserId: "user_other_admin",
      targetPrimaryEmail: "Other.Admin@Example.com",
      configuredAdminEmails: ["admin@example.com", "other.admin@example.com"],
    }),
    "protected-admin",
  );
  assert.equal(
    getProtectedDeleteReason({
      actingUserId: "user_admin",
      targetUserId: "user_member",
      targetPrimaryEmail: "member@example.com",
      configuredAdminEmails: ["admin@example.com"],
    }),
    null,
  );
});