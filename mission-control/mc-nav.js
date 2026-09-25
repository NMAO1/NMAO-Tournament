/* =====================================================================
   Mission Control — shared sidebar navigation.
   Drop `<script src="./mc-nav.js" defer></script>` before </body> on any MC
   page. It injects a fixed left sidebar (grouped links + active state + mobile
   toggle + sign out), shifts the page content, and hides the page's old
   in-header nav links so navigation lives in ONE place.

   The sidebar only appears once the staff console is visible (i.e. after login
   — it watches #console losing its `.hide` class); pages without a #console
   gate show it immediately. Self-contained: no dependencies, its own styles.
   ===================================================================== */
(function () {
  var GROUPS = [
    { label: "Owner", items: [
      { href: "overview.html", icon: "📊", name: "Overview", slice: "team" },
      { href: "team.html",     icon: "👥", name: "Team",     slice: "team" },
    ]},
    { label: "Console", items: [
      { href: "index.html", icon: "🎛", name: "Round Pipeline", slice: "rounds" },
    ]},
    { label: "Review & Safety", items: [
      { href: "schools.html",    icon: "🏫", name: "School Review", slice: "schools" },
      { href: "moderation.html", icon: "🛡", name: "Moderation",    slice: "moderation" },
      { href: "judges.html",     icon: "⚖️", name: "Judges",        slice: "judges" },
    ]},
    { label: "Growth", items: [
      { href: "sponsors.html",    icon: "◆", name: "Sponsors",     slice: "sponsors" },
      { href: "social.html",      icon: "📣", name: "Social",       slice: "social" },
      { href: "ambassadors.html", icon: "🎟", name: "Ambassadors",  slice: "ambassadors" },
    ]},
    { label: "Setup", items: [
      { href: "config.html", icon: "⚙️", name: "Config",  slice: "config" },
      { href: "badges.html", icon: "🏅", name: "Badges",  slice: "badges" },
      { href: "test.html",   icon: "🧪", name: "Sandbox", ownerOnly: true },
    ]},
  ];

  var here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (!here) here = "index.html";

  var CSS =
  "#mc-sidebar{position:fixed;top:0;left:0;width:212px;height:100vh;overflow-y:auto;z-index:80;" +
  "background:#0e0e11;border-right:1px solid #26262b;padding:16px 12px;display:flex;flex-direction:column;gap:16px;" +
  "transform:translateX(-100%);transition:transform .2s ease;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}" +
  ".mc-brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:#F5F0E8;padding:2px 8px}" +
  ".mc-yy{width:24px;height:24px;border-radius:50%;background:conic-gradient(#F5F0E8 0 50%,#141210 0 100%);border:1px solid #E6B93F;flex:none}" +
  ".mc-brand b{font-size:14px;display:block;font-family:Georgia,'Times New Roman',serif;line-height:1.15}" +
  ".mc-brand small{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#9a938a;display:block}" +
  ".mc-groups{display:flex;flex-direction:column;gap:15px;flex:1}" +
  ".mc-grp-l{font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:#6b655c;padding:0 8px 5px;font-weight:700}" +
  ".mc-link{display:flex;align-items:center;gap:10px;text-decoration:none;color:#c9c3ba;font-size:13px;padding:7px 9px;border-radius:9px;margin-bottom:1px}" +
  ".mc-link:hover{background:#17171b;color:#F5F0E8}" +
  ".mc-link.on{background:rgba(230,185,63,.14);color:#FFE488;font-weight:600;box-shadow:inset 0 0 0 1px rgba(156,122,34,.5)}" +
  ".mc-ic{width:20px;text-align:center;font-size:14px;flex:none}" +
  ".mc-off{display:none!important}" +
  ".mc-signout{margin-top:auto;background:none;border:1px solid #26262b;color:#9a938a;border-radius:9px;padding:8px;font-size:12px;cursor:pointer;font-family:inherit}" +
  ".mc-signout:hover{border-color:#3a3a40;color:#F5F0E8}" +
  "#mc-nav-toggle{position:fixed;top:14px;left:14px;z-index:82;background:#141416;border:1px solid #26262b;color:#F5F0E8;width:38px;height:38px;border-radius:10px;font-size:16px;cursor:pointer;display:none;line-height:1}" +
  "#mc-scrim{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:79;opacity:0;visibility:hidden;transition:opacity .2s}" +
  "html.mc-nav-open #mc-scrim{opacity:1;visibility:visible}" +
  /* hide the page's old in-header nav links + sign-out — the sidebar owns them now */
  "html.mc-nav-on header a.btn[href$='.html']{display:none!important}" +
  "html.mc-nav-on header #signoutBtn{display:none!important}" +
  "@media(min-width:901px){" +
    "html.mc-nav-on #mc-sidebar{transform:none}" +
    "html.mc-nav-on body{padding-left:236px}" +
    "#mc-scrim{display:none}" +
  "}" +
  "@media(max-width:900px){" +
    "html.mc-nav-on #mc-nav-toggle{display:block}" +
    "html.mc-nav-on.mc-nav-open #mc-sidebar{transform:none}" +
  "}";

  function build() {
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    var nav = document.createElement("nav");
    nav.id = "mc-sidebar";
    nav.setAttribute("aria-label", "Mission Control navigation");
    var h = '<a class="mc-brand" href="index.html"><span class="mc-yy"></span><span><b>Mission Control</b><small>NMAO Tournament</small></span></a><div class="mc-groups">';
    GROUPS.forEach(function (g) {
      h += '<div class="mc-grp"><div class="mc-grp-l">' + g.label + "</div>";
      g.items.forEach(function (it) {
        var on = it.href.toLowerCase() === here ? " on" : "";
        var attr = it.ownerOnly ? ' data-owner="1"' : ' data-slice="' + it.slice + '"';
        h += '<a class="mc-link' + on + '" href="' + it.href + '"' + attr + '><span class="mc-ic">' + it.icon + "</span>" + it.name + "</a>";
      });
      h += "</div>";
    });
    h += '</div><button class="mc-signout" id="mcSignout">Sign out</button>';
    nav.innerHTML = h;
    document.body.appendChild(nav);

    var toggle = document.createElement("button");
    toggle.id = "mc-nav-toggle";
    toggle.setAttribute("aria-label", "Toggle navigation");
    toggle.textContent = "☰";
    document.body.appendChild(toggle);

    var scrim = document.createElement("div");
    scrim.id = "mc-scrim";
    document.body.appendChild(scrim);

    function openNav(o) { document.documentElement.classList.toggle("mc-nav-open", o); }
    toggle.onclick = function () { openNav(!document.documentElement.classList.contains("mc-nav-open")); };
    scrim.onclick = function () { openNav(false); };
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) openNav(false); });

    document.getElementById("mcSignout").onclick = function () {
      try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf("sb-") === 0) localStorage.removeItem(k); }); } catch (e) {}
      location.href = "index.html";
    };
  }

  // The GROUPS item for the current page (or null if the page isn't in the nav).
  function curItem() {
    for (var i = 0; i < GROUPS.length; i++)
      for (var j = 0; j < GROUPS[i].items.length; j++)
        if (GROUPS[i].items[j].href.toLowerCase() === here) return GROUPS[i].items[j];
    return null;
  }
  function allowedItem(it, isOwner, caps) {
    if (isOwner) return true;
    return it.ownerOnly ? false : !!(it.slice && caps[it.slice]);
  }
  function firstAllowed(isOwner, caps) {
    for (var i = 0; i < GROUPS.length; i++)
      for (var j = 0; j < GROUPS[i].items.length; j++)
        if (allowedItem(GROUPS[i].items[j], isOwner, caps)) return GROUPS[i].items[j].href;
    return null;
  }

  // Phase 2 — mirror the backend: hide slices the caller can't use, and bounce
  // them off a page they can't access. Backend already enforces; this is UX.
  var capsDone = false;
  function applyCaps() {
    var mc = window.__mc;
    if (!mc || !mc.createClient) return false; // page head not ready yet — retry
    var sb;
    try { sb = mc.createClient(mc.SUPABASE_URL, mc.ANON, { auth: { persistSession: true, autoRefreshToken: true } }); }
    catch (e) { return false; }
    sb.rpc("staff_me").then(function (res) {
      var me = res && res.data;
      if (!me) return; // not resolved as staff (e.g. login screen) — leave nav hidden
      var isOwner = !!me.is_owner, caps = me.caps || {};
      document.querySelectorAll("#mc-sidebar a.mc-link").forEach(function (a) {
        var it = { slice: a.getAttribute("data-slice"), ownerOnly: a.getAttribute("data-owner") === "1" };
        a.classList.toggle("mc-off", !allowedItem(it, isOwner, caps));
      });
      document.querySelectorAll("#mc-sidebar .mc-grp").forEach(function (g) {
        var any = Array.prototype.some.call(g.querySelectorAll("a.mc-link"), function (a) { return !a.classList.contains("mc-off"); });
        g.classList.toggle("mc-off", !any);
      });
      var cur = curItem();
      if (cur && !allowedItem(cur, isOwner, caps)) {
        var dest = firstAllowed(isOwner, caps);
        if (dest && dest.toLowerCase() !== here) location.replace(dest);
      }
    }).catch(function () { capsDone = false; }); // let a transient failure retry
    return true;
  }

  // Reveal the sidebar only when the staff console is visible (post-login).
  // Pages gate differently: a #console shown on login, or a #loginCard/#login
  // hidden on login. Gate-less pages (e.g. the live board) show it immediately.
  function sync() {
    var c = document.getElementById("console");
    var l = document.getElementById("loginCard") || document.getElementById("login");
    var authed;
    if (c) authed = !c.classList.contains("hide");
    else if (l) authed = l.classList.contains("hide");
    else authed = true;
    document.documentElement.classList.toggle("mc-nav-on", authed);
    if (authed && !capsDone) capsDone = applyCaps();
  }

  function init() {
    build();
    sync();
    if ("MutationObserver" in window) {
      var obs = new MutationObserver(sync);
      ["console", "loginCard", "login"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) obs.observe(el, { attributes: true, attributeFilter: ["class"] });
      });
    }
    var n = 0, iv = setInterval(function () { sync(); if (++n > 40) clearInterval(iv); }, 300);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
