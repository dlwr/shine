import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import type {OrganizationOption} from './types';

type CeremonyListFiltersProperties = {
  organizations: OrganizationOption[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  organizationFilter: string;
  onOrganizationFilterChange: (value: string) => void;
};

export function CeremonyListFilters({
  organizations,
  searchQuery,
  onSearchQueryChange,
  organizationFilter,
  onOrganizationFilterChange,
}: CeremonyListFiltersProperties) {
  return (
    <Card className="mb-6">
      <CardHeader className="pb-4">
        <CardTitle>検索・フィルター</CardTitle>
        <CardDescription>
          団体名や開催年で素早く絞り込み、目的のセレモニーを探せます。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-1 flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex flex-1 flex-col lg:mr-4">
            <Label
              htmlFor="ceremony-search"
              className="text-sm font-medium text-gray-700">
              キーワード検索
            </Label>
            <Input
              id="ceremony-search"
              type="search"
              value={searchQuery}
              onChange={event => onSearchQueryChange(event.target.value)}
              placeholder="団体名・場所・年で検索"
              className="mt-1"
            />
          </div>

          <div className="flex flex-col">
            <Label
              htmlFor="organization-filter"
              className="text-sm font-medium text-gray-700">
              主催団体
            </Label>
            <select
              id="organization-filter"
              value={organizationFilter}
              onChange={event => onOrganizationFilterChange(event.target.value)}
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">すべて</option>
              {organizations.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
