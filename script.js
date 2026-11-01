(() => {
  "use strict";

  const supportsObserver = typeof window.IntersectionObserver === "function";

  // アクセス解析（Vercel Web Analytics）。UTMの集計画面は上位プラン限定なので、
  // utm_source 付きの流入はカスタムイベントで送り、同じタブの間はLINEのクリックにも付ける。
  const track = (name, data) => {
    if (typeof window.va === "function") window.va("event", { name, data });
  };
  const clip = (value) => String(value).slice(0, 100);
  // プライベートブラウズなどで sessionStorage が使えなくても、計測以外は動かす。
  const session = (use) => {
    try {
      return use(window.sessionStorage);
    } catch (error) {
      return null;
    }
  };
  let source = session((storage) => storage.getItem("hk-source")) || "";
  const params = new URLSearchParams((window.location && window.location.search) || "");
  if (params.get("utm_source")) {
    source = clip(params.get("utm_source"));
    track("UTM Landing", { source, campaign: clip(params.get("utm_campaign") || "") });
    session((storage) => storage.setItem("hk-source", source));
  }
  document.querySelectorAll("[data-line-cta]").forEach((link) => {
    link.addEventListener("click", () => {
      track("LINE Click", { position: link.getAttribute("data-line-cta"), source: source || "(none)" });
    });
  });

  // 表示アニメーション。IntersectionObserver が使えない環境では最初から表示する。
  const revealTargets = document.querySelectorAll(".reveal");
  if (!supportsObserver) {
    revealTargets.forEach((element) => element.classList.add("is-in"));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          revealObserver.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    revealTargets.forEach((element) => revealObserver.observe(element));
  }

  // スクロールしたらヘッダーに区切り線を出す。
  const header = document.querySelector("[data-header]");
  if (header) {
    const updateHeader = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
  }

  // スマホ固定のLINEボタンは、ヒーローと最後のCTAが見えていない間だけ出す。
  const mobileCta = document.querySelector("[data-mobile-cta]");
  const heroCta = document.querySelector("[data-hero-cta]");
  const finalCta = document.querySelector("[data-final-cta]");
  if (mobileCta && heroCta && finalCta) {
    if (!supportsObserver) {
      mobileCta.classList.add("is-visible");
    } else {
      const visible = new Map([
        [heroCta, true],
        [finalCta, false],
      ]);
      const ctaObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => visible.set(entry.target, entry.isIntersecting));
        const show = !visible.get(heroCta) && !visible.get(finalCta);
        mobileCta.classList.toggle("is-visible", show);
      });
      ctaObserver.observe(heroCta);
      ctaObserver.observe(finalCta);
    }
  }

  // 業種別タブ。矢印・Home・Endキーでも切り替えられる。
  const tabList = document.querySelector("[data-case-tabs]");
  if (tabList) {
    const tabs = Array.from(tabList.querySelectorAll('[role="tab"]'));
    const select = (tab, focus) => {
      tabs.forEach((item) => {
        const selected = item === tab;
        item.setAttribute("aria-selected", String(selected));
        item.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(item.getAttribute("aria-controls"));
        if (panel) panel.hidden = !selected;
      });
      if (focus) tab.focus();
      if (typeof tab.scrollIntoView === "function") {
        tab.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => select(tab, false));
      tab.addEventListener("keydown", (event) => {
        const keys = {
          ArrowRight: tabs[(index + 1) % tabs.length],
          ArrowLeft: tabs[(index - 1 + tabs.length) % tabs.length],
          Home: tabs[0],
          End: tabs[tabs.length - 1],
        };
        const next = keys[event.key];
        if (!next) return;
        event.preventDefault();
        select(next, true);
      });
    });
  }
})();
