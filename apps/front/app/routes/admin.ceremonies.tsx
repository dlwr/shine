import AdminNav from '@/components/admin-nav';
import {CeremonyListFilters} from '@/components/admin/ceremonies/ceremony-list-filters';
import {CeremonyListTable} from '@/components/admin/ceremonies/ceremony-list-table';
import {useCeremonyList} from '@/components/admin/ceremonies/use-ceremony-list';
import {Button} from '@/components/ui/button';
import type {Route} from './+types/admin.ceremonies';
import {resolveApiUrl} from '@/lib/api';

export function meta() {
  return [
    {title: 'セレモニー一覧 | Shine Admin'},
    {name: 'description', content: 'セレモニーの一覧と管理'},
  ];
}

export async function loader({context}: Route.LoaderArgs) {
  return {
    apiUrl: resolveApiUrl(context),
  };
}

export default function AdminCeremonies({loaderData}: Route.ComponentProps) {
  const {
    isLoading,
    error,
    organizations,
    filteredCeremonies,
    searchQuery,
    setSearchQuery,
    organizationFilter,
    setOrganizationFilter,
  } = useCeremonyList(loaderData.apiUrl);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">セレモニー一覧</h1>
            <p className="mt-1 text-sm text-gray-500">
              各セレモニーの基本情報と映画の紐付け状況を管理します。
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <AdminNav />
            <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-500">
              <a href="/admin/ceremonies/new">＋ セレモニーを追加</a>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <CeremonyListFilters
          organizations={organizations}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          organizationFilter={organizationFilter}
          onOrganizationFilterChange={setOrganizationFilter}
        />

        <section className="rounded-lg bg-white shadow">
          {isLoading ? (
            <div className="p-6 text-sm text-gray-500">読み込み中です…</div>
          ) : error ? (
            <div className="p-6 text-sm text-red-600">{error}</div>
          ) : filteredCeremonies.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">
              条件に一致するセレモニーが見つかりませんでした。
            </div>
          ) : (
            <CeremonyListTable ceremonies={filteredCeremonies} />
          )}
        </section>
      </main>
    </div>
  );
}
