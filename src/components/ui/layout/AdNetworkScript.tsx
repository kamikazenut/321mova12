"use client";

import useSupabaseUser from "@/hooks/useSupabaseUser";
import { isPremiumUser } from "@/utils/billing/premium";
import Script from "next/script";

const AdNetworkScript: React.FC = () => {
  const { data: user, isLoading } = useSupabaseUser();
  const isPremium = isPremiumUser(user);

  if (isLoading || isPremium) return null;

  //return (
   // <Script id="bvtpk-tag" strategy="afterInteractive">
   //   {`(function(s){s.dataset.zone='9408521',s.src='https://bvtpk.com/tag.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')));`}
  //  </Script>
//  );
};

export default AdNetworkScript;

