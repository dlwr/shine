import {useEffect, useId, useState} from 'react';
import type {ProminentPerson} from '@/lib/people';

type SuggestedMovie = {
  uid: string;
  title: string;
  year?: number;
};

type Suggestions = {
  movies: SuggestedMovie[];
  people: ProminentPerson[];
};

type SuggestionItem = {
  href: string;
  primary: string;
  secondary?: string;
  group: 'PEOPLE' | 'MOVIES';
};

const EMPTY: Suggestions = {movies: [], people: []};
const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

function personSecondary(person: ProminentPerson): string | undefined {
  if (person.wonCount > 0) {
    return `${person.wonCount}回受賞`;
  }

  return person.originalName === person.name ? undefined : person.originalName;
}

function toItems({people, movies}: Suggestions): SuggestionItem[] {
  return [
    ...people.map(person => ({
      href: `/people/${person.uid}`,
      primary: person.name,
      secondary: personSecondary(person),
      group: 'PEOPLE' as const,
    })),
    ...movies.map(movie => ({
      href: `/movies/${movie.uid}`,
      primary: movie.title,
      secondary: movie.year ? String(movie.year) : undefined,
      group: 'MOVIES' as const,
    })),
  ];
}

export function SearchBox({
  apiUrl,
  label,
  placeholder,
  defaultValue = '',
  onNavigate = href => {
    location.assign(href);
  },
}: {
  apiUrl: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  onNavigate?: (href: string) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestions>(EMPTY);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions(EMPTY);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `${apiUrl}/search/suggest?q=${encodeURIComponent(trimmed)}&locale=ja`,
          {signal: controller.signal},
        );
        if (!response.ok) {
          return;
        }

        setSuggestions((await response.json()) as Suggestions);
        setActive(-1);
        setOpen(true);
      } catch {
        setSuggestions(EMPTY);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, apiUrl]);

  const items = toItems(suggestions);
  const expanded = open && items.length > 0;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown': {
        if (items.length === 0) {
          return;
        }

        event.preventDefault();
        setOpen(true);
        setActive((active + 1) % items.length);
        break;
      }

      case 'ArrowUp': {
        if (items.length === 0) {
          return;
        }

        event.preventDefault();
        setOpen(true);
        setActive((active - 1 + items.length) % items.length);
        break;
      }

      case 'Enter': {
        if (expanded && active >= 0) {
          event.preventDefault();
          onNavigate(items[active].href);
        }

        break;
      }

      case 'Escape': {
        setOpen(false);
        setActive(-1);
        break;
      }

      default:
    }
  };

  return (
    <form method="get" action="/search" role="search" className="relative">
      <div className="flex border-[3px] border-ink shadow-[var(--shadow-offset-sm)]">
        <input
          type="search"
          name="q"
          value={query}
          onChange={event => {
            setQuery(event.target.value);
          }}
          onFocus={() => {
            setOpen(true);
          }}
          onBlur={() => {
            setOpen(false);
          }}
          onKeyDown={handleKeyDown}
          aria-label={label}
          placeholder={placeholder}
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={expanded}
          aria-activedescendant={
            expanded && active >= 0 ? `${listId}-${active}` : undefined
          }
          className="flex-1 bg-surface px-3 py-2.5 text-ink focus:outline-none"
        />
        <button
          type="submit"
          className="bg-ink px-4 font-display font-black text-paper">
          GO
        </button>
      </div>
      {expanded && (
        <ul
          id={listId}
          role="listbox"
          onMouseDown={event => {
            event.preventDefault();
          }}
          className="absolute right-0 left-0 z-10 mt-1 list-none border-[3px] border-ink bg-surface p-0 shadow-[var(--shadow-offset-sm)]">
          {items.map((item, index) => (
            <li
              key={item.href}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'bg-ink text-paper' : 'text-ink'}>
              <a
                href={item.href}
                className="flex items-baseline justify-between gap-3 px-3 py-2 text-inherit no-underline">
                <span className="font-display font-bold">{item.primary}</span>
                <span className="shrink-0 font-mono text-[10px] opacity-70">
                  {item.group}
                  {item.secondary ? ` · ${item.secondary}` : ''}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
