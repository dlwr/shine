import {profileImageUrl, type ProfileDisplaySize} from '@/lib/profile-image';

type PersonPortraitProperties = {
  name: string;
  profilePath?: string;
  className?: string;
  displaySize?: ProfileDisplaySize;
};

export function PersonPortrait({
  name,
  profilePath,
  className = '',
  displaySize = 'w185',
}: PersonPortraitProperties) {
  const source = profileImageUrl(profilePath, displaySize);

  return (
    <div
      className={`aspect-2/3 overflow-hidden border border-ink ${className}`}
      style={{background: 'var(--poster-bg)'}}>
      {source ? (
        <img
          src={source}
          alt={name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center font-display font-bold text-ink-muted">
          {[...name][0]}
        </div>
      )}
    </div>
  );
}
