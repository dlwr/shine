export function YearNavLink({
  href,
  year,
  label,
}: {
  href: string;
  year?: number;
  label: 'PREV' | 'NEXT';
}) {
  if (!year) {
    return <span className="w-24" />;
  }

  const text = label === 'PREV' ? `← ${year}` : `${year} →`;
  return (
    <a
      href={href}
      className={`w-24 font-mono text-xs text-ink no-underline ${
        label === 'NEXT' ? 'text-right' : ''
      }`}>
      {text}
    </a>
  );
}
