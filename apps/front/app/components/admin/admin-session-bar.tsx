import {Button} from '@/components/ui/button';
import {clearAdminToken} from '@/lib/admin-fetch';

const LABELS = {
  en: {adminButton: 'Admin', logoutButton: 'Logout'},
  ja: {adminButton: '管理者', logoutButton: 'ログアウト'},
};

export function AdminSessionBar({locale}: {locale: string}) {
  const t = LABELS[locale as keyof typeof LABELS] ?? LABELS.en;

  return (
    <div className="fixed top-4 right-4 z-50 flex gap-2">
      <a
        href="/admin/movies"
        className={
          'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors ' +
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none ' +
          'disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2'
        }>
        {t.adminButton}
      </a>
      <Button onClick={clearAdminToken} variant="secondary">
        {t.logoutButton}
      </Button>
    </div>
  );
}
