import assert from "node:assert/strict";
import { test } from "node:test";

const listeners = new Map();
const storage = new Map();
const preference = {
  matches: false,
  addEventListener: (_, handler) => {
    preference.change = handler;
  },
};
const controls = [];
const pending = [];
let cancelled = 0;
function element() {
  const classes = new Set();
  return {
    dataset: {},
    attributes: {},
    innerHTML: "",
    title: "",
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, value) =>
        value ? classes.add(name) : classes.delete(name),
    },
    style: { setProperty() {}, removeProperty() {} },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
}
globalThis.cancelAnimationFrame = () => {};
globalThis.matchMedia = () => preference;
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};
globalThis.document = {
  documentElement: element(),
  hidden: false,
  addEventListener: (name, handler) => listeners.set(name, handler),
  querySelectorAll: (selector) =>
    selector.includes("toggle-motion")
      ? controls
      : selector === ".reveal-pending"
        ? pending
        : [],
  getAnimations: () => [{ cancel: () => cancelled++ }],
};
let latestObserver;
globalThis.IntersectionObserver = class {
  constructor(callback) {
    this.callback = callback;
    this.items = [];
    latestObserver = this;
  }
  observe(el) {
    this.items.push(el);
  }
  unobserve(el) {
    this.items = this.items.filter((item) => item !== el);
  }
  disconnect() {
    this.items = [];
  }
};
const { motionEnabled, mountMotion, toggleMotion } = await import(
  "../src/motion.js"
);
function sceneRoot() {
  const hero = element(),
    quiz = element(),
    result = element(),
    card = element();
  return {
    dataset: {},
    hero,
    quiz,
    result,
    card,
    querySelector: (selector) =>
      ({ ".hero": hero, ".quiz-shell": quiz, ".result-shell": result })[
        selector
      ],
    querySelectorAll: () => [card],
  };
}
test("a new page reveals cards once and observer releases visible targets", () => {
  const root = sceneRoot();
  mountMotion(root, "home:0");
  assert.equal(root.dataset.scene, "home");
  assert.equal(root.hero.classList.contains("hero-enter"), true);
  assert.equal(root.card.classList.contains("reveal-pending"), true);
  latestObserver.callback([{ target: root.card, isIntersecting: true }]);
  assert.equal(root.card.classList.contains("reveal-pending"), false);
  assert.equal(root.card.classList.contains("reveal-visible"), true);
  assert.equal(latestObserver.items.length, 0);
});
test("an answer re-render never replays the page entrance or hides new cards", () => {
  mountMotion(sceneRoot(), "quiz:0");
  const samePage = sceneRoot();
  mountMotion(samePage, "quiz:0");
  assert.equal(samePage.quiz.classList.contains("page-enter"), false);
  assert.equal(samePage.card.classList.contains("reveal-pending"), false);
  const nextPage = sceneRoot();
  mountMotion(nextPage, "quiz:1");
  assert.equal(nextPage.quiz.classList.contains("page-enter"), true);
});
test("pause persists separately from questionnaire data and clears hidden content", () => {
  const button = element(),
    card = element();
  controls.push(button);
  card.classList.add("reveal-pending");
  pending.push(card);
  toggleMotion();
  assert.equal(motionEnabled(), false);
  assert.equal(storage.get("enneagram-atlas:motion"), "paused");
  assert.equal(storage.size, 1);
  assert.equal(document.documentElement.dataset.motion, "off");
  assert.equal(button.attributes["aria-pressed"], "true");
  assert.equal(button.attributes["aria-label"], "모션 켜기");
  assert.equal(card.classList.contains("reveal-pending"), false);
  assert.ok(cancelled > 0);
  const root = sceneRoot();
  mountMotion(root, "types:0");
  assert.equal(root.card.classList.contains("reveal-pending"), false);
  toggleMotion();
  assert.equal(motionEnabled(), true);
  assert.equal(button.attributes["aria-label"], "모션 끄기");
});
test("system reduced-motion takes priority and changes apply immediately", () => {
  preference.matches = true;
  preference.change();
  assert.equal(motionEnabled(), false);
  assert.equal(document.documentElement.dataset.motion, "off");
  const root = sceneRoot();
  mountMotion(root, "result:0");
  assert.equal(root.result.classList.contains("result-enter"), false);
  assert.equal(root.card.classList.contains("reveal-pending"), false);
  preference.matches = false;
  preference.change();
  assert.equal(motionEnabled(), true);
});
test("background tabs suspend decorative loops", () => {
  document.hidden = true;
  listeners.get("visibilitychange")();
  assert.equal(
    document.documentElement.classList.contains("motion-suspended"),
    true,
  );
  document.hidden = false;
  listeners.get("visibilitychange")();
  assert.equal(
    document.documentElement.classList.contains("motion-suspended"),
    false,
  );
});
