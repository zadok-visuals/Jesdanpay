import { SmoothScroll } from "@/components/marketing/SmoothScroll";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Hero } from "@/components/marketing/Hero";
import { CorridorStrip } from "@/components/marketing/CorridorStrip";
import { LiveRate } from "@/components/marketing/LiveRate";
import { FeatureCards } from "@/components/marketing/FeatureCards";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { StatsBand } from "@/components/marketing/StatsBand";
import { Testimonials } from "@/components/marketing/Testimonials";
import { SecurityTrust } from "@/components/marketing/SecurityTrust";
import { FAQ } from "@/components/marketing/FAQ";
import { FinalCta } from "@/components/marketing/FinalCta";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export function LandingPage() {
  return (
    <SmoothScroll>
      <div className="min-h-dvh bg-cream">
        <MarketingNav />
        <main>
          <Hero />
          <CorridorStrip />
          <LiveRate />
          <FeatureCards />
          <HowItWorks />
          <StatsBand />
          <Testimonials />
          <SecurityTrust />
          <FAQ />
          <FinalCta />
        </main>
        <MarketingFooter />
      </div>
    </SmoothScroll>
  );
}
