(() => {
  "use strict";

  const supportsObserver = typeof window.IntersectionObserver === "function";

  // アクセス解析（Vercel Web Analytics）。UTMの集計画面は上位プラン限定なので、
  // utm_source 付きの流入はカスタムイベントで送り、同じタブの間はLINEのクリックにも付ける。
  const track = (name, data) => {
    if (typeof window.va === "function") window.va("event", { name, data });
  };
  const clip = (value) => String(value).slice(0, 100);
  // Google アナリティクス（GA4）。gtag は head で定義している（本番のドメイン以外では送信しない）。
  // パラメータ名は GA4 のカスタム定義（cta_position / faq_question / case_industry / section_id）と合わせる。
  const gaEvent = (name, params) => {
    if (typeof window.gtag === "function") window.gtag("event", name, params);
  };
  const textOf = (element) => clip(String((element && element.textContent) || "").replace(/\s+/g, " ").trim());
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
      const position = link.getAttribute("data-line-cta");
      track("LINE Click", { position, source: source || "(none)" });
      // GA4 ではキーイベント（成果）として数える。
      gaEvent("line_click", { cta_position: position });
    });
  });

  // よくある質問を開いたら、どの質問かを送る（閉じたときは送らない）。
  document.querySelectorAll(".faq-list details").forEach((item) => {
    item.addEventListener("toggle", () => {
      if (!item.open) return;
      gaEvent("faq_open", { faq_question: textOf(item.querySelector("summary")) });
    });
  });

  // どの章まで読まれたか。LP の主な章が1秒以上画面に入っていたら、章ごとに1回だけ送る
  // （ページ内リンクのなめらかなスクロールで通り過ぎただけの章は数えない）。
  const sections = document.querySelectorAll("main > section[id]");
  if (supportsObserver && sections.length) {
    const SECTION_DWELL_MS = 1000;
    const timers = new Map();
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const section = entry.target;
          if (entry.isIntersecting) {
            if (timers.has(section)) return;
            timers.set(
              section,
              window.setTimeout(() => {
                gaEvent("section_view", { section_id: section.id });
                sectionObserver.unobserve(section);
              }, SECTION_DWELL_MS)
            );
          } else if (timers.has(section)) {
            window.clearTimeout(timers.get(section));
            timers.delete(section);
          }
        });
      },
      { rootMargin: "0px 0px -40% 0px", threshold: 0 }
    );
    sections.forEach((section) => sectionObserver.observe(section));
  }

  // ヒーローのスタンプは最初は静止画。ページを読み込み終えてから動く版に差し替える
  // （最初の表示を軽くするため）。動きを減らす設定の人には静止画のまま見せる。
  const stamp = document.querySelector("[data-animated-src]");
  if (stamp) {
    const reduceMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animate = () => stamp.setAttribute("src", stamp.getAttribute("data-animated-src"));
    if (!reduceMotion) {
      if (document.readyState === "complete") animate();
      else window.addEventListener("load", animate, { once: true });
    }
  }

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
      gaEvent("case_tab_select", { case_industry: textOf(tab) });
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
