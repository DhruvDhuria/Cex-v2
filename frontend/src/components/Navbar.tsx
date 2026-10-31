import { useEffect, useState, type MouseEvent } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearToken, getToken } from "@/lib/api";

const BRAND_NAME = "NEXORA";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition-colors ${
    isActive ? "text-accent" : "text-muted-foreground hover:text-white"
  }`;

const sectionLinkClass =
  "text-sm font-medium text-muted-foreground transition-colors hover:text-accent";

const mobileItemClass =
  "flex h-10 items-center rounded-md px-3 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const authed = Boolean(getToken());
  const isLanding = location.pathname === "/";

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  const handleSignOut = () => {
    clearToken();
    if (typeof window !== "undefined") {
      localStorage.removeItem("cex_username");
    }
    setMenuOpen(false);
    navigate("/trade");
  };

  const goToSection = (id: string) => {
    setMenuOpen(false);
    if (location.pathname === "/") {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    navigate(`/#${id}`);
  };

  const handleHomeClick = (event: MouseEvent<HTMLAnchorElement>) => {
    setMenuOpen(false);
    if (location.pathname === "/") {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <header
      className={`sticky top-0 z-30 border-b backdrop-blur ${
        isLanding ? "border-white/10 bg-ink/85" : "border-slate-800 bg-slate-950/90"
      }`}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-lg font-semibold tracking-[0.08em] text-white"
            onClick={handleHomeClick}
          >
            <span
              aria-hidden="true"
              className="flex h-6 w-6 items-center justify-center rounded-md border border-accent/30 bg-accent/10"
            >
              <span className="h-2 w-2 rounded-[2px] bg-accent" />
            </span>
            {BRAND_NAME}
          </Link>
          <nav className="hidden items-center gap-5 md:flex" aria-label="Primary">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/trade" className={navLinkClass}>
              Trade
            </NavLink>
            <a
              href="/#features"
              className={sectionLinkClass}
              onClick={(event) => {
                event.preventDefault();
                goToSection("features");
              }}
            >
              Features
            </a>
            <a
              href="/#about"
              className={sectionLinkClass}
              onClick={(event) => {
                event.preventDefault();
                goToSection("about");
              }}
            >
              About
            </a>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            {authed ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link to="/dashboard">Dashboard</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/dashboard?mode=add">Deposit/withdraw</Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/signin">Sign In</Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  className="bg-accent text-accent-foreground hover:bg-accent-hover"
                >
                  <Link to="/signup">Get Started</Link>
                </Button>
              </>
            )}
          </div>

          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-slate-300 transition-colors hover:bg-white/5 hover:text-white md:hidden"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="mobile-nav" className="border-t border-slate-800/80 px-4 pb-4 pt-3 md:hidden">
          <nav aria-label="Mobile" className="flex flex-col gap-1">
            <Link to="/" className={mobileItemClass} onClick={handleHomeClick}>
              Home
            </Link>
            <Link to="/trade" className={mobileItemClass} onClick={() => setMenuOpen(false)}>
              Trade
            </Link>
            <a
              href="/#features"
              className={mobileItemClass}
              onClick={(event) => {
                event.preventDefault();
                goToSection("features");
              }}
            >
              Features
            </a>
            <a
              href="/#about"
              className={mobileItemClass}
              onClick={(event) => {
                event.preventDefault();
                goToSection("about");
              }}
            >
              About
            </a>
            {authed && (
              <Link
                to="/dashboard"
                className={mobileItemClass}
                onClick={() => setMenuOpen(false)}
              >
                Dashboard
              </Link>
            )}
          </nav>

          <div className="mt-3 flex flex-col gap-2 border-t border-slate-800/80 pt-3">
            {authed ? (
              <>
                <Button asChild variant="outline" size="sm" className="w-full justify-start">
                  <Link to="/dashboard?mode=add" onClick={() => setMenuOpen(false)}>
                    Deposit/withdraw
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={handleSignOut}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="outline" size="sm" className="w-full justify-start">
                  <Link to="/signin" onClick={() => setMenuOpen(false)}>
                    Sign In
                  </Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  className="w-full bg-accent text-accent-foreground hover:bg-accent-hover"
                >
                  <Link to="/signup" onClick={() => setMenuOpen(false)}>
                    Get Started
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
