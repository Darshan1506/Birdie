// How spoken phrases are routed, in both Basic and AI mode. routing.ts is pure, so it is imported directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, INTENTS, type RouteEnv } from "../src/content/routing";

const envFor = (o: Partial<RouteEnv> = {}): RouteEnv => ({
  smart: false,
  hasPending: false,
  wakeWordEnabled: false,
  wakeWord: "hey feed",
  ...o,
});

// A short label for what a phrase was routed to.
function route(phrase: string, o: Partial<RouteEnv> = {}): string | null {
  const a = analyze(phrase, envFor(o));
  if (!a) return null;
  if (a.kind === "intent") return a.name;
  if (a.kind === "text") return "text:" + a.command.type;
  if (a.kind === "confirm") return a.yes ? "confirm:yes" : "confirm:no";
  return a.kind;
}

test("stop always wins, in both modes", () => {
  for (const smart of [false, true]) {
    assert.equal(route("stop", { smart }), "stop");
    assert.equal(route("okay stop please", { smart }), "stop");
    assert.equal(route("Stop!", { smart }), "stop");
  }
});

test("stop does not fire inside dictated text", () => {
  assert.equal(route("reply saying stop it right now"), "text:reply");
});

test("basic mode: flexible keyword commands", () => {
  const cases: Record<string, string> = {
    "can you like this one": "like",
    "read this": "read",
    "read my feed": "read_feed",
    "read the replies": "read_replies",
    "read my messages": "read_messages",
    "what is this about": "research",
    "skip this": "next",
    "go faster": "faster",
    "keep going": "start_scroll",
    "retweet that": "repost",
    "save this": "bookmark",
    "unfollow him": "unfollow",
    "unlike this": "unlike",
    "open messages": "messages",
    "my lists": "lists",
    "x settings": "x_settings",
    "my profile": "my_profile",
    "go home": "home",
    "go back": "back",
    help: "help",
  };
  for (const [phrase, want] of Object.entries(cases)) assert.equal(route(phrase), want, phrase);
});

test("basic mode: dictation commands carry their text", () => {
  assert.deepEqual(analyze("Reply saying totally agree, great thread!", envFor()), {
    kind: "text",
    command: { type: "reply", text: "totally agree, great thread!" },
  });
  assert.equal(route("post saying good morning everyone"), "text:post");
  assert.deepEqual(analyze("search for India cricket", envFor()), {
    kind: "text",
    command: { type: "search", query: "India cricket" },
  });
  assert.deepEqual(analyze("message Rahul saying are we on tonight?", envFor()), {
    kind: "text",
    command: { type: "dm", name: "Rahul", text: "are we on tonight?" },
  });
  assert.equal(route("send a DM to Priya saying hi there"), "text:dm");
  assert.deepEqual(analyze("open Rahul's profile", envFor()), {
    kind: "text",
    command: { type: "profile", name: "Rahul" },
  });
  assert.equal(route("reply to this"), "text_incomplete");
});

test("AI mode: short commands stay instant, sentences go to the AI", () => {
  const smart = { smart: true };
  assert.equal(route("like", smart), "like");
  assert.equal(route("next", smart), "next");
  assert.equal(route("I don't like this, skip", smart), "brain");
  assert.equal(route("what is this about", smart), "brain");
  assert.equal(route("tell her congrats on the launch", smart), "brain");
  assert.equal(route("reply to this", smart), "brain");
  // AI mode sends DMs through the smarter agent, not the fixed script
  assert.equal(route("message Rahul saying are we on tonight?", smart), "brain");
  // exact dictation still works without the AI
  assert.equal(route("reply saying congrats!", smart), "text:reply");
});

test("forceBasic re-routes an AI-mode phrase as a Basic command", () => {
  const a = analyze("what is this about", envFor({ smart: true }), true);
  assert.equal(a?.kind === "intent" && a.name, "research");
});

test("mode switching works in both modes", () => {
  for (const smart of [false, true]) {
    assert.equal(route("AI off", { smart }), "ai_off");
    assert.equal(route("switch to basic mode", { smart }), "ai_off");
    assert.equal(route("turn on AI", { smart }), "ai_on");
  }
});

test("confirmations only count while something is waiting", () => {
  const waiting = { hasPending: true };
  assert.equal(route("send", waiting), "confirm:yes");
  assert.equal(route("yes", waiting), "confirm:yes");
  assert.equal(route("cancel", waiting), "confirm:no");
  assert.notEqual(route("yes"), "confirm:yes");
});

test("wake word: ignored without it, stop still works", () => {
  const wake = { wakeWordEnabled: true };
  assert.equal(route("like this", wake), null);
  assert.equal(route("hey feed like this", wake), "like");
  assert.equal(route("hey feed", wake), "wake");
  assert.equal(route("stop", wake), "stop");
});

test("INTENTS order: specific patterns come before general ones", () => {
  const order = INTENTS.map(([name]) => name as string);
  const before = (a: string, b: string) =>
    assert.ok(order.indexOf(a) < order.indexOf(b), `${a} before ${b}`);
  before("read_messages", "read");
  before("read_feed", "read");
  before("unlike", "like");
  before("unrepost", "repost");
  before("unbookmark", "bookmark");
  before("unfollow", "follow");
  before("my_profile", "open_profile");
});
