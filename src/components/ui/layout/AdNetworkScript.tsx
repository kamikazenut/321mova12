"use client";

import useSupabaseUser from "@/hooks/useSupabaseUser";
import { isPremiumUser } from "@/utils/billing/premium";
import Script from "next/script";

const AdNetworkScript: React.FC = () => {
  const { data: user, isLoading } = useSupabaseUser();
  const isPremium = isPremiumUser(user);

  if (isLoading || isPremium) return null;

  return (
    <Script id="hilltop-popunder-tag" strategy="afterInteractive" data-cfasync="false">
      {`(function () {
  var w = window;
  var host = (w.location && w.location.hostname ? w.location.hostname : "")
    .replace(/^www\\./, "")
    .toLowerCase();

  var cfg = null;

  if (host === "321movies.co.uk") {
    cfg = {
      key: "d4dadf4ac0249b48573aa288a24eb9e6",
      opts: [
        ["siteId", 551 - 506 * 110 + 5178981],
        ["minBid", 0],
        ["popundersPerIP", "0"],
        ["delayBetween", 0],
        ["default", false],
        ["defaultPerDay", 0],
        ["topmostLayer", "auto"],
      ],
      assets: [
        "d3d3LnByZW1pdW12ZXJ0aXNpbmcuY29tL2xib290c3RyYXAtbXVsdGlzZWxlY3QubWluLmNzcw==",
        "ZDJqMDQyY2oxNDIxd2kuY2xvdWRmcm9udC5uZXQvR3l3cy9qanF1ZXJ5LmlzLm1pbi5qcw==",
      ],
      cutoff: 1798028575000,
    };
  } else if (host === "321movies.xyz") {
    cfg = {
      key: "a41ea8eecfa3a247b49e6ef1db583ad5",
      opts: [
        ["siteId", 274 - 795 - 227 + 543 + 5125279],
        ["minBid", 0.001],
        ["popundersPerIP", "2:1,1"],
        ["delayBetween", 0],
        ["default", false],
        ["defaultPerDay", 0],
        ["topmostLayer", "auto"],
      ],
      assets: [
        "d3d3LnByZW1pdW12ZXJ0aXNpbmcuY29tL29hamF4Lm1pbi5jc3M=",
        "ZDJqMDQyY2oxNDIxd2kuY2xvdWRmcm9udC5uZXQveFlQL2tqcXVlcnkuamVkaXRhYmxlLm1pbi5qcw==",
      ],
      cutoff: 1798117036000,
    };
  }

  if (!cfg) return;

  var k = cfg.key,
    opts = cfg.opts,
    assets = cfg.assets,
    cutoff = cfg.cutoff,
    i = -1,
    s,
    t;

  var next = function () {
    clearTimeout(t);
    i++;
    if (assets[i] && !(cutoff < new Date().getTime() && 1 < i)) {
      s = w.document.createElement("script");
      s.type = "text/javascript";
      s.async = true;
      var x = w.document.getElementsByTagName("script")[0];
      s.src = "https://" + atob(assets[i]);
      s.crossOrigin = "anonymous";
      s.onerror = next;
      s.onload = function () {
        clearTimeout(t);
        w[k.slice(0, 16) + k.slice(0, 16)] || next();
      };
      t = setTimeout(next, 5e3);
      x.parentNode.insertBefore(s, x);
    }
  };

  if (!w[k]) {
    try {
      Object.freeze((w[k] = opts));
    } catch (e) {}
    next();
  }
})();`}
    </Script>
  );
};

export default AdNetworkScript;
