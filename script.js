(() => {
  "use strict";

  const form = document.querySelector(".demo-form");

  function initializeForm() {
    const status = document.querySelector(".form-status");
    const submitButton = document.querySelector(".form-submit");
    if (!form || !status || !submitButton) return;

    let submitting = false;
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");

    function setStatus(message, state) {
      status.textContent = message;
      status.classList.toggle("is-success", state === "success");
      status.classList.toggle("is-error", state === "error");
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submitting) return;

      submitting = true;
      submitButton.disabled = true;
      form.setAttribute("aria-busy", "true");
      setStatus("送信中です。");

      const controller = new AbortController();
      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 15000);

      try {
        const response = await fetch(
          form.getAttribute("action") || "/api/demo",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            },
            body: new URLSearchParams(new FormData(form)),
            signal: controller.signal,
          },
        );

        if (!response.ok) throw new Error("Submission failed");
        const result = await response.json();
        if (result?.ok !== true)
          throw new Error("Submission was not confirmed");

        setStatus(
          "お申し込みありがとうございます。内容を確認のうえご連絡します。",
          "success",
        );
        form.reset();
      } catch {
        setStatus(
          timedOut
            ? "送信の確認に時間がかかっています。入力内容は残っています。時間をおいてもう一度お試しください。"
            : "送信に失敗しました。入力内容は残っています。時間をおいてもう一度お試しください。",
          "error",
        );
      } finally {
        window.clearTimeout(timeoutId);
        submitButton.disabled = false;
        form.setAttribute("aria-busy", "false");
        submitting = false;
      }
    });
  }

  function initializeMotion() {
    const root = document.documentElement;
    const elements = [...document.querySelectorAll("[data-reveal]")];
    const toggle = document.querySelector("[data-motion-toggle]");
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let paused = preference?.matches ?? false;

    const showAll = () =>
      elements.forEach((element) => element.classList.add("is-visible"));

    function setPaused(value) {
      paused = value;
      root.classList.toggle("motion-paused", paused);
      if (paused) showAll();
      if (toggle) {
        toggle.setAttribute("aria-pressed", String(paused));
        toggle.textContent = paused ? "動きを再開" : "動きを止める";
      }
      if (
        typeof window.dispatchEvent === "function" &&
        typeof window.CustomEvent === "function"
      ) {
        window.dispatchEvent(
          new window.CustomEvent("motionchange", { detail: { paused } }),
        );
      }
    }

    setPaused(paused);

    if (typeof window.IntersectionObserver === "function") {
      let observer;
      try {
        observer = new window.IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.08 },
        );
        elements.forEach((element) => observer.observe(element));
        // Only opt into hidden/reveal styles after observing every element succeeds.
        root.classList.add("motion-ready");
      } catch {
        observer?.disconnect();
        showAll();
      }
    } else {
      showAll();
    }

    if (toggle) {
      toggle.addEventListener("click", () => setPaused(!paused));
      toggle.hidden = false;
    }

    const onPreferenceChange = (event) => setPaused(event.matches);
    if (preference?.addEventListener) {
      preference.addEventListener("change", onPreferenceChange);
    } else if (preference?.addListener) {
      preference.addListener(onPreferenceChange);
    }
  }

  function initializeMobileCta() {
    const cta = document.querySelector(".mobile-cta");
    if (!form || !cta || typeof window.IntersectionObserver !== "function")
      return;

    let formVisible = false;
    function updateVisibility() {
      // Keep a clicked/focused CTA visible until focus moves to the form or elsewhere.
      const hide = formVisible && !cta.contains(document.activeElement);
      cta.classList.toggle("is-hidden", hide);
      if (hide) {
        cta.setAttribute("aria-hidden", "true");
        cta.setAttribute("inert", "");
      } else {
        cta.removeAttribute("aria-hidden");
        cta.removeAttribute("inert");
      }
    }

    let observer;
    try {
      observer = new window.IntersectionObserver((entries) => {
        formVisible = entries.some((entry) => entry.isIntersecting);
        updateVisibility();
      });
      observer.observe(form);
      cta.addEventListener("focusout", () =>
        window.setTimeout(updateVisibility, 0),
      );
      cta.addEventListener("focusin", updateVisibility);
    } catch {
      observer?.disconnect();
      cta.classList.remove("is-hidden");
      cta.removeAttribute("aria-hidden");
      cta.removeAttribute("inert");
    }
  }

  function initializeMangaCarousel() {
    const carousel = document.querySelector("[data-manga-carousel]");
    if (!carousel) return;

    const slides = [...carousel.querySelectorAll("[data-manga-slide]")];
    const dots = [...carousel.querySelectorAll("[data-manga-dot]")];
    const previous = carousel.querySelector("[data-manga-previous]");
    const next = carousel.querySelector("[data-manga-next]");
    const current = carousel.querySelector("[data-manga-current]");
    const title = carousel.querySelector("[data-manga-title]");
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!slides.length || !previous || !next || !current || !title) return;

    let index = 0;
    let autoplayId;
    let userInteracted = false;

    function show(nextIndex, { animate = true } = {}) {
      index = (nextIndex + slides.length) % slides.length;
      slides.forEach((slide, slideIndex) => {
        const active = slideIndex === index;
        slide.classList.toggle("is-active", active);
        slide.classList.toggle("is-entering", active && animate);
        slide.setAttribute("aria-hidden", String(!active));
      });
      dots.forEach((dot, dotIndex) => {
        const active = dotIndex === index;
        dot.classList.toggle("is-active", active);
        dot.setAttribute("aria-label", `${dotIndex + 1}組目${active ? "を表示中" : ""}`);
      });
      current.textContent = String(index + 1);
      title.textContent = slides[index].dataset.mangaTitle || "";
    }

    function stopAutoplay() {
      if (autoplayId) window.clearInterval(autoplayId);
      autoplayId = undefined;
    }

    function startAutoplay() {
      stopAutoplay();
      if (userInteracted || reducedMotion?.matches || document.documentElement.classList.contains("motion-paused")) return;
      autoplayId = window.setInterval(() => show(index + 1), 6500);
    }

    function handleManualChange(direction) {
      userInteracted = true;
      stopAutoplay();
      show(index + direction);
    }

    previous.addEventListener("click", () => handleManualChange(-1));
    next.addEventListener("click", () => handleManualChange(1));
    carousel.addEventListener("mouseenter", stopAutoplay);
    carousel.addEventListener("mouseleave", startAutoplay);
    carousel.addEventListener("focusin", stopAutoplay);
    carousel.addEventListener("focusout", () => window.setTimeout(startAutoplay, 0));
    window.addEventListener("motionchange", (event) => {
      if (event.detail?.paused) stopAutoplay();
      else startAutoplay();
    });
    reducedMotion?.addEventListener?.("change", startAutoplay);

    carousel.classList.add("is-ready");
    show(0, { animate: false });
    startAutoplay();
  }

  initializeForm();
  initializeMotion();
  initializeMobileCta();
  initializeMangaCarousel();
})();
