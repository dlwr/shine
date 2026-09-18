import type {FormEvent} from 'react';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import type {CeremonyFormState} from './ceremony-form-state';
import type {AwardsOrganization} from './types';

type CeremonyFormFieldsProperties = {
  formState: CeremonyFormState;
  organizations: AwardsOrganization[];
  onChange: (
    event:
      | FormEvent<HTMLInputElement>
      | FormEvent<HTMLTextAreaElement>
      | FormEvent<HTMLSelectElement>,
  ) => void;
};

export function CeremonyFormFields({
  formState,
  organizations,
  onChange,
}: CeremonyFormFieldsProperties) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="flex flex-col text-sm font-medium text-gray-700">
        主催団体
        <select
          name="organizationUid"
          value={formState.organizationUid}
          onChange={onChange}
          className="mt-1 rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          required>
          <option value="">選択してください</option>
          {organizations.map(organization => (
            <option key={organization.uid} value={organization.uid}>
              {organization.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col text-sm font-medium text-gray-700">
        開催年
        <Input
          type="number"
          name="year"
          value={formState.year}
          onChange={onChange}
          placeholder="2025"
          className="mt-1"
          required
        />
      </label>

      <label className="flex flex-col text-sm font-medium text-gray-700">
        回数
        <Input
          type="number"
          name="ceremonyNumber"
          value={formState.ceremonyNumber}
          onChange={onChange}
          placeholder="例: 96"
          className="mt-1"
          min={1}
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col text-sm font-medium text-gray-700">
          開始日
          <Input
            type="date"
            name="startDate"
            value={formState.startDate}
            onChange={onChange}
            className="mt-1"
          />
        </label>

        <label className="flex flex-col text-sm font-medium text-gray-700">
          終了日
          <Input
            type="date"
            name="endDate"
            value={formState.endDate}
            onChange={onChange}
            className="mt-1"
          />
        </label>
      </div>

      <label className="md:col-span-2 flex flex-col text-sm font-medium text-gray-700">
        開催場所
        <Input
          type="text"
          name="location"
          value={formState.location}
          onChange={onChange}
          placeholder="例: ロサンゼルス"
          className="mt-1"
        />
      </label>

      <label className="md:col-span-2 flex flex-col text-sm font-medium text-gray-700">
        IMDbイベントURL
        <Input
          type="url"
          name="imdbEventUrl"
          value={formState.imdbEventUrl}
          onChange={onChange}
          placeholder="https://www.imdb.com/event/ev0000372/1978/1"
          className="mt-1"
        />
        <span className="mt-1 text-xs text-gray-500">
          IMDb のイベントページへの完全な URL を入力してください（任意）。
        </span>
      </label>

      <label className="md:col-span-2 flex flex-col text-sm font-medium text-gray-700">
        説明
        <Textarea
          name="description"
          value={formState.description}
          onChange={onChange}
          rows={4}
          placeholder="補足情報があれば記入してください"
          className="mt-1"
        />
      </label>
    </div>
  );
}
