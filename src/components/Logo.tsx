/** Hand-built brand mark: an amber badge with an ascending trend line.
 *  Replaces the placeholder "₮" glyph. */
export function Logo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <span
      className={`inline-grid place-items-center rounded-lg bg-[var(--accent)] ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        className="w-[62%] h-[62%]"
        fill="none"
        stroke="var(--on-accent)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 15.5 L9.5 10 L13 13 L20 5.5" />
        <path d="M16.5 5.5 L20 5.5 L20 9" />
      </svg>
    </span>
  );
}
