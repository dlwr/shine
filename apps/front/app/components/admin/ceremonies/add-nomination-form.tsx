import {useState, type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {adminFetch} from '@/lib/admin-fetch';
import {ensureToken} from './ensure-token';
import type {
  AwardsCategory,
  CeremonyResponse,
  MovieSearchResult,
} from './types';

type AddNominationFormProperties = {
  apiUrl: string;
  ceremonyDetail: CeremonyResponse | undefined;
  selectedMovie: MovieSearchResult | undefined;
  categories: AwardsCategory[];
  message: string | undefined;
  onMessage: (message?: string) => void;
  onAdded: () => Promise<void>;
};

export function AddNominationForm({
  apiUrl,
  ceremonyDetail,
  selectedMovie,
  categories,
  message,
  onMessage,
  onAdded,
}: AddNominationFormProperties) {
  const [newNominationCategoryUid, setNewNominationCategoryUid] = useState('');
  const [newNominationIsWinner, setNewNominationIsWinner] = useState(false);
  const [newNominationSpecialMention, setNewNominationSpecialMention] =
    useState('');
  const [isAddingNomination, setIsAddingNomination] = useState(false);

  const handleAddNomination = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onMessage();

    if (!ceremonyDetail) {
      onMessage('映画を追加する前にセレモニーを保存してください。');
      return;
    }

    if (!selectedMovie) {
      onMessage('映画を選択してください。');
      return;
    }

    if (!newNominationCategoryUid) {
      onMessage('部門を選択してください。');
      return;
    }

    if (!ensureToken()) {
      return;
    }

    setIsAddingNomination(true);

    try {
      const response = await adminFetch(
        `${apiUrl}/admin/movies/${selectedMovie.uid}/nominations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ceremonyUid: ceremonyDetail.ceremony.uid,
            categoryUid: newNominationCategoryUid,
            isWinner: newNominationIsWinner,
            specialMention:
              newNominationSpecialMention.trim() === ''
                ? undefined
                : newNominationSpecialMention.trim(),
          }),
        },
      );

      if (response.status === 401) {
        return;
      }

      if (!response.ok) {
        const data = (await response
          .json()
          .catch(() => ({error: 'Unknown error'}))) as {error?: string};
        throw new Error(data.error || '映画の追加に失敗しました。');
      }

      await onAdded();
      onMessage('映画を追加しました。');
      setNewNominationCategoryUid('');
      setNewNominationIsWinner(false);
      setNewNominationSpecialMention('');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : '映画の追加に失敗しました。';
      onMessage(errorMessage);
      console.error('Add nomination error:', error);
    } finally {
      setIsAddingNomination(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleAddNomination}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col text-sm font-medium text-gray-700">
          部門
          <select
            value={newNominationCategoryUid}
            onChange={event =>
              setNewNominationCategoryUid(event.target.value)
            }
            className="mt-1 rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            required
            disabled={categories.length === 0}>
            <option value="">選択してください</option>
            {categories.map(category => (
              <option key={category.uid} value={category.uid}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={newNominationIsWinner}
            onChange={event =>
              setNewNominationIsWinner(event.target.checked)
            }
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          受賞として登録
        </label>
      </div>

      <label className="flex flex-col text-sm font-medium text-gray-700">
        特記事項
        <Input
          type="text"
          value={newNominationSpecialMention}
          onChange={event =>
            setNewNominationSpecialMention(event.target.value)
          }
          placeholder="コメント等（任意）"
          className="mt-1"
        />
      </label>

      {message && (
        <div className="rounded bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {message}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={!selectedMovie || isAddingNomination}
          className="bg-green-600 text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60">
          {isAddingNomination ? '追加中…' : '映画を追加'}
        </Button>
      </div>
    </form>
  );
}
