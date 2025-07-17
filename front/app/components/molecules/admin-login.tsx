import {useEffect, useState} from 'react';
import {Button} from '@/components/ui/button.tsx';

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
			const token = localStorage.getItem('adminToken') ?? undefined;
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
		translations[locale as keyof typeof translations] ?? translations.en;

	const handleLogin = async (event: React.FormEvent) => {
		event.preventDefault();
		setLoading(true);
		setError(false);

		try {
			const response = await fetch(
				`${apiUrl ?? 'http://localhost:8787'}/auth/login`,
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
			{isLoggedIn && (
				<div className="flex gap-2">
					<a
						href="/admin/movies"
						className={
							'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors ' +
							'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none ' +
							'disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2'
						}
					>
						{t.adminButton}
					</a>
					<Button onClick={handleLogout} variant="secondary">
						{t.logoutButton}
					</Button>
				</div>
			)}

			{showModal && (
				<div
					className="fixed top-0 left-0 w-full h-full bg-black/50 flex items-center justify-center z-50"
					onClick={(event) => {
						if (event.target === event.currentTarget) {
							handleOpenChange(false);
						}
					}}
				>
					<div className="bg-white p-8 rounded-lg w-full max-w-md mx-4">
						<h2 className="mb-6 text-xl">{t.loginTitle}</h2>
						<form onSubmit={handleLogin}>
							<input
								type="password"
								value={password}
								onChange={(event) => {
									setPassword(event.target.value);
								}}
								placeholder={t.passwordPlaceholder}
								className="w-full p-3 border border-gray-300 rounded text-base mb-4"
								required
								autoFocus
								disabled={loading}
							/>
							<div className="flex gap-4 justify-end">
								<Button type="submit" disabled={loading}>
									{loading ? (
										<div className="flex items-center">
											<div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
											{t.loginButton}
										</div>
									) : (
										t.loginButton
									)}
								</Button>
								<Button
									type="button"
									onClick={() => {
										handleOpenChange(false);
									}}
									variant="secondary"
									disabled={loading}
								>
									{t.cancelButton}
								</Button>
							</div>
						</form>
						{error && (
							<div className="text-red-600 text-sm mt-4">{t.loginError}</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
