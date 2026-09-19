"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Keep reveal transforms on a separate layer from the card's hover transforms.
// Content remains visible when JavaScript or animation APIs are unavailable.
export function CardReveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!node || preference?.matches || !window.IntersectionObserver || !node.animate) return;

    let revealed = false;
    let animation: Animation | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (revealed || !entries.some((entry) => entry.isIntersecting)) return;
      revealed = true;
      observer.unobserve(node);
      animation = node.animate([
        { opacity: 0, transform: "translateY(30px)" },
        { opacity: 1, transform: "translateY(0)" },
      ], { duration: 500, easing: "cubic-bezier(.4, 0, .2, 1)" });
    });
    const stopForReducedMotion = () => {
      if (preference?.matches) {
        revealed = true;
        observer.disconnect();
        animation?.cancel();
      }
    };
    observer.observe(node);
    preference?.addEventListener("change", stopForReducedMotion);
    return () => {
      observer.disconnect();
      animation?.cancel();
      preference?.removeEventListener("change", stopForReducedMotion);
    };
  }, []);

  return <div ref={ref} className="card-reveal">{children}</div>;
}
