// The agent's confirmation rules (PRD §8). These must never regress.
import { test } from "node:test";
import assert from "node:assert/strict";
import { needsConfirmation, pressNeedsConfirmation } from "../src/content/safety";

test("risky button labels need a yes", () => {
  for (const label of [
    "Send", "Post", "Reply", "Delete", "Block @someone", "Report post", "Unfollow @a",
    "Mute", "Log out", "Subscribe", "Buy", "Confirm", "Save", "Update", "Discard", "Leave",
  ])
    assert.equal(needsConfirmation(label), true, label);
});

test("engagement buttons need a yes too (guards against instructions hidden in tweets)", () => {
  for (const label of ["Follow @someone", "Repost", "Like", "1,234 Likes. Like"])
    assert.equal(needsConfirmation(label), true, label);
});

test("harmless labels do not", () => {
  for (const label of [
    "Home", "Explore", "Messages", "Search", "Liked by Rahul", "Notifications", "Followers",
  ])
    assert.equal(needsConfirmation(label), false, label);
});

test("Enter in a message or compose box needs a yes; in a search box it does not", () => {
  assert.equal(pressNeedsConfirmation("Enter", { tag: "textarea", editable: false }), true);
  assert.equal(pressNeedsConfirmation("Enter", { tag: "div", editable: true }), true);
  assert.equal(pressNeedsConfirmation("Enter", { tag: "input", editable: false }), false);
  assert.equal(pressNeedsConfirmation("Escape", { tag: "textarea", editable: false }), false);
});
