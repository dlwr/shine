import type {MovieCardLabels} from './labels';
import type {OrganizationGroup} from './nominations-by-organization';

export function MovieCardNominations({
  groups,
  labels,
  adminToken,
}: {
  groups: OrganizationGroup[];
  labels: MovieCardLabels;
  adminToken?: string;
}) {
  if (groups.length === 0) {
    return;
  }

  return (
    <div className="mt-auto pt-4 border-t border-gray-200">
      {groups.map(group => (
        <div key={group.organization.uid} className="mb-4 last:mb-0">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            {group.organization.shortName || group.organization.name}
          </h4>
          {group.ceremonies.map(ceremonyGroup => (
            <div key={ceremonyGroup.ceremony.uid} className="mb-2">
              {adminToken ? (
                <a
                  href={`/admin/ceremonies/${ceremonyGroup.ceremony.uid}`}
                  className="text-xs text-blue-600 font-medium hover:underline">
                  {ceremonyGroup.ceremony.year}
                </a>
              ) : (
                <span className="text-xs text-gray-600 font-medium">
                  {ceremonyGroup.ceremony.year}
                </span>
              )}
              <ul className="list-none p-0 mt-1">
                {ceremonyGroup.nominations.map(nomination => (
                  <li
                    key={nomination.uid}
                    className="text-xs py-1 flex items-center justify-between">
                    <span className="text-gray-700">
                      {nomination.category.name}
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded font-medium ml-2 ${
                        nomination.isWinner
                          ? 'bg-yellow-400 text-gray-900'
                          : 'bg-gray-200 text-gray-700'
                      }`}>
                      {nomination.isWinner ? labels.winner : labels.nominee}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
