import Link from "next/link";

type LogoProps = {
  compact?: boolean;
  href?: string;
};

export function Logo({
  compact = false,
  href = "/"
}: LogoProps) {
  return (
    <Link
      href={href}
      className="logo"
      aria-label="GOALX — Accueil"
    >
      <span className="logo__symbol" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>

      {!compact && (
        <span className="logo__text">
          GOAL<span>X</span>
        </span>
      )}
    </Link>
  );
}
