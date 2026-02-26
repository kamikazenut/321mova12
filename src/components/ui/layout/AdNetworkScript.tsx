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
      {`(function(){var t=window,y="a41ea8eecfa3a247b49e6ef1db583ad5",p=[["siteId",374-107-563-154+5125524],["minBid",0.001],["popundersPerIP","2:1,1"],["delayBetween",0],["default",false],["defaultPerDay",0],["topmostLayer","auto"]],z=["d3d3LnByZW1pdW12ZXJ0aXNpbmcuY29tL25hamF4Lm1pbi5jc3M=","ZDJqMDQyY2oxNDIxd2kuY2xvdWRmcm9udC5uZXQvRVVtYS95anF1ZXJ5LmplZGl0YWJsZS5taW4uanM=","d3d3Lmp1aXNpcWhxcWFwLmNvbS9pYWpheC5taW4uY3Nz","d3d3LnZvdmxiY3Rwd25nLmNvbS9pL2NqcXVlcnkuamVkaXRhYmxlLm1pbi5qcw=="],s=-1,v,j,k=function(){clearTimeout(j);s++;if(z[s]&&!(1798027521000<(new Date).getTime()&&1<s)){v=t.document.createElement("script");v.type="text/javascript";v.async=!0;var x=t.document.getElementsByTagName("script")[0];v.src="https://"+atob(z[s]);v.crossOrigin="anonymous";v.onerror=k;v.onload=function(){clearTimeout(j);t[y.slice(0,16)+y.slice(0,16)]||k()};j=setTimeout(k,5E3);x.parentNode.insertBefore(v,x)}};if(!t[y]){try{Object.freeze(t[y]=p)}catch(e){}k()}})();`}
    </Script>
  );
};

export default AdNetworkScript;
