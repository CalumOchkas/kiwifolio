import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  iconClassName?: string;
  showWordmark?: boolean;
  compact?: boolean;
};

export function BrandLogo({
  className,
  iconClassName,
  showWordmark = true,
  compact = false,
}: BrandLogoProps) {
  return (
    <span className={cn("inline-flex items-center", compact ? "gap-2" : "gap-3", className)}>
      <svg
        viewBox="0 0 64 64"
        aria-hidden="true"
        className={cn(
          "h-9 w-9 shrink-0",
          iconClassName
        )}
      >
        <defs>
          <linearGradient id="kiwifolio-logo-bg" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#0f2f2a" />
            <stop offset="1" stopColor="#081a18" />
          </linearGradient>
          <linearGradient id="kiwifolio-logo-line" x1="18" y1="43" x2="47" y2="20" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#86efac" />
            <stop offset="1" stopColor="#2dd4bf" />
          </linearGradient>
        </defs>
        <rect x="6" y="6" width="52" height="52" rx="18" fill="url(#kiwifolio-logo-bg)" />
        <path d="M19 46V18" stroke="#173d37" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M19 46H46" stroke="#173d37" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="22" y="34" width="6" height="9" rx="2.5" fill="#34d399" />
        <rect x="31" y="28" width="6" height="15" rx="2.5" fill="#6ee7b7" />
        <rect x="40" y="21" width="6" height="22" rx="2.5" fill="#99f6e4" />
        <path
          d="M22 36.5L34 30L43 23"
          stroke="url(#kiwifolio-logo-line)"
          strokeWidth="3.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M40.8 18.6c2.8-.5 5 .2 6.8 2.1-2.1.1-3.8 1.1-4.9 2.9-.3-2-.9-3.7-1.9-5Z"
          fill="#d1fae5"
        />
        <circle cx="22" cy="36.5" r="2.4" fill="#ecfeff" />
        <circle cx="34" cy="30" r="2.4" fill="#ecfeff" />
        <circle cx="43" cy="23" r="2.4" fill="#ecfeff" />
      </svg>
      {showWordmark ? (
        <span className="flex min-w-0 flex-col leading-none">
          <span
            data-brand-wordmark
            className={cn(
              "truncate font-semibold tracking-[-0.05em] text-foreground",
              compact ? "text-base" : "text-lg"
            )}
          >
            KiwiFolio
          </span>
          {!compact ? (
            <span className="truncate pt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Investment Reporting
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}