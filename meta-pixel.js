// Metaピクセル（Metaビジネスのデータセット「報告革命 LP」）。広告の効果測定に使う。
// ページを開いたら PageView、LINEの問い合わせボタンを押したら Lead（script.js）を送る。
// ピクセルを差し替えるときは PIXEL_ID だけ直す。
// GA4 と同じく本番のドメインだけで送る（ローカル・プレビューの閲覧を広告の数字に混ぜない）。
(() => {
  "use strict";

  const PIXEL_ID = "2124222891542582";
  if (window.location.hostname !== "hokokukakumei.com") return;

  /* eslint-disable */
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */

  window.fbq("init", PIXEL_ID);
  window.fbq("track", "PageView");
})();
