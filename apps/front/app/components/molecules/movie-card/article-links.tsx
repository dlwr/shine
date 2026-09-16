import type {MovieCardLabels} from './labels';
import type {MovieCardArticleLink} from './types';

export function MovieCardArticleLinks({
  articleLinks,
  labels,
}: {
  articleLinks: MovieCardArticleLink[];
  labels: MovieCardLabels;
}) {
  if (articleLinks.length === 0) {
    return;
  }

  return (
    <div className="px-6 pb-2 border-t border-gray-200">
      <h4 className="text-sm font-semibold text-gray-700 mt-4 mb-3">
        {labels.relatedArticles}
      </h4>
      <ul className="list-none p-0 m-0">
        {articleLinks.map(article => (
          <li key={article.uid} className="mb-1.5 last:mb-0">
            {article.url ? (
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md no-underline text-inherit transition-all duration-200 hover:bg-gray-100 hover:border-gray-300 hover:translate-x-0.5">
                <span className="text-xs text-gray-700 overflow-hidden text-ellipsis whitespace-nowrap block leading-snug">
                  {article.title ?? article.url}
                </span>
              </a>
            ) : (
              <p className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-700 leading-snug">
                {article.description}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
