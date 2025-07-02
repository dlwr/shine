import {useEffect, useState} from 'react';
import {Button} from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

type AdminLoginProps = {
	locale: string;
	apiUrl?: string;
};

export function AdminLogin({locale, apiUrl}: AdminLoginProps) {
	const [showModal, setShowModal] = useState(false);
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const [password, setPassword] = useState('');
	const [error, setError] = useState(false);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (globalThis.window !== undefined) {
			const token = localStorage.getItem('adminToken') || undefined;
			setIsLoggedIn(Boolean(token));
		}
	}, []);

	const translations = {
		en: {
			adminButton: 'Admin',
			loginTitle: 'Admin Login',
			loginDescription:
				'Enter your admin password to access the management panel.',
			passwordLabel: 'Password',
			passwordPlaceholder: 'Enter password',
			loginButton: 'Login',
			cancelButton: 'Cancel',
			loginError: 'Invalid password',
			logoutButton: 'Logout',
		},
		ja: {
			adminButton: '管理者',
			loginTitle: '管理者ログイン',
			loginDescription:
				'管理パネルにアクセスするには管理者パスワードを入力してください。',
			passwordLabel: 'パスワード',
			passwordPlaceholder: 'パスワードを入力',
			loginButton: 'ログイン',
			cancelButton: 'キャンセル',
			loginError: 'パスワードが正しくありません',
			logoutButton: 'ログアウト',
		},
	};

	const t =
		translations[locale as keyof typeof translations] || translations.en;

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError(false);

		try {
			const response = await fetch(
				`${apiUrl || 'http://localhost:8787'}/auth/login`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({password}),
				},
			);

			if (response.ok) {
				const {token} = (await response.json()) as {token: string};
				localStorage.setItem('adminToken', token);
				setIsLoggedIn(true);
				setShowModal(false);
				setPassword('');
				globalThis.dispatchEvent(new Event('adminLogin'));
			} else {
				setError(true);
			}
		} catch (error_) {
			console.error('Login error:', error_);
			setError(true);
		} finally {
			setLoading(false);
		}
	};

	const handleLogout = () => {
		localStorage.removeItem('adminToken');
		setIsLoggedIn(false);
		globalThis.dispatchEvent(new Event('adminLogout'));
	};

	const handleOpenChange = (open: boolean) => {
		setShowModal(open);
		if (!open) {
			setPassword('');
			setError(false);
		}
	};

	return (
		<div className="fixed top-4 right-4 z-50">
			{isLoggedIn ? (
				<div className="flex gap-2">
					<Button asChild>
						<a href="/admin/movies">{t.adminButton}</a>
					</Button>
					<Button onClick={handleLogout} variant="secondary">
						{t.logoutButton}
					</Button>
				</div>
			) : (
				<Button onClick={() => setShowModal(true)} variant="outline">
					{t.adminButton}
				</Button>
			)}

			<Dialog open={showModal} onOpenChange={handleOpenChange}>
				<DialogContent className="sm:max-w-[425px]">
					<DialogHeader>
						<DialogTitle>{t.loginTitle}</DialogTitle>
						<DialogDescription>{t.loginDescription}</DialogDescription>
					</DialogHeader>
					<form onSubmit={handleLogin}>
						<div className="grid gap-4 py-4">
							<div className="grid gap-2">
								<Label htmlFor="password">{t.passwordLabel}</Label>
								<Input
									id="password"
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder={t.passwordPlaceholder}
									required
									autoFocus
									disabled={loading}
								/>
							</div>
							{error && (
								<p className="text-sm text-destructive">{t.loginError}</p>
							)}
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => handleOpenChange(false)}
								disabled={loading}
							>
								{t.cancelButton}
							</Button>
							<Button type="submit" disabled={loading}>
								{loading ? (
									<div className="flex items-center">
										<div className="animate-spin h-4 w-4 border-2 border-background border-t-transparent rounded-full mr-2" />
										{t.loginButton}
									</div>
								) : (
									t.loginButton
								)}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
