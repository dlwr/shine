import {useCallback} from 'react';
import {useSearchParams} from 'react-router';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {Input} from '@/components/ui/input';

type SearchTimeoutGlobal = typeof globalThis & {
  searchTimeout?: ReturnType<typeof setTimeout>;
};

const globalWithSearchTimeout = globalThis as SearchTimeoutGlobal;

export function MovieSearchCard() {
  const [searchParameters] = useSearchParams();

  // Get current search from URL params
  const currentSearch = searchParameters.get('search') || '';

  // Handle search - only update URL
  const handleSearch = useCallback(
    (query: string) => {
      // Update URL without causing React Router re-render
      if (globalThis.window === undefined) {
        return;
      }

      const newParameters = new URLSearchParams(searchParameters);
      if (query) {
        newParameters.set('search', query);
      } else {
        newParameters.delete('search');
      }

      newParameters.set('page', '1');

      const newUrl = `${location.pathname}?${newParameters.toString()}`;
      history.replaceState({}, '', newUrl);
      // Trigger custom event to update MoviesList
      dispatchEvent(new Event('urlchange'));
    },
    [searchParameters],
  );

  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle>作品検索</CardTitle>
        <CardDescription>
          タイトルの一部を入力すると URL
          パラメーターが更新され、一覧が自動的に再取得されます。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative max-w-xl">
          <Input
            type="text"
            defaultValue={currentSearch}
            placeholder="Search movies by title..."
            aria-label="Search movies"
            onChange={event => {
              const {value} = event.target;
              if (globalWithSearchTimeout.searchTimeout) {
                clearTimeout(globalWithSearchTimeout.searchTimeout);
              }
              globalWithSearchTimeout.searchTimeout = setTimeout(() => {
                handleSearch(value);
              }, 300);
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
