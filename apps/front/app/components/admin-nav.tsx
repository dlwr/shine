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
        const isExactOrChild =
          location.pathname === item.href ||
          location.pathname.startsWith(`${item.href}/`);
        const isStolenByMoreSpecific = navItems.some(
          other =>
            other.href !== item.href &&
            other.href.startsWith(`${item.href}/`) &&
            (location.pathname === other.href ||
              location.pathname.startsWith(`${other.href}/`)),
        );
        const isActive =
          item.href === '/' ? false : isExactOrChild && !isStolenByMoreSpecific;

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
