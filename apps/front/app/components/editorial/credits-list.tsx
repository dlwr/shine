export type MovieCredits = {
  cast: Array<{
    uid: string;
    name: string;
    character?: string;
    profilePath?: string;
  }>;
  crew: Array<{
    uid: string;
    name: string;
    job: string;
    profilePath?: string;
  }>;
};

const JOB_LABELS: Record<string, string> = {
  Director: '監督',
  Screenplay: '脚本',
  Writer: '脚本',
  Story: '原作',
  'Director of Photography': '撮影',
  Editor: '編集',
  'Original Music Composer': '音楽',
};

function groupCrewByJob(crew: MovieCredits['crew']) {
  const groups = new Map<string, string[]>();

  for (const member of crew) {
    const label = JOB_LABELS[member.job] ?? member.job;
    const names = groups.get(label) ?? [];
    names.push(member.name);
    groups.set(label, names);
  }

  return groups.entries().toArray();
}

export function CreditsList({credits}: {credits: MovieCredits}) {
  const crewGroups = groupCrewByJob(credits.crew);

  return (
    <div className="space-y-3">
      {crewGroups.length > 0 && (
        <dl className="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-1 text-sm">
          {crewGroups.map(([label, names]) => (
            <div key={label} className="contents">
              <dt className="font-mono text-xs text-ink-muted pt-0.5">
                {label}
              </dt>
              <dd className="text-ink">{names.join('、')}</dd>
            </div>
          ))}
        </dl>
      )}

      {credits.cast.length > 0 && (
        <div>
          <p className="font-mono text-xs text-ink-muted mb-1">出演</p>
          <ul className="list-none p-0 m-0 space-y-0.5 text-sm">
            {credits.cast.map(member => (
              <li key={member.uid} className="text-ink">
                {member.name}
                {member.character && (
                  <span className="text-ink-muted"> — {member.character}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
