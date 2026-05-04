import { useEffect } from "react";

export function useReveal(revealKey: string | number = 0) {
  useEffect(() => {
    const selector = ".reveal, .reveal-scale, .reveal-slide, [data-stagger]";
    const targets = Array.from(document.querySelectorAll<HTMLElement>(selector));

    if (!("IntersectionObserver" in window)) {
      targets.forEach((target) => target.classList.add("in"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -80px 0px" },
    );

    targets.forEach((target) => {
      if (!target.classList.contains("in")) observer.observe(target);
    });

    return () => observer.disconnect();
  }, [revealKey]);
}
