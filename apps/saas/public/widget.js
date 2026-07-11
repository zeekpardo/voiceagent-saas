/**
 * Voice widget embed loader. Hand-written, dependency-free, no build step.
 *
 * TWO install shapes are supported:
 *
 *   1. Config-by-ID (current) — the widget's look/targeting/behavior live in a
 *      saved record; editing it in the Studio goes live without re-pasting:
 *        <script src="https://app.example.com/widget.js"
 *                data-widget-id="wgt_..." async></script>
 *      The loader fetches /api/widget/config/{id}, evaluates the targeting
 *      rules against the current page, and (if allowed) mounts the chosen
 *      chrome + wires the auto-open behavior triggers.
 *
 *   2. Legacy attributes (back-compat) — everything rides on data-attributes;
 *      used by installs made before the Studio. Unchanged:
 *        <script src="…/widget.js" data-widget-token="…"
 *                data-style data-position data-accent data-target
 *                data-visualizer data-voice data-chat async></script>
 *
 * Either way the loader injects an iframe pointing at `${scriptOrigin}/widget/
 * embed` and talks to it over postMessage (origin-checked):
 *   { type: "voice-widget:ready" }  — app booted
 *   { type: "voice-widget:close" }  — collapse the widget
 */
(function () {
	"use strict";

	if (window.__voiceWidget) return;
	window.__voiceWidget = true;

	var script =
		document.currentScript ||
		document.querySelector("script[data-widget-id]") ||
		document.querySelector("script[data-widget-token]");
	if (!script || !script.src) return;

	var origin = new URL(script.src).origin;
	var widgetId = script.getAttribute("data-widget-id");
	var legacyToken = script.getAttribute("data-widget-token");

	var Z = "2147483000";
	var isOpen = false;
	var setOpen = null; // per-style open/close implementation
	var cancelTriggers = function () {}; // teardown for pending auto-open triggers

	// ---- targeting (mirrors packages/api/.../widget-config.ts) -------------

	function patternMatches(pattern, url) {
		var trimmed = (pattern || "").trim();
		if (!trimmed) return false;
		var haystack = url.toLowerCase();
		var needle = trimmed.toLowerCase();
		if (needle.indexOf("*") === -1) return haystack.indexOf(needle) !== -1;
		var escaped = needle
			.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
			.split("\\*")
			.join(".*");
		try {
			return new RegExp(escaped).test(haystack);
		} catch {
			return false;
		}
	}

	function patternsOf(rules) {
		var out = [];
		for (var i = 0; i < (rules || []).length; i++) {
			var p = rules[i] && rules[i].pattern;
			if (p && String(p).trim() !== "") out.push(String(p));
		}
		return out;
	}

	function targetingAllows(url, targeting) {
		targeting = targeting || {};
		var includes = patternsOf(targeting.include);
		var excludes = patternsOf(targeting.exclude);
		for (var i = 0; i < excludes.length; i++) {
			if (patternMatches(excludes[i], url)) return false;
		}
		if (includes.length === 0) return true;
		for (var j = 0; j < includes.length; j++) {
			if (patternMatches(includes[j], url)) return true;
		}
		return false;
	}

	// ---- iframe + chrome ---------------------------------------------------

	function makeIframe(query, width, height) {
		var frame = document.createElement("iframe");
		frame.src = origin + "/widget/embed?" + query;
		frame.allow = "microphone; autoplay";
		frame.title = "Voice assistant";
		frame.style.cssText =
			"border:0;display:block;width:" + width + ";height:" + height + ";background:#fff;";
		return frame;
	}

	function css(el, text) {
		el.style.cssText += text;
		return el;
	}

	var CHAT_ICON =
		'<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

	function mountBubble(cfg, query) {
		var side = cfg.position + ":20px;";
		var panel = css(
			document.createElement("div"),
			"position:fixed;bottom:96px;" +
				side +
				"z-index:" +
				Z +
				";width:380px;max-width:calc(100vw - 40px);height:600px;max-height:calc(100vh - 120px);" +
				"border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.24);display:none;",
		);
		panel.appendChild(makeIframe(query, "100%", "100%"));

		var button = css(
			document.createElement("button"),
			"position:fixed;bottom:20px;" +
				side +
				"z-index:" +
				Z +
				";width:64px;height:64px;border-radius:50%;border:0;cursor:pointer;color:#fff;" +
				"background:" +
				cfg.accent +
				";box-shadow:0 6px 20px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;",
		);
		button.type = "button";
		button.setAttribute("aria-label", "Open voice assistant");
		button.innerHTML = CHAT_ICON;

		setOpen = function (open) {
			isOpen = open;
			panel.style.display = open ? "block" : "none";
			button.setAttribute("aria-label", open ? "Close voice assistant" : "Open voice assistant");
		};
		button.addEventListener("click", function () {
			cancelTriggers();
			setOpen(!isOpen);
		});
		document.body.appendChild(panel);
		document.body.appendChild(button);
	}

	function mountPanel(cfg, query) {
		var drawer = css(
			document.createElement("div"),
			"position:fixed;top:0;bottom:0;" +
				cfg.position +
				":0;z-index:" +
				Z +
				";width:400px;max-width:calc(100vw - 48px);box-shadow:0 0 32px rgba(0,0,0,.2);" +
				"transition:transform .25s ease;transform:translateX(" +
				(cfg.position === "right" ? "100%" : "-100%") +
				");",
		);
		drawer.appendChild(makeIframe(query, "100%", "100%"));

		var tab = css(
			document.createElement("button"),
			"position:fixed;top:50%;" +
				cfg.position +
				":0;z-index:" +
				Z +
				";transform:translateY(-50%);border:0;cursor:pointer;color:#fff;background:" +
				cfg.accent +
				";padding:14px 8px;writing-mode:vertical-rl;font:600 13px/1 sans-serif;letter-spacing:.06em;" +
				"border-radius:" +
				(cfg.position === "right" ? "8px 0 0 8px" : "0 8px 8px 0") +
				";box-shadow:0 4px 14px rgba(0,0,0,.2);",
		);
		tab.type = "button";
		tab.textContent = "Chat";
		tab.setAttribute("aria-label", "Open voice assistant");

		setOpen = function (open) {
			isOpen = open;
			drawer.style.transform = open
				? "translateX(0)"
				: "translateX(" + (cfg.position === "right" ? "100%" : "-100%") + ")";
			tab.style.display = open ? "none" : "block";
		};
		tab.addEventListener("click", function () {
			cancelTriggers();
			setOpen(true);
		});
		document.body.appendChild(drawer);
		document.body.appendChild(tab);
	}

	function mountBar(cfg, query) {
		var wrap = css(
			document.createElement("div"),
			"position:fixed;left:0;right:0;bottom:0;z-index:" +
				Z +
				";height:56px;transition:height .25s ease;box-shadow:0 -8px 30px rgba(0,0,0,.2);overflow:hidden;",
		);
		var frame = makeIframe(query, "100%", "calc(100% - 56px)");
		frame.style.display = "none";

		var bar = css(
			document.createElement("button"),
			"width:100%;height:56px;border:0;cursor:pointer;color:#fff;background:" +
				cfg.accent +
				";display:flex;align-items:center;justify-content:center;gap:10px;font:600 15px/1 sans-serif;",
		);
		bar.type = "button";
		bar.innerHTML = CHAT_ICON + "<span>Chat with us</span>";
		bar.setAttribute("aria-label", "Open voice assistant");

		setOpen = function (open) {
			isOpen = open;
			wrap.style.height = open ? "min(480px, 80vh)" : "56px";
			frame.style.display = open ? "block" : "none";
		};
		bar.addEventListener("click", function () {
			cancelTriggers();
			setOpen(!isOpen);
		});
		wrap.appendChild(bar);
		wrap.appendChild(frame);
		document.body.appendChild(wrap);
	}

	function mountCard(cfg, query) {
		// The inline card needs a host element on the page. When it's missing
		// (common right after switching a saved widget to Card without editing
		// the site), degrade to the floating bubble instead of mounting nothing.
		var host = cfg.target ? document.querySelector(cfg.target) : null;
		if (!host) {
			console.warn(
				"[voice-widget] card style needs " +
					(cfg.target || "a data-target element") +
					' on the page (e.g. <div id="voice-widget"></div>); falling back to bubble',
			);
			mountBubble(cfg, query);
			return;
		}
		var card = css(
			document.createElement("div"),
			"width:100%;max-width:380px;height:520px;border-radius:16px;overflow:hidden;" +
				"box-shadow:0 8px 30px rgba(0,0,0,.16);",
		);
		card.appendChild(makeIframe(query, "100%", "100%"));
		host.appendChild(card);
		setOpen = function () {}; // inline card has no collapsed state
	}

	function mountChrome(cfg, query) {
		if (cfg.style === "panel") mountPanel(cfg, query);
		else if (cfg.style === "bar") mountBar(cfg, query);
		else if (cfg.style === "card") mountCard(cfg, query);
		else mountBubble(cfg, query);
	}

	// ---- auto-open behavior triggers (config-by-id path only) --------------

	function wireTriggers(id, behavior) {
		behavior = behavior || {};
		var key = "vw:" + id + ":autoopen";
		var already = false;
		try {
			already = sessionStorage.getItem(key) === "1";
		} catch {
			already = false;
		}

		var timer = null;
		var onMouseOut = null;
		var onScroll = null;

		cancelTriggers = function () {
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
			if (onMouseOut) {
				document.removeEventListener("mouseout", onMouseOut);
				onMouseOut = null;
			}
			if (onScroll) {
				window.removeEventListener("scroll", onScroll);
				onScroll = null;
			}
		};

		if (already) return; // fire at most once per visitor session

		function autoOpen() {
			try {
				sessionStorage.setItem(key, "1");
			} catch {
				/* ignore */
			}
			cancelTriggers();
			if (setOpen && !isOpen) setOpen(true);
		}

		var exit = behavior.exitIntent;
		if (exit && exit.enabled) {
			onMouseOut = function (e) {
				if (e.clientY <= 0) autoOpen();
			};
			document.addEventListener("mouseout", onMouseOut);
		}

		var time = behavior.timeOnPage;
		if (time && time.enabled) {
			var secs = typeof time.seconds === "number" ? time.seconds : 20;
			timer = setTimeout(autoOpen, Math.max(1, secs) * 1000);
		}

		var scroll = behavior.scrollPercent;
		if (scroll && scroll.enabled) {
			var pct = typeof scroll.percent === "number" ? scroll.percent : 50;
			onScroll = function () {
				var doc = document.documentElement;
				var scrollable = doc.scrollHeight - doc.clientHeight;
				var reached = scrollable <= 0 ? 100 : (doc.scrollTop / scrollable) * 100;
				if (reached >= pct) autoOpen();
			};
			window.addEventListener("scroll", onScroll, { passive: true });
		}
	}

	// ---- postMessage bridge ------------------------------------------------

	window.addEventListener("message", function (event) {
		if (event.origin !== origin) return;
		var data = event.data;
		if (!data || typeof data.type !== "string") return;
		if (data.type === "voice-widget:close" && setOpen) {
			cancelTriggers();
			setOpen(false);
		}
		// "voice-widget:ready" / "voice-widget:resize" are accepted no-ops for now.
	});

	// ---- boot: legacy attr path vs config-by-id path -----------------------

	function bootLegacy() {
		var style = script.getAttribute("data-style") || "bubble";
		if (["bubble", "card", "panel", "bar"].indexOf(style) === -1) style = "bubble";
		var cfg = {
			style: style,
			position: script.getAttribute("data-position") === "left" ? "left" : "right",
			accent: script.getAttribute("data-accent") || "#6366f1",
			target: script.getAttribute("data-target"),
		};
		var visualizer = script.getAttribute("data-visualizer") || "bars";
		if (["bars", "pulse", "waveform", "dots"].indexOf(visualizer) === -1) visualizer = "bars";
		var voiceEnabled = script.getAttribute("data-voice") !== "false";
		var chatEnabled = script.getAttribute("data-chat") !== "false";
		var query =
			"token=" +
			encodeURIComponent(legacyToken) +
			"&style=" +
			encodeURIComponent(style) +
			"&accent=" +
			encodeURIComponent(cfg.accent) +
			"&visualizer=" +
			encodeURIComponent(visualizer) +
			(voiceEnabled ? "" : "&voice=false") +
			(chatEnabled ? "" : "&chat=false");
		mountChrome(cfg, query);
	}

	function bootFromConfig(config) {
		if (!targetingAllows(window.location.href, config.targeting)) return; // not this page
		var a = config.appearance || {};
		var style = ["bubble", "card", "panel", "bar"].indexOf(a.style) !== -1 ? a.style : "bubble";
		var cfg = {
			style: style,
			position: a.position === "left" ? "left" : "right",
			accent: a.accent || "#6366f1",
			// The card style needs a host element; a saved widget has no selector,
			// so it falls back to the conventional #voice-widget.
			target: "#voice-widget",
		};
		// The embed app fetches the same config by id for its own appearance; we
		// only forward the id and token (token lets it start a session without a
		// second round-trip).
		var query =
			"widgetId=" +
			encodeURIComponent(widgetId) +
			(config.token ? "&token=" + encodeURIComponent(config.token) : "");
		mountChrome(cfg, query);
		// Inline cards are always visible, so auto-open triggers are meaningless.
		if (style !== "card") wireTriggers(widgetId, config.behavior);
	}

	function boot() {
		// Legacy attr install wins when data-widget-token is present (and no id),
		// so existing snippets keep working untouched.
		if (legacyToken && !widgetId) {
			bootLegacy();
			return;
		}
		if (!widgetId) {
			console.error("[voice-widget] data-widget-id (or legacy data-widget-token) is required");
			return;
		}
		fetch(origin + "/api/widget/config/" + encodeURIComponent(widgetId))
			.then(function (res) {
				if (!res.ok) throw new Error("config " + res.status);
				return res.json();
			})
			.then(bootFromConfig)
			.catch(function (err) {
				console.error("[voice-widget] could not load widget config:", err);
			});
	}

	if (document.body) boot();
	else document.addEventListener("DOMContentLoaded", boot);
})();
