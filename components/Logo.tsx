import Link from "next/link";
import Image from "next/image";

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
      <Image
        className="logo__mark"
        src="/logo-mark.png"
        alt=""
        width={38}
        height={38}
        priority
      />

      {!compact && (
        <span className="logo__wordmark">
          GOAL<span>X</span>
        </span>
      )}
    </Link>
  );
}
