/**
 * Voice widget embed loader. Hand-written, dependency-free, no build step.
 *
 * Usage (pasted on any website):
 *   <script src="https://app.example.com/widget.js"
 *           data-widget-token="..."        (required)
 *           data-style="bubble|card|panel|bar"  (default bubble)
 *           data-position="left|right"     (default right)
 *           data-accent="#6366f1"          (any CSS color)
 *           data-target="#voice-widget"    (required for card)
 *           async></script>
 *
 * The loader draws lightweight chrome (launcher button / drawer tab / bar)
 * and injects an iframe pointing at `${scriptOrigin}/widget/embed`. The iframe
 * app talks back over postMessage (origin-checked):
 *   { type: "voice-widget:ready" }  — app booted
 *   { type: "voice-widget:close" }  — collapse the widget
 */
(function () {
	"use strict";

	if (window.__voiceWidget) return;
	window.__voiceWidget = true;

	var script = document.currentScript || document.querySelector("script[data-widget-token]");
	if (!script || !script.src) return;

	var token = script.getAttribute("data-widget-token");
	if (!token) {
		console.error("[voice-widget] data-widget-token is required");
		return;
	}

	var origin = new URL(script.src).origin;
	var style = script.getAttribute("data-style") || "bubble";
	if (["bubble", "card", "panel", "bar"].indexOf(style) === -1) style = "bubble";
	var position = script.getAttribute("data-position") === "left" ? "left" : "right";
	var accent = script.getAttribute("data-accent") || "#6366f1";
	var target = script.getAttribute("data-target");

	var Z = "2147483000";
	var isOpen = false;
	var setOpen = null; // per-style open/close implementation

	function makeIframe(width, height) {
		var frame = document.createElement("iframe");
		frame.src =
			origin +
			"/widget/embed?token=" +
			encodeURIComponent(token) +
			"&style=" +
			encodeURIComponent(style) +
			"&accent=" +
			encodeURIComponent(accent);
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

	function mountBubble() {
		var side = position + ":20px;";
		var panel = css(
			document.createElement("div"),
			"position:fixed;bottom:96px;" +
				side +
				"z-index:" +
				Z +
				";width:380px;max-width:calc(100vw - 40px);height:600px;max-height:calc(100vh - 120px);" +
				"border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.24);display:none;",
		);
		panel.appendChild(makeIframe("100%", "100%"));

		var button = css(
			document.createElement("button"),
			"position:fixed;bottom:20px;" +
				side +
				"z-index:" +
				Z +
				";width:64px;height:64px;border-radius:50%;border:0;cursor:pointer;color:#fff;" +
				"background:" +
				accent +
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
			setOpen(!isOpen);
		});
		document.body.appendChild(panel);
		document.body.appendChild(button);
	}

	function mountPanel() {
		var drawer = css(
			document.createElement("div"),
			"position:fixed;top:0;bottom:0;" +
				position +
				":0;z-index:" +
				Z +
				";width:400px;max-width:calc(100vw - 48px);box-shadow:0 0 32px rgba(0,0,0,.2);" +
				"transition:transform .25s ease;transform:translateX(" +
				(position === "right" ? "100%" : "-100%") +
				");",
		);
		drawer.appendChild(makeIframe("100%", "100%"));

		var tab = css(
			document.createElement("button"),
			"position:fixed;top:50%;" +
				position +
				":0;z-index:" +
				Z +
				";transform:translateY(-50%);border:0;cursor:pointer;color:#fff;background:" +
				accent +
				";padding:14px 8px;writing-mode:vertical-rl;font:600 13px/1 sans-serif;letter-spacing:.06em;" +
				"border-radius:" +
				(position === "right" ? "8px 0 0 8px" : "0 8px 8px 0") +
				";box-shadow:0 4px 14px rgba(0,0,0,.2);",
		);
		tab.type = "button";
		tab.textContent = "Chat";
		tab.setAttribute("aria-label", "Open voice assistant");

		setOpen = function (open) {
			isOpen = open;
			drawer.style.transform = open
				? "translateX(0)"
				: "translateX(" + (position === "right" ? "100%" : "-100%") + ")";
			tab.style.display = open ? "none" : "block";
		};
		tab.addEventListener("click", function () {
			setOpen(true);
		});
		document.body.appendChild(drawer);
		document.body.appendChild(tab);
	}

	function mountBar() {
		var wrap = css(
			document.createElement("div"),
			"position:fixed;left:0;right:0;bottom:0;z-index:" +
				Z +
				";height:56px;transition:height .25s ease;box-shadow:0 -8px 30px rgba(0,0,0,.2);overflow:hidden;",
		);
		var frame = makeIframe("100%", "calc(100% - 56px)");
		frame.style.display = "none";

		var bar = css(
			document.createElement("button"),
			"width:100%;height:56px;border:0;cursor:pointer;color:#fff;background:" +
				accent +
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
			setOpen(!isOpen);
		});
		wrap.appendChild(bar);
		wrap.appendChild(frame);
		document.body.appendChild(wrap);
	}

	function mountCard() {
		if (!target) {
			console.error('[voice-widget] data-target is required for data-style="card"');
			return;
		}
		var host = document.querySelector(target);
		if (!host) {
			console.error("[voice-widget] no element matches data-target " + target);
			return;
		}
		var card = css(
			document.createElement("div"),
			"width:100%;max-width:380px;height:520px;border-radius:16px;overflow:hidden;" +
				"box-shadow:0 8px 30px rgba(0,0,0,.16);",
		);
		card.appendChild(makeIframe("100%", "100%"));
		host.appendChild(card);
		setOpen = function () {}; // inline card has no collapsed state
	}

	window.addEventListener("message", function (event) {
		if (event.origin !== origin) return;
		var data = event.data;
		if (!data || typeof data.type !== "string") return;
		if (data.type === "voice-widget:close" && setOpen) setOpen(false);
		// "voice-widget:ready" / "voice-widget:resize" are accepted no-ops for now.
	});

	function mount() {
		if (style === "panel") mountPanel();
		else if (style === "bar") mountBar();
		else if (style === "card") mountCard();
		else mountBubble();
	}

	if (document.body) mount();
	else document.addEventListener("DOMContentLoaded", mount);
})();
