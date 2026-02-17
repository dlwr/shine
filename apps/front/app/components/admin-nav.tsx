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

export default function AdminNav() {
  const location = useLocation();

  return (
    <div className="flex flex-wrap gap-2">
      {navItems.map(item => {
        const isActive =
          item.href === '/'
            ? false
            : location.pathname === item.href ||
              location.pathname.startsWith(`${item.href}/`);

        return (
          <Button
            key={item.href}
            asChild
            size="sm"
            variant={isActive ? 'default' : 'outline'}>
            <a href={item.href}>{item.label}</a>
          </Button>
        );
      })}
      <Button size="sm" variant="destructive" onClick={handleLogout}>
        ログアウト
      </Button>
    </div>
  );
}
