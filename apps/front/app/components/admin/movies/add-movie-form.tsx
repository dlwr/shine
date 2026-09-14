import {useState, type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {adminFetch, getAdminToken} from '@/lib/admin-fetch';
import type {CreateMovieResponse} from './types';

export function AddMovieForm({apiUrl}: {apiUrl: string}) {
  const [newImdbId, setNewImdbId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>();
  const [createSuccess, setCreateSuccess] = useState<string | undefined>();

  const submitNewMovie = async () => {
    const trimmedImdbId = newImdbId.trim().toLowerCase();

    if (!trimmedImdbId) {
      setCreateError('Please enter an IMDb ID.');
      return;
    }

    if (!/^tt\d+$/.test(trimmedImdbId)) {
      setCreateError("IMDb ID must look like 'tt1234567'.");
      return;
    }

    if (!getAdminToken()) {
      location.assign('/admin/login');
      return;
    }

    setIsCreating(true);
    setCreateError(undefined);
    setCreateSuccess(undefined);

    try {
      const response = await adminFetch(`${apiUrl}/admin/movies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imdbId: trimmedImdbId,
          refreshData: true,
        }),
      });

      if (response.status === 401) {
        return;
      }

      const data = (await response.json()) as CreateMovieResponse;

      if (!response.ok || !data.success) {
        setCreateError(data.error || 'Failed to create movie.');
        return;
      }

      const translations = data.imports?.translationsAdded ?? 0;
      const posters = data.imports?.postersAdded ?? 0;
      const importSummary =
        translations > 0 || posters > 0
          ? ` (translations: ${translations}, posters: ${posters})`
          : '';

      setCreateSuccess(`Movie created successfully${importSummary}.`);
      setNewImdbId('');

      dispatchEvent(new Event('refetchMovies'));
    } catch (error) {
      console.error('Create movie error:', error);
      setCreateError('Failed to create movie. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateMovie = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitNewMovie();
  };

  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle>Add Movie by IMDb ID</CardTitle>
        <CardDescription>
          Enter an IMDb ID (e.g., tt1234567). TMDB data is fetched
          automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={handleCreateMovie}
          className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label
              htmlFor="new-movie-imdb-id"
              className="text-sm font-medium text-slate-600">
              IMDb ID
            </Label>
            <Input
              id="new-movie-imdb-id"
              type="text"
              value={newImdbId}
              onChange={event => {
                setNewImdbId(event.target.value);
                if (createError) {
                  setCreateError(undefined);
                }
                if (createSuccess) {
                  setCreateSuccess(undefined);
                }
              }}
              placeholder="tt1234567"
              inputMode="text"
              required
              autoComplete="off"
              className="mt-2"
            />
          </div>
          <Button
            type="submit"
            disabled={isCreating}
            className="sm:h-10 sm:min-w-[160px]">
            {isCreating ? 'Registering...' : 'Register Movie'}
          </Button>
        </form>
        {createError && (
          <p className="text-sm text-destructive">{createError}</p>
        )}
        {createSuccess && (
          <p className="text-sm text-emerald-600">{createSuccess}</p>
        )}
      </CardContent>
    </Card>
  );
}
