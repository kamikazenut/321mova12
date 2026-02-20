"use client";

import { useEffect, useState } from "react";

const CHECK_DELAY_MS = 150;
const SCRIPT_PROBE_TIMEOUT_MS = 2000;
const RECHECK_INTERVAL_MS = 5000;

const BAIT_SELECTORS = [
  { id: "ad_banner", className: "adsbox ad-banner ad-placement textads pub_300x250" },
  { id: "google_ads_iframe_1", className: "advertisement sponsored promoted" },
];

const LOCAL_PROBE_SCRIPT_URLS = [
  "/ads.js",
  "/adservice.js",
  "/banner-ad.js",
  "/prebid-ads.js",
];

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const ensureBodyReady = async () => {
  if (typeof document === "undefined") return;
  if (document.body) return;

  for (let i = 0; i < 10; i += 1) {
    await wait(50);
    if (document.body) return;
  }
};

const isElementBlocked = (element: HTMLElement): boolean => {
  const style = window.getComputedStyle(element);

  return (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0" ||
    element.offsetHeight === 0 ||
    element.offsetWidth === 0
  );
};

const detectByBait = async (): Promise<boolean> => {
  await ensureBodyReady();
  if (!document.body) return false;

  if (typeof window === "undefined" || typeof document === "undefined") return false;

  const baits = BAIT_SELECTORS.map(({ id, className }) => {
    const bait = document.createElement("div");
    bait.id = id;
    bait.className = className;
    bait.setAttribute("aria-hidden", "true");
    bait.style.cssText =
      "position:absolute;left:-9999px;top:-9999px;width:10px;height:10px;pointer-events:none;";
    document.body.appendChild(bait);
    return bait;
  });

  await wait(CHECK_DELAY_MS);

  const blocked = baits.some((bait) => !bait.isConnected || isElementBlocked(bait));

  baits.forEach((bait) => {
    if (bait.isConnected) bait.remove();
  });
  return blocked;
};

const detectByScriptProbe = (url: string): Promise<boolean> =>
  new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(false);
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = `${url}?cb=${Date.now()}`;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";

    let settled = false;
    const settle = (blocked: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if (script.parentNode) script.parentNode.removeChild(script);
      resolve(blocked);
    };

    // Timeout is treated as unknown (not blocked) to reduce false positives.
    const timeoutId = window.setTimeout(() => settle(false), SCRIPT_PROBE_TIMEOUT_MS);
    script.onload = () => settle(false);
    script.onerror = () => settle(true);

    (document.head || document.documentElement).appendChild(script);
  });

const detectAdBlock = async (): Promise<boolean> => {
  if (typeof window === "undefined" || typeof document === "undefined") return false;

  const baitBlocked = await detectByBait();
  const localProbeResults = await Promise.all(
    LOCAL_PROBE_SCRIPT_URLS.map((url) => detectByScriptProbe(url)),
  );

  const localBlocked = localProbeResults.some(Boolean);

  // Enforce based on first-party/local signals only.
  return baitBlocked || localBlocked;
};

const useAdBlockDetector = () => {
  const [isAdBlockDetected, setIsAdBlockDetected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let disposed = false;

    const runDetection = async () => {
      try {
        const blocked = await detectAdBlock();
        if (!disposed) setIsAdBlockDetected(blocked);
      } finally {
        if (!disposed) setIsChecking(false);
      }
    };

    void runDetection();
    const intervalId = window.setInterval(() => {
      void runDetection();
    }, RECHECK_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return { isAdBlockDetected, isChecking };
};

export default useAdBlockDetector;
