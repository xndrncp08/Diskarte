import type { ReactNode } from "react";
import { HeroLogo } from "./HeroLogo";

export function LandingHero({
  header,
  card,
  children,
}: {
  header: ReactNode;
  card: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {header}
      <section className="launch-hero launch-container">
        <div className="hero-editorial">
          <p className="section-kicker">
            <span className="status-dot" /> MADE FOR YOUR BARKADA. BUILT FOR
            YOUR IDEAS.
          </p>
          {children}
          <div className="hero-footnote">
            <span>01 / CONNECT</span>
            <span>02 / HANG OUT</span>
            <span>03 / CREATE</span>
          </div>
        </div>
        <div className="hero-product">
          <div className="hero-brand-scene">
            <HeroLogo />
            <div className="hero-field-note">
              <span>INGENUITY, MEET COMMUNITY.</span>
              <p>
                A little diskarte.
                <br />A whole lot of connection.
              </p>
            </div>
          </div>
          {card}
        </div>
      </section>
    </>
  );
}
