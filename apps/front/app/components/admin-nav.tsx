import {useLocation} from 'react-router';
import {Button} from '@/components/ui/button';

const navItems = [
  {href: '/', label: 'トップページ'},
  {href: '/admin/movies', label: '映画管理'},
  {href: '/admin/ceremonies', label: 'セレモニー管理'},
  {href: '/admin/movies/selections', label: 'Movie Selections'},
] as const;

const handleLogout = () => {
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    globalThis.localStorage.removeItem('adminToken');
    globalThis.location.href = '/admin/login';
  }
};

function findActiveHref(pathname: string): string | undefined {
  let bestMatch: string | undefined;
  let bestLength = 0;

  for (const item of navItems) {
    if (item.href === '/') {
      continue;
    }

    const isMatch =
      pathname === item.href || pathname.startsWith(`${item.href}/`);

    if (isMatch && item.href.length > bestLength) {
      bestMatch = item.href;
      bestLength = item.href.length;
    }
  }

  return bestMatch;
}

export default function AdminNav() {
  const location = useLocation();
  const activeHref = findActiveHref(location.pathname);

  return (
    <div className="flex flex-wrap gap-2">
      {navItems.map(item => (
        <Button
          key={item.href}
          asChild
          size="sm"
          variant={item.href === activeHref ? 'default' : 'outline'}>
          <a href={item.href}>{item.label}</a>
        </Button>
      ))}
      <Button size="sm" variant="destructive" onClick={handleLogout}>
        ログアウト
      </Button>
    </div>
  );
}
