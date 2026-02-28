import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useMembership } from "@/context/MembershipContext";

const navLinks = [
  { name: "RESULTS", href: "/backtest" },
];

interface PublicNavbarProps {
  variant?: "dark" | "light";
}

export function PublicNavbar({ variant = "dark" }: PublicNavbarProps) {
  const { tier } = useMembership();
  const isMember = tier !== "free";

  const isLight = variant === "light";

  return (
    <nav
      className={cn(
        "w-full",
        isLight ? "bg-transparent" : "border-b border-border bg-[#080808]"
      )}
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-[60px]">
        {/* Logo */}
        <Link to="/" className="flex items-center">
          <span
            className={cn(
              "font-display text-xl font-bold uppercase tracking-tight text-[#c8f54a]",
              isLight ? "" : ""
            )}
          >
            Edge
          </span>
        </Link>

        {/* Nav Links - Desktop */}
        <div className="hidden items-center gap-10 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              to={link.href}
              className={cn(
                "font-mono text-[11px] font-medium uppercase tracking-[0.12em] transition-colors",
                isLight
                  ? "text-[#555] hover:text-[#0a0a0a]"
                  : "text-[#888] hover:text-[#f5f5f5]"
              )}
            >
              {link.name}
            </Link>
          ))}

          {/* CTA Button */}
          <Link
            to="/dashboard"
            className={cn(
              "font-mono text-[11px] font-medium uppercase tracking-[0.12em] px-6 py-3 transition-colors",
              isLight
                ? "bg-[#0a0a0a] text-[#f5f0e8]"
                : "bg-[#c8f54a] text-[#0a0a0a]"
            )}
          >
            MEMBER HUB
          </Link>
        </div>

        {/* Mobile CTA */}
        <Link
          to="/dashboard"
          className={cn(
            "md:hidden font-mono text-[11px] font-medium uppercase tracking-[0.12em] px-4 py-2 transition-colors",
            isLight
              ? "bg-[#0a0a0a] text-[#f5f0e8]"
              : "bg-[#c8f54a] text-[#0a0a0a]"
          )}
        >
          HUB
        </Link>
      </div>

      {/* Mobile Nav Links */}
      <div
        className={cn(
          "flex items-center justify-center gap-6 py-3 md:hidden",
          isLight ? "border-t border-[#0a0a0a]/10" : "border-t border-border"
        )}
      >
        {navLinks.map((link) => (
          <Link
            key={link.name}
            to={link.href}
            className={cn(
              "font-mono text-[10px] font-medium uppercase tracking-[0.12em] transition-colors",
              isLight
                ? "text-[#555] hover:text-[#0a0a0a]"
                : "text-[#888] hover:text-[#f5f5f5]"
            )}
          >
            {link.name}
          </Link>
        ))}
      </div>
    </nav>
  );
}
