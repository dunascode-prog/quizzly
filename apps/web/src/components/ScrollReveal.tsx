"use client";

import { useEffect } from "react";

// Below-the-fold blocks rise in as they scroll into view; siblings in a grid follow one by one.
// Anything already on screen when the page loads is left alone, so nothing flickers.
const TARGETS = [
  "main section:not(.hero) .sec-head",
  "main .band",
  "main .strip",
  "main .g3 > *",
  "main .bento > *",
  "main .g4 > *",
  "main .faq > *",
].join(", ");

export function ScrollReveal() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );

    for (const el of document.querySelectorAll<HTMLElement>(TARGETS)) {
      if (el.parentElement?.closest("[data-reveal]")) continue;
      if (el.getBoundingClientRect().top < window.innerHeight) continue;
      const index = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      el.style.setProperty("--reveal-delay", `${Math.min(index, 5) * 90}ms`);
      el.dataset.reveal = "";
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  return null;
}
