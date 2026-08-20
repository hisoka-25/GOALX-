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
      <svg
        className="logo__mark"
        viewBox="0 0 40 40"
        role="img"
        aria-label="Symbole GOALX"
      >
        <path
          className="logo__mark-frame"
          d="M20 2.5 35 11v18L20 37.5 5 29V11L20 2.5Z"
        />
        <path
          className="logo__mark-g"
          d="M27.7 14.2a10 10 0 1 0 .1 11.5V20H20v4.4h3.3a5.5 5.5 0 1 1 1.3-7.3l3.1-2.9Z"
        />
        <path
          className="logo__mark-x"
          d="m27.4 25.7 5.8 5.8M33.2 25.7l-5.8 5.8"
        />
      </svg>

      {!compact && (
        <span className="logo__wordmark">
          GOAL<span>X</span>
        </span>
      )}
    </Link>
  );
}
