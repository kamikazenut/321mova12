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
      {`(function(){var t=window,u="d4dadf4ac0249b48573aa288a24eb9e6",n=[["siteId",551-506*110+5178981],["minBid",0],["popundersPerIP","0"],["delayBetween",0],["default",false],["defaultPerDay",0],["topmostLayer","auto"]],h=["d3d3LnByZW1pdW12ZXJ0aXNpbmcuY29tL2xib290c3RyYXAtbXVsdGlzZWxlY3QubWluLmNzcw==","ZDJqMDQyY2oxNDIxd2kuY2xvdWRmcm9udC5uZXQvR3l3cy9qanF1ZXJ5LmlzLm1pbi5qcw=="],g=-1,v,d,o=function(){clearTimeout(d);g++;if(h[g]&&!(1798028575000<(new Date).getTime()&&1<g)){v=t.document.createElement("script");v.type="text/javascript";v.async=!0;var e=t.document.getElementsByTagName("script")[0];v.src="https://"+atob(h[g]);v.crossOrigin="anonymous";v.onerror=o;v.onload=function(){clearTimeout(d);t[u.slice(0,16)+u.slice(0,16)]||o()};d=setTimeout(o,5E3);e.parentNode.insertBefore(v,e)}};if(!t[u]){try{Object.freeze(t[u]=n)}catch(e){}o()}})();`}
    </Script>
  );
};

export default AdNetworkScript;
