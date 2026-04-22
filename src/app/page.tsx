import { MarketingBackground } from "@/components/brand/MarketingBackground";
import { HomePageClient } from "@/components/marketing/HomePageClient";

export default function Home() {
  return (
    <div className="relative min-h-dvh">
      <MarketingBackground />
      <HomePageClient />
    </div>
  );
}
