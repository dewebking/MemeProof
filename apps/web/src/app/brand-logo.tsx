type BrandMarkProps = {
  className?: string;
  size?: number;
};

export function BrandMark({ className, size = 34 }: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
    >
      <path
        d="M18.5 7.5C11.2 7.5 8 11.2 8 18.3v11.4c0 7.1 3.2 10.8 10.5 10.8M29.5 7.5C36.8 7.5 40 11.2 40 18.3v11.4c0 7.1-3.2 10.8-10.5 10.8"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M15.2 24h5.2l3-5 3.1 10 3.1-5h5.2"
        stroke="var(--brand-mark-accent, #6BC9A5)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-lockup ${className}`.trim()}>
      <BrandMark className="brand-symbol" />
      <span className="brand-name"><span>Meme</span><span>Proof</span></span>
    </span>
  );
}
