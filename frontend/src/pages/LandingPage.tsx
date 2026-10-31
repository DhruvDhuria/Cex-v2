import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity,
  ArrowLeftRight,
  ArrowRight,
  Layers,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getToken } from "@/lib/api";

interface Feature {
  title: string;
  description: string;
  icon: LucideIcon;
}

const FEATURES: Feature[] = [
  {
    title: "Spot Trading",
    description: "Trade supported cryptocurrency pairs using market and limit orders.",
    icon: ArrowLeftRight,
  },
  {
    title: "Real-Time Updates",
    description: "Follow live order book changes and executed trades.",
    icon: Activity,
  },
  {
    title: "Efficient Order Matching",
    description: "Experience a matching engine that processes buy and sell orders.",
    icon: Layers,
  },
  {
    title: "Portfolio Management",
    description: "Track balances, orders, and executed trades in one place.",
    icon: Wallet,
  },
];

const STEPS = [
  {
    title: "Create an Account",
    description: "Register and access your exchange account.",
  },
  {
    title: "Explore the Markets",
    description: "Choose a supported trading pair and explore its market.",
  },
  {
    title: "Place Your Trade",
    description: "Submit orders and track their execution.",
  },
];

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-base leading-7 text-fog">{description}</p>
    </div>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;

  return (
    <Card className="gap-4 rounded-xl border-white/10 bg-panel p-6 shadow-none transition-colors hover:border-accent/30">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent">
        <Icon className="h-5 w-5" strokeWidth={1.7} />
      </div>
      <div>
        <h3 className="text-base font-medium text-white">{feature.title}</h3>
        <p className="mt-2 text-sm leading-6 text-fog">{feature.description}</p>
      </div>
    </Card>
  );
}

function HeroVisual() {
  return (
    <div aria-hidden="true" className="relative mx-auto aspect-square w-full max-w-[420px]">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at center, color-mix(in oklab, var(--accent) 16%, transparent), transparent 62%)",
        }}
      />
      <div className="absolute inset-0 rounded-full border border-white/[0.06]" />
      <div className="absolute inset-[10%] rounded-full border border-white/[0.08]" />
      <div className="absolute inset-[22%] rounded-full border border-accent/20" />
      <div className="absolute inset-[36%] rounded-full border border-white/[0.06]" />
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/10 to-transparent" />
      <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="absolute left-1/2 top-[10%] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/50 bg-accent shadow-[0_0_24px] shadow-accent/45" />
      <div className="absolute bottom-[22%] right-[9%] h-1.5 w-1.5 rounded-full bg-accent/70" />
      <div className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-accent/30 bg-ink/80 shadow-[0_0_60px] shadow-accent/15">
        <span className="h-3 w-3 rounded-[3px] bg-accent" />
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { hash } = useLocation();
  const authed = Boolean(getToken());
  const primaryHref = authed ? "/trade" : "/signin";

  useEffect(() => {
    if (!hash) return;

    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(hash.slice(1));
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [hash]);

  return (
    <div className="flex flex-1 flex-col bg-ink text-white">
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--accent) 8%, transparent), transparent 68%)",
          }}
        />
        <div className="relative mx-auto grid w-full max-w-6xl gap-14 px-6 pb-20 pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-10 lg:pb-28 lg:pt-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Spot trading, made straightforward
            </div>

            <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.04] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
              Your Crypto Journey.
              <span className="block text-accent">One Exchange.</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-fog sm:text-lg">
              Experience a simpler way to trade digital assets. Buy, sell, and manage
              cryptocurrencies through an intuitive spot trading platform.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-11 rounded-md bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
              >
                <Link to={primaryHref}>
                  Start Trading
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-11 rounded-md border-white/15 bg-white/[0.03] px-6 text-sm text-white hover:bg-white/[0.07] hover:text-white"
              >
                <a href="#features">Explore Features</a>
              </Button>
            </div>

            <p className="mt-6 flex items-center gap-2 text-xs text-fog">
              <span className="h-px w-6 bg-accent/60" />
              Educational demo exchange · No real funds
            </p>
          </div>

          <HeroVisual />
        </div>
      </section>

      <section id="features" className="scroll-mt-24 border-t border-white/[0.06] py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHeading
            eyebrow="Platform"
            title="Everything you need to trade with clarity."
            description="A focused spot trading experience with the essential tools in one place."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <FeatureCard key={feature.title} feature={feature} />
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.06] py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHeading
            eyebrow="How it works"
            title="From account to first trade."
            description="Three simple steps to start exploring the exchange."
          />
          <div className="mt-12 grid gap-8 md:grid-cols-3 md:gap-6">
            {STEPS.map((step, index) => (
              <div key={step.title} className="border-t border-white/10 pt-6">
                <span className="font-mono text-xs text-accent">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-4 text-lg font-medium text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-fog">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-20 pt-4 sm:pb-24">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-panel px-6 py-14 text-center sm:px-12 sm:py-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 0%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 55%)",
            }}
          />
          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              Ready to Explore the Exchange?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-fog">
              Get started and experience a simple spot trading platform.
            </p>
            <Button
              asChild
              size="lg"
              className="mt-8 h-11 rounded-md bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
            >
              <Link to={primaryHref}>
                Start Trading
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer id="about" className="scroll-mt-24 border-t border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
            <div>
              <Link
                to="/"
                className="flex items-center gap-2.5 text-base font-semibold tracking-[0.08em] text-white"
              >
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-accent/30 bg-accent/10"
                >
                  <span className="h-2 w-2 rounded-[2px] bg-accent" />
                </span>
                NEXORA
              </Link>
              <p className="mt-4 max-w-sm text-sm leading-6 text-fog">
                A demonstration spot exchange built to explore order matching, live market
                data, and portfolio management in one focused experience.
              </p>
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Navigate
              </h2>
              <ul className="mt-4 space-y-3 text-sm">
                <li>
                  <Link to="/" className="text-fog transition-colors hover:text-white">
                    Home
                  </Link>
                </li>
                <li>
                  <Link to="/trade" className="text-fog transition-colors hover:text-white">
                    Trade
                  </Link>
                </li>
                <li>
                  <a
                    href="#features"
                    className="text-fog transition-colors hover:text-white"
                  >
                    Features
                  </a>
                </li>
                <li>
                  <a href="#about" className="text-fog transition-colors hover:text-white">
                    About
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Account
              </h2>
              <ul className="mt-4 space-y-3 text-sm">
                {authed ? (
                  <>
                    <li>
                      <Link
                        to="/dashboard"
                        className="text-fog transition-colors hover:text-white"
                      >
                        Dashboard
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/dashboard?mode=add"
                        className="text-fog transition-colors hover:text-white"
                      >
                        Deposit/withdraw
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/trade"
                        className="text-fog transition-colors hover:text-white"
                      >
                        Start Trading
                      </Link>
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      <Link
                        to="/signin"
                        className="text-fog transition-colors hover:text-white"
                      >
                        Sign In
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/signup"
                        className="text-fog transition-colors hover:text-white"
                      >
                        Sign Up
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/trade"
                        className="text-fog transition-colors hover:text-white"
                      >
                        View Markets
                      </Link>
                    </li>
                  </>
                )}
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t border-white/[0.06] pt-6">
            <p className="max-w-3xl text-xs leading-5 text-fog">
              This is a demonstration cryptocurrency exchange built for educational purposes.
              It does not facilitate real cryptocurrency transactions or represent a production
              financial service.
            </p>
            <p className="mt-4 text-xs text-slate-500">
              © {new Date().getFullYear()} NEXORA. Built for educational purposes.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
