import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PublicNavbar } from "./PublicNavbar";

interface PublicLayoutProps {
  children: ReactNode;
  hideNav?: boolean;
  hideFooter?: boolean;
}

export function PublicLayout({
  children,
  hideNav = false,
  hideFooter = false,
}: PublicLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      {!hideNav && <PublicNavbar />}
      <main className="flex-1">{children}</main>
      {!hideFooter && <Footer />}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-[#1f1f1f] bg-[#080808]">
      <div className="mx-auto max-w-7xl px-[60px] py-[80px]">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          {/* Logo */}
          <Link to="/" className="flex items-center">
            <span className="font-display text-xl font-bold uppercase tracking-tight text-[#c8f54a]">
              Edge
            </span>
          </Link>

          {/* Links */}
          <div className="flex items-center gap-8">
            <Link
              to="/"
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#888] transition-colors hover:text-[#f5f5f5]"
            >
              HOME
            </Link>
            <Link
              to="/backtest"
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#888] transition-colors hover:text-[#f5f5f5]"
            >
              RESULTS
            </Link>
            <Link
              to="/dashboard"
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#888] transition-colors hover:text-[#f5f5f5]"
            >
              DASHBOARD
            </Link>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-16 border-t border-[#1f1f1f] pt-8">
          <p className="font-mono text-[10px] leading-relaxed text-[#555] max-w-3xl">
            Simulated results. Past performance ≠ future results. Not financial
            advice. Trading futures involves substantial risk of loss and is not
            suitable for all investors. The indicator flags signals — the trader
            places orders manually in their broker. This product does not
            execute trades automatically.
          </p>
          <p className="mt-4 font-mono text-[10px] text-[#555]">
            © {new Date().getFullYear()} Edge. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
