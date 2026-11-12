import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

type LogoProps = {
  /**
   * "lockup" is the full logo including the tagline, for the footer and other
   * places with room for it. "wordmark" is the mark plus the word Kea, which
   * is what a navigation bar should use because the tagline is unreadable at
   * that height. "mark" is the icon alone.
   */
  variant?: "lockup" | "wordmark" | "mark";
  className?: string;
  priority?: boolean;
  href?: string | null;
};

const SOURCES = {
  lockup: { src: "/brand/kea-logo.png", width: 1937, height: 573 },
  wordmark: { src: "/brand/kea-wordmark.png", width: 760, height: 367 },
  mark: { src: "/brand/kea-mark.png", width: 512, height: 512 },
} as const;

export function Logo({ variant = "lockup", className, priority, href = "/" }: LogoProps) {
  const source = SOURCES[variant];

  const image = (
    <Image
      src={source.src}
      alt="Kea"
      width={source.width}
      height={source.height}
      priority={priority}
      className={cn("h-auto w-auto select-none", className)}
    />
  );

  if (!href) return image;

  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label="Kea home"
    >
      {image}
    </Link>
  );
}
