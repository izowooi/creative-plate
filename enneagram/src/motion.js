const PREFERENCE_KEY = "enneagram-atlas:motion";
const reduceQuery = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
let userPaused = false;
try {
  userPaused = localStorage.getItem(PREFERENCE_KEY) === "paused";
} catch {
  // Motion controls also work when browser storage is unavailable.
}
let observer;
let previousScene;
let pointerFrame;
const entranceSelector =
  ".section-heading, .how-grid article, .type-card, .quiet-note, .about-grid .panel, .sources, .advice-grid .panel, .growth-note";

export function motionEnabled() {
  return !userPaused && !reduceQuery?.matches;
}

function updateControls() {
  const enabled = motionEnabled();
  document.documentElement.dataset.motion = enabled ? "on" : "off";
  document
    .querySelectorAll('[data-action="toggle-motion"]')
    .forEach((button) => {
      button.setAttribute("aria-pressed", String(!enabled));
      button.setAttribute("aria-label", enabled ? "모션 끄기" : "모션 켜기");
      button.title = reduceQuery?.matches
        ? "기기의 모션 줄이기 설정이 적용되어 있습니다"
        : enabled
          ? "모션 끄기"
          : "모션 켜기";
      button.innerHTML = `<span aria-hidden="true">${enabled ? "Ⅱ" : "▷"}</span><span class="motion-label">모션 ${enabled ? "켜짐" : "꺼짐"}</span>`;
    });
  if (!enabled) {
    cancelAnimationFrame(pointerFrame);
    observer?.disconnect();
    document
      .querySelectorAll(".reveal-pending")
      .forEach((el) => el.classList.remove("reveal-pending"));
    document.querySelectorAll("[data-tilt]").forEach(resetTilt);
    document.getAnimations().forEach((animation) => animation.cancel());
  }
}

export function toggleMotion() {
  userPaused = !userPaused;
  try {
    localStorage.setItem(PREFERENCE_KEY, userPaused ? "paused" : "on");
  } catch {}
  updateControls();
}

export function mountMotion(root, scene) {
  observer?.disconnect();
  updateControls();
  const changed = scene !== previousScene;
  previousScene = scene;
  root.dataset.scene = scene.split(":")[0];
  if (!motionEnabled() || !changed) return;
  root.querySelector(".hero")?.classList.add("hero-enter");
  root.querySelector(".result-shell")?.classList.add("result-enter");
  // Choosing an answer re-renders the form. Animate only a new page, never each answer.
  root.querySelector(".quiz-shell")?.classList.add("page-enter");
  const items = root.querySelectorAll(entranceSelector);
  if (!("IntersectionObserver" in globalThis)) return;
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        target.classList.remove("reveal-pending");
        target.classList.add("reveal-visible");
        observer.unobserve(target);
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px 24px 0px" },
  );
  items.forEach((el, index) => {
    el.style.setProperty("--reveal-delay", `${(index % 3) * 85}ms`);
    el.classList.add("reveal-pending");
    observer.observe(el);
  });
}

function resetTilt(el) {
  el.style.removeProperty("--tilt-x");
  el.style.removeProperty("--tilt-y");
  el.style.removeProperty("--light-x");
  el.style.removeProperty("--light-y");
}

document.addEventListener("pointermove", (event) => {
  if (!motionEnabled() || event.pointerType !== "mouse") return;
  const target = event.target.closest("[data-tilt]");
  if (!target) return;
  cancelAnimationFrame(pointerFrame);
  pointerFrame = requestAnimationFrame(() => {
    if (!target.isConnected || !motionEnabled()) return;
    const rect = target.getBoundingClientRect();
    const x = Math.max(
      -0.5,
      Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5),
    );
    const y = Math.max(
      -0.5,
      Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5),
    );
    target.style.setProperty("--tilt-x", `${-y * 8}deg`);
    target.style.setProperty("--tilt-y", `${x * 10}deg`);
    target.style.setProperty("--light-x", `${(x + 0.5) * 100}%`);
    target.style.setProperty("--light-y", `${(y + 0.5) * 100}%`);
  });
});
document.addEventListener("pointerout", (event) => {
  const target = event.target.closest("[data-tilt]");
  if (target && !target.contains(event.relatedTarget)) {
    cancelAnimationFrame(pointerFrame);
    resetTilt(target);
  }
});
reduceQuery?.addEventListener("change", updateControls);
document.addEventListener("visibilitychange", () => {
  document.documentElement.classList.toggle(
    "motion-suspended",
    document.hidden,
  );
});
