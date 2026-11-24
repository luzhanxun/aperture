/* 光圈AI · 原型交互 */
(function () {
  "use strict";

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var toastTimer = null;
  function toast(message) {
    var el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("is-open");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { el.classList.remove("is-open"); }, 2400);
  }

  /* ---------------- 路由（单页外壳） ---------------- */
  var ROUTES = ["overview", "library", "upload", "sales", "buy", "link", "stats", "admin", "login", "mcp", "agent", "design"];
  var TITLES = {
    overview: "总览",
    library: "素材库",
    upload: "上传与元数据治理",
    sales: "素材销售",
    buy: "客户端",
    link: "客户打开销售链接",
    stats: "定价与销售统计",
    admin: "后台管理",
    login: "登录与身份",
    mcp: "智能体接口规范",
    agent: "AI智能体整合",
    design: "设计规范"
  };
  var current = null;

  function routeName(href) {
    if (!href || href.indexOf("#/") !== 0) return null;
    var name = href.slice(2).split(/[?#]/)[0].replace(/\/+$/, "");
    return ROUTES.indexOf(name) !== -1 ? name : null;
  }
  function routeFromHash() { return routeName(window.location.hash || ""); }
  function viewEl(name) { return document.getElementById("view-" + name); }

  function scrollToAnchor(id) {
    if (!id) return;
    var target = document.getElementById(id);
    if (!target) return;
    var view = target.closest(".view");
    if (view && view.hidden) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }

  function render(name, options) {
    options = options || {};
    var view = viewEl(name) || viewEl("overview");
    if (!view) return;
    name = view.getAttribute("data-route");

    var changed = name !== current;
    $$(".view").forEach(function (v) { v.hidden = v !== view; });

    document.body.setAttribute("data-route", name);
    document.title = "光圈AI · " + (TITLES[name] || "原型");

    $$(".shell__nav a, .shell__user").forEach(function (a) {
      var on = routeName(a.getAttribute("href") || "") === name;
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });

    if (changed) {
      closeDrawer();
      if (selecting) toggleSelectMode(false);
      if (name !== "library") { selected = []; syncDock(); }
      var search = $("[data-search]", view);
      if (search && search.value) { search.value = ""; applySearch(search); }
      if (name === "agent") {
        setDemoStep(0);
        $$("[data-poster]", view).forEach(function (v) {
          if (!v.getAttribute("poster")) v.setAttribute("poster", v.getAttribute("data-poster"));
        });
      }
      else stopAutoPlay();
      current = name;
    }

    if (options.anchor) {
      window.requestAnimationFrame(function () { scrollToAnchor(options.anchor); });
    } else if (changed) {
      window.scrollTo(0, 0);
    }
  }

  function syncFromLocation() {
    var name = routeFromHash();
    if (name) { render(name); return; }
    var hash = (window.location.hash || "").replace(/^#/, "");
    if (hash && document.getElementById(hash)) { scrollToAnchor(hash); return; }
    if (current === null) render("overview");
  }

  /* ---------------- 详情抽屉 ---------------- */
  var drawer = null;
  var lastTrigger = null;
  function openDrawer(trigger) {
    drawer = drawer || $("#assetDrawer");
    if (!drawer) return;
    lastTrigger = trigger || null;
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    var target = drawer.querySelector("button, a, input");
    if (target) target.focus({ preventScroll: true });
  }
  function closeDrawer() {
    drawer = drawer || $("#assetDrawer");
    if (!drawer || !drawer.classList.contains("is-open")) return;
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    if (lastTrigger) { lastTrigger.focus({ preventScroll: true }); lastTrigger = null; }
  }

  /* 多选与批量操作 */
  var selecting = false;
  var selected = [];
  function syncDock() {
    var dock = $("#dock");
    var count = $("#dockCount");
    if (count) count.textContent = String(selected.length);
    if (dock) dock.classList.toggle("is-open", selecting && selected.length > 0);
    $$("[data-asset]").forEach(function (card) {
      var on = selected.indexOf(card) !== -1;
      card.classList.toggle("is-selected", on);
      var box = card.querySelector(".asset-check");
      if (box) box.setAttribute("aria-checked", on ? "true" : "false");
    });
    var grid = $(".asset-grid");
    if (grid) grid.classList.toggle("is-multi", selecting);
  }
  function toggleSelectMode(force) {
    selecting = typeof force === "boolean" ? force : !selecting;
    if (!selecting) selected = [];
    $$("[data-select-toggle]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", selecting ? "true" : "false");
      btn.classList.toggle("is-active", selecting);
    });
    syncDock();
    if (selecting) toast("已进入多选模式，点击素材加入批量操作");
  }

  /* 素材检索 */
  function applySearch(input) {
    var q = (input.value || "").trim().toLowerCase();
    var cards = $$("[data-asset]");
    var shown = 0;
    cards.forEach(function (card) {
      var text = (card.getAttribute("data-keywords") || "") + " " + card.textContent;
      var hit = !q || text.toLowerCase().indexOf(q) !== -1;
      card.hidden = !hit;
      if (hit) shown += 1;
    });
    var count = $("[data-result-count]");
    if (count) count.textContent = String(shown);
    var empty = $("#emptyResult");
    if (empty) empty.hidden = shown !== 0;
    var grid = $(".asset-grid");
    if (grid) grid.hidden = shown === 0;
  }

  /* ---------------- 客户端素材商店：选购清单 ---------------- */
  var cart = [{ sku: "DM-20260412-0031", title: "黄杨河落日", price: 480, license: "单次商用 · 4K 原片", qty: 1, img: "assets/img/river-dusk.svg" }];
  var shopFilter = "all";

  function money(n) { return "¥" + Number(n).toLocaleString("zh-CN"); }

  function cartTotal() {
    return cart.reduce(function (sum, item) { return sum + item.price * item.qty; }, 0);
  }

  function make(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (typeof text === "string") node.textContent = text;
    return node;
  }

  function cartRow(item, index) {
    var row = make("div", "cart__row");
    var thumb = make("span", "cart__thumb");
    var img = document.createElement("img");
    img.src = item.img || "assets/img/river-dusk.svg";
    img.alt = "";
    thumb.appendChild(img);

    var body = make("span", "cart__body");
    body.appendChild(make("span", "cart__title", item.title));
    body.appendChild(make("span", "cart__meta", item.license + " · × " + item.qty));
    var remove = make("button", "cart__remove", "移除");
    remove.type = "button";
    remove.setAttribute("data-cart-remove", String(index));
    remove.setAttribute("aria-label", "从选购清单移除：" + item.title);
    body.appendChild(remove);

    row.appendChild(thumb);
    row.appendChild(body);
    row.appendChild(make("span", "cart__price", money(item.price * item.qty)));
    return row;
  }

  function summaryLine(item) {
    var row = make("div", "checkout__line");
    var name = make("span", "checkout__line-name", item.title);
    name.appendChild(make("small", "", item.license + " · × " + item.qty));
    row.appendChild(name);
    row.appendChild(make("strong", "", money(item.price * item.qty)));
    return row;
  }

  function renderCart() {
    var list = $("#cartItems");
    if (!list) return;

    var qty = cart.reduce(function (sum, item) { return sum + item.qty; }, 0);
    var total = money(cartTotal());
    $$("[data-cart-count]").forEach(function (node) { node.textContent = String(qty); });
    var status = $("[data-cart-status]");
    if (status) status.textContent = qty + " 件";
    ["#cartTotal", "#checkoutTotal", "#shopSuccessTotal"].forEach(function (sel) {
      var node = $(sel);
      if (node) node.textContent = total;
    });

    list.textContent = "";
    cart.forEach(function (item, index) { list.appendChild(cartRow(item, index)); });
    list.hidden = cart.length === 0;
    var empty = $("#cartEmpty");
    if (empty) empty.hidden = cart.length !== 0;

    ["#checkoutItems", "#shopSuccessItems"].forEach(function (sel) {
      var box = $(sel);
      if (!box) return;
      box.textContent = "";
      cart.forEach(function (item) { box.appendChild(summaryLine(item)); });
    });

    var buy = $("[data-shop-buy]");
    if (buy) buy.disabled = cart.length === 0;
  }

  function addToCart(el) {
    var sku = el.getAttribute("data-sku") || "";
    var title = el.getAttribute("data-title") || "素材";
    var license = el.getAttribute("data-license") || "单次商用";
    var price = Number(el.getAttribute("data-price")) || 0;
    var card = el.closest("[data-sku-card]");
    var thumb = card ? card.querySelector(".sku__media img") : null;
    var found = null;
    cart.forEach(function (item) {
      if (item.sku === sku && item.license === license) found = item;
    });
    if (found) {
      found.qty += 1;
    } else {
      cart.push({ sku: sku, title: title, price: price, license: license, qty: 1, img: thumb ? thumb.getAttribute("src") : "" });
    }
    renderCart();
    toast("已加入选购清单：" + title);
  }

  function applyShopFilter() {
    var input = $("[data-shop-search]");
    var q = input ? (input.value || "").trim().toLowerCase() : "";
    var shown = 0;
    $$("[data-sku-card]").forEach(function (card) {
      var hitCat = shopFilter === "all" || card.getAttribute("data-cat") === shopFilter;
      var text = (card.getAttribute("data-keywords") || "") + " " + card.textContent;
      var hit = hitCat && (!q || text.toLowerCase().indexOf(q) !== -1);
      card.hidden = !hit;
      if (hit) shown += 1;
    });
    var count = $("[data-shop-count]");
    if (count) count.textContent = String(shown);
    var grid = $(".shelf__grid");
    if (grid) grid.hidden = shown === 0;
    var empty = $("#shopEmpty");
    if (empty) empty.hidden = shown !== 0;
  }

  function shopBuy() {
    if (!cart.length) { toast("选购清单为空，先挑一件素材"); return; }
    var checkout = $("#shopCheckout");
    var success = $("#shopSuccess");
    if (checkout) checkout.hidden = true;
    if (success) {
      success.hidden = false;
      success.focus({ preventScroll: true });
      success.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    toast("支付成功，授权凭证已生成");
  }

  renderCart();

  /* ---------------- 智能体演示播放器 ---------------- */
  var demoStep = 0;
  var demoMax = 0;
  var demoScenario = "ops";
  var demoTimer = null;

  function demoFlow(stage) {
    return $('.dm-flow[data-scenario="' + demoScenario + '"]', stage);
  }

  function setScenario(name) {
    var stage = $("#demoStage");
    if (!stage) return;
    demoScenario = name;
    stage.setAttribute("data-scenario", name);
    $$("[data-scenario]", stage).forEach(function (el) {
      el.hidden = el.getAttribute("data-scenario") !== name;
    });
    $$("[data-demo-scenario]").forEach(function (btn) {
      var on = btn.getAttribute("data-demo-scenario") === name;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    setDemoStep(0);
  }

  function stopAutoPlay() {
    if (demoTimer) { window.clearInterval(demoTimer); demoTimer = null; }
    var btn = $("[data-demo-play]");
    if (btn) {
      btn.textContent = "自动播放";
      btn.setAttribute("aria-pressed", "false");
    }
  }

  function toggleAutoPlay() {
    if (demoTimer) { stopAutoPlay(); return; }
    var btn = $("[data-demo-play]");
    if (btn) {
      btn.textContent = "暂停播放";
      btn.setAttribute("aria-pressed", "true");
    }
    if (demoStep >= demoMax) setDemoStep(0);
    demoTimer = window.setInterval(function () {
      if (demoStep >= demoMax) { stopAutoPlay(); return; }
      setDemoStep(demoStep + 1);
    }, 2200);
  }

  function setDemoStep(step) {
    var stage = $("#demoStage");
    if (!stage) return;
    var flow = demoFlow(stage);
    var list = $('.stage__caps[data-scenario="' + demoScenario + '"]', stage);
    var caps = list ? $$("[data-cap]", list) : [];
    demoMax = caps.length ? caps.length - 1 : 0;
    demoStep = Math.max(0, Math.min(demoMax, step));
    stage.setAttribute("data-step", String(demoStep));
    if (flow) {
      $$("[data-from]", flow).forEach(function (el) {
        var from = parseInt(el.getAttribute("data-from"), 10) || 0;
        var to = el.hasAttribute("data-to") ? parseInt(el.getAttribute("data-to"), 10) : demoMax;
        var on = demoStep >= from && demoStep <= to;
        el.classList.toggle("is-on", on);
        if (el.hasAttribute("aria-hidden")) el.setAttribute("aria-hidden", on ? "false" : "true");
      });
    }
    caps.forEach(function (cap, i) {
      cap.classList.toggle("is-active", i === demoStep);
      if (i === demoStep) cap.setAttribute("aria-current", "step");
      else cap.removeAttribute("aria-current");
    });
    var bar = $("[data-demo-progress]", stage);
    if (bar) bar.style.transform = "scaleX(" + ((demoStep + 1) / (demoMax + 1)).toFixed(4) + ")";
    var label = $("[data-demo-count]");
    if (label) label.textContent = (demoStep + 1) + " / " + (demoMax + 1);
    var prev = $("[data-demo-prev]");
    if (prev) prev.disabled = demoStep === 0;
    var next = $("[data-demo-next]");
    if (next) next.disabled = demoStep === demoMax;
    var scroller = $("[data-demo-scroll]", stage);
    if (scroller) {
      window.requestAnimationFrame(function () { scroller.scrollTop = scroller.scrollHeight; });
    }
  }

  /* ---------------- 事件委托 ---------------- */
  document.addEventListener("click", function (event) {
    var el = event.target.closest("[data-goto], [data-add-cart], [data-cart-remove], [data-shop-filter], [data-shop-reset], [data-shop-buy], [data-drawer-open], [data-drawer-close], [data-select-toggle], [data-dock-clear], [data-dock-action], [data-view], [data-toast], [data-channel], [data-role], [data-option], [data-buy], [data-copy], [data-log-toggle], [data-scene], [data-reset], [data-thumb], [data-tab], [data-demo-next], [data-demo-prev], [data-demo-reset], [data-demo-jump], [data-demo-play], [data-demo-scenario]");
    if (!el) return;

    if (el.hasAttribute("data-goto")) {
      event.preventDefault();
      render(routeName(el.getAttribute("href") || "") || current, { anchor: el.getAttribute("data-goto") });
    }

    if (el.hasAttribute("data-add-cart")) { event.preventDefault(); addToCart(el); return; }
    if (el.hasAttribute("data-cart-remove")) {
      event.preventDefault();
      var removeIndex = parseInt(el.getAttribute("data-cart-remove"), 10);
      if (cart[removeIndex]) {
        var removedTitle = cart[removeIndex].title;
        cart.splice(removeIndex, 1);
        renderCart();
        toast("已移除：" + removedTitle);
      }
      return;
    }
    if (el.hasAttribute("data-shop-filter")) {
      event.preventDefault();
      shopFilter = el.getAttribute("data-shop-filter");
      $$("[data-shop-filter]").forEach(function (btn) {
        var on = btn === el;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
      applyShopFilter();
      return;
    }
    if (el.hasAttribute("data-shop-reset")) {
      event.preventDefault();
      shopFilter = "all";
      $$("[data-shop-filter]").forEach(function (btn) {
        var on = btn.getAttribute("data-shop-filter") === "all";
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
      var shopSearch = $("[data-shop-search]");
      if (shopSearch) shopSearch.value = "";
      applyShopFilter();
      return;
    }
    if (el.hasAttribute("data-shop-buy")) { event.preventDefault(); shopBuy(); return; }

    if (el.hasAttribute("data-demo-next")) { event.preventDefault(); setDemoStep(demoStep + 1); return; }
    if (el.hasAttribute("data-demo-prev")) { event.preventDefault(); setDemoStep(demoStep - 1); return; }
    if (el.hasAttribute("data-demo-reset")) { event.preventDefault(); setDemoStep(0); return; }
    if (el.hasAttribute("data-demo-jump")) { event.preventDefault(); setDemoStep(parseInt(el.getAttribute("data-demo-jump"), 10)); return; }
    if (el.hasAttribute("data-demo-play")) { event.preventDefault(); toggleAutoPlay(); return; }
    if (el.hasAttribute("data-demo-scenario")) {
      event.preventDefault();
      stopAutoPlay();
      setScenario(el.getAttribute("data-demo-scenario"));
      return;
    }

    if (el.hasAttribute("data-tab")) {
      event.preventDefault();
      var set = el.closest("[data-tabset]");
      if (set) {
        var key = el.getAttribute("data-tab");
        $$("[data-tab]", set).forEach(function (btn) {
          btn.classList.toggle("is-active", btn === el);
          btn.setAttribute("aria-selected", btn === el ? "true" : "false");
        });
        $$("[data-tab-panel]", set).forEach(function (panel) {
          panel.hidden = panel.getAttribute("data-tab-panel") !== key;
        });
      }
      return;
    }

    if (el.hasAttribute("data-drawer-open")) {
      event.preventDefault();
      var card = el.closest("[data-asset]");
      if (selecting && card) {
        var idx = selected.indexOf(card);
        if (idx === -1) selected.push(card); else selected.splice(idx, 1);
        syncDock();
        return;
      }
      openDrawer(el);
      return;
    }
    if (el.hasAttribute("data-drawer-close")) { event.preventDefault(); closeDrawer(); return; }
    if (el.hasAttribute("data-select-toggle")) {
      event.preventDefault();
      var mode = el.getAttribute("data-select-toggle");
      if (mode === "on" || mode === "off") toggleSelectMode(mode === "on");
      else toggleSelectMode();
      return;
    }
    if (el.hasAttribute("data-dock-clear")) { event.preventDefault(); selected = []; toggleSelectMode(false); return; }
    if (el.hasAttribute("data-dock-action")) {
      event.preventDefault();
      toast(el.getAttribute("data-dock-action") + "：" + selected.length + " 件素材");
      selected = [];
      toggleSelectMode(false);
      return;
    }
    if (el.hasAttribute("data-view")) {
      event.preventDefault();
      var view = el.getAttribute("data-view");
      $$("[data-view]").forEach(function (b) { b.classList.toggle("is-active", b === el); });
      var grid = $(".asset-grid");
      if (grid) grid.classList.toggle("is-list", view === "list");
      return;
    }
    if (el.hasAttribute("data-toast")) { event.preventDefault(); toast(el.getAttribute("data-toast")); return; }
    if (el.hasAttribute("data-channel")) {
      event.preventDefault();
      $$("[data-channel]").forEach(function (b) { b.classList.toggle("is-active", b === el); });
      $$("[data-channel-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-channel-panel") !== el.getAttribute("data-channel"); });
      return;
    }
    if (el.hasAttribute("data-role")) {
      event.preventDefault();
      $$("[data-role]").forEach(function (b) { b.classList.toggle("is-active", b === el); });
      var hint = $("#roleHint");
      if (hint) hint.textContent = el.getAttribute("data-role") + "演示视图：登录后仅显示该角色的可用范围。";
      return;
    }
    if (el.hasAttribute("data-option")) {
      event.preventDefault();
      var group = el.getAttribute("data-group");
      $$('[data-option][data-group="' + group + '"]').forEach(function (b) {
        b.classList.toggle("is-selected", b === el);
        b.setAttribute("aria-pressed", b === el ? "true" : "false");
      });
      var total = $("#orderTotal");
      if (total) total.textContent = "¥" + Number(el.getAttribute("data-price")).toLocaleString("zh-CN");
      return;
    }
    if (el.hasAttribute("data-buy")) {
      event.preventDefault();
      var purchase = $("#purchasePanel");
      var success = $("#successPanel");
      if (purchase) purchase.hidden = true;
      if (success) { success.hidden = false; success.focus(); }
      var order = ["preview", "rights", "pay", "done"];
      $$("[data-buy-step]").forEach(function (s) {
        var i = order.indexOf(s.getAttribute("data-buy-step"));
        s.classList.toggle("is-done", i < order.length - 1);
        s.classList.toggle("is-current", i === order.length - 1);
      });
      return;
    }
    if (el.hasAttribute("data-copy")) {
      event.preventDefault();
      var value = el.getAttribute("data-copy");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).catch(function () {});
      }
      toast("链接已复制，可直接发送给客户");
      return;
    }
    if (el.hasAttribute("data-log-toggle")) {
      event.preventDefault();
      var detail = document.getElementById(el.getAttribute("data-log-toggle"));
      if (detail) {
        detail.hidden = !detail.hidden;
        el.setAttribute("aria-expanded", detail.hidden ? "false" : "true");
      }
      return;
    }
    if (el.hasAttribute("data-scene")) {
      event.preventDefault();
      $$("[data-scene]").forEach(function (b) { b.classList.toggle("is-active", b === el); });
      $$("[data-scene-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-scene-panel") !== el.getAttribute("data-scene"); });
      return;
    }
    if (el.hasAttribute("data-reset")) {
      event.preventDefault();
      var input = $("[data-search]");
      if (input) { input.value = ""; applySearch(input); input.focus(); }
      return;
    }
    if (el.hasAttribute("data-thumb")) {
      event.preventDefault();
      $$("[data-thumb]").forEach(function (b) { b.classList.toggle("is-active", b === el); });
      var hero = $("#storeHero");
      if (hero) hero.src = el.getAttribute("data-thumb");
      return;
    }
  });

  document.addEventListener("click", function (event) {
    if (selecting && !event.target.closest("[data-drawer-open]")) {
      var card = event.target.closest("[data-asset]");
      if (card && !event.target.closest("a, button")) {
        event.preventDefault();
        var i = selected.indexOf(card);
        if (i === -1) selected.push(card); else selected.splice(i, 1);
        syncDock();
      }
    }
  });

  document.addEventListener("input", function (event) {
    if (event.target.matches("[data-search]")) applySearch(event.target);
    if (event.target.matches("[data-shop-search]")) applyShopFilter();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeDrawer();
      if (selecting) toggleSelectMode(false);
    }
    if (current !== "agent") return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    var tag = (event.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (event.key === "ArrowRight") { event.preventDefault(); setDemoStep(demoStep + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); setDemoStep(demoStep - 1); }
  });

  $$("[data-drawer-close]").forEach(function (btn) {
    btn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") closeDrawer();
    });
  });

  window.addEventListener("hashchange", syncFromLocation);
  render(routeFromHash() || "overview");
})();
