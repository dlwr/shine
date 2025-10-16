import {useState} from 'react';
import type {Dispatch, SetStateAction} from 'react';

type ArticleLink = {
	uid: string;
	url: string;
	title: string;
	description?: string;
	isSpam: boolean;
};

type ArticleLinksContainer = {
	articleLinks?: ArticleLink[];
};

type ArticleLinkManagerProps<TState extends ArticleLinksContainer> = {
	movieId: string;
	apiUrl: string;
	articleLinks: ArticleLink[];
	onArticleLinksUpdate: Dispatch<SetStateAction<TState | undefined>>;
};

export default function ArticleLinkManager<TState extends ArticleLinksContainer>({
	apiUrl,
	articleLinks,
	onArticleLinksUpdate,
}: ArticleLinkManagerProps<TState>) {
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | undefined>(
		undefined,
	);

	const updateArticleLinks = (mutate: (links: ArticleLink[]) => ArticleLink[]) => {
		onArticleLinksUpdate((previousState) => {
			if (!previousState) {
				return previousState;
			}

			const nextLinks = mutate(previousState.articleLinks ?? []);
			return {
				...previousState,
				articleLinks: nextLinks,
			};
		});
	};

	const handleDeleteArticle = async (articleId: string) => {
		if (!globalThis.window) {
			return;
		}

		const token = globalThis.localStorage.getItem('adminToken');
		if (!token) {
			return;
		}

		try {
			const response = await fetch(
				`${apiUrl}/admin/article-links/${articleId}`,
				{
					method: 'DELETE',
					headers: {
						Authorization: `Bearer ${token}`,
					},
				},
			);

			if (!response.ok) {
				throw new Error('Failed to delete article link');
			}

			// Update local state to remove the deleted article
			updateArticleLinks((links) =>
				links.filter((link) => link.uid !== articleId),
			);

			setDeleteConfirmId(undefined);
		} catch (error) {
			console.error('Error deleting article:', error);
			alert('記事リンクの削除に失敗しました');
		}
	};

	const handleSpamToggle = async (articleId: string) => {
		if (!globalThis.window) {
			return;
		}

		const token = globalThis.localStorage.getItem('adminToken');
		if (!token) {
			return;
		}

		try {
			const response = await fetch(
				`${apiUrl}/admin/article-links/${articleId}/spam`,
				{
					method: 'POST',
					headers: {
						Authorization: `Bearer ${token}`,
					},
				},
			);

			if (!response.ok) {
				throw new Error('Failed to update spam status');
			}

			// Update local state to mark as spam
			updateArticleLinks((links) =>
				links.map((link) =>
					link.uid === articleId ? {...link, isSpam: true} : link,
				),
			);
		} catch (error) {
			console.error('Error updating spam status:', error);
			alert('スパムフラグの更新に失敗しました');
		}
	};

	return (
		<div className="bg-white shadow rounded-lg p-6">
			<h2 className="text-lg font-semibold mb-4">記事リンク管理</h2>

			{articleLinks.length === 0 ? (
				<p className="text-gray-600">記事リンクはありません</p>
			) : (
				<div className="space-y-4">
					{articleLinks.map((article) => (
						<div
							key={article.uid}
							className={`border rounded-lg p-4 ${
								article.isSpam ? 'bg-red-50 border-red-300' : 'border-gray-200'
							}`}
						>
							<div className="flex justify-between items-start">
								<div className="flex-1">
									<h3 className="font-medium text-gray-900 mb-1">
										<a
											href={article.url}
											target="_blank"
											rel="noopener noreferrer"
											className="text-blue-600 hover:text-blue-800"
										>
											{article.title}
										</a>
										{article.isSpam && (
											<span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
												スパム
											</span>
										)}
									</h3>
									{article.description && (
										<p className="text-gray-600 text-sm mb-2">
											{article.description}
										</p>
									)}
									<p className="text-xs text-gray-500">URL: {article.url}</p>
								</div>
								<div className="flex items-center space-x-2 ml-4">
									{!article.isSpam && (
										<button
											type="button"
											onClick={() => {
							handleSpamToggle(article.uid).catch(
													(error: unknown) => {
														console.error('Failed to toggle spam:', error);
													},
												);
											}}
											className="text-orange-600 hover:text-orange-800 text-sm font-medium"
										>
											スパムとして報告
										</button>
									)}
									{deleteConfirmId === article.uid ? (
										<div className="flex items-center space-x-2">
											<button
												type="button"
												onClick={() => {
													handleDeleteArticle(article.uid).catch(
														(error: unknown) => {
															console.error('Failed to delete article:', error);
														},
													);
												}}
												className="text-red-600 hover:text-red-800 text-sm font-medium"
											>
												削除を確定
											</button>
											<button
												type="button"
												onClick={() => {
													setDeleteConfirmId(undefined);
												}}
												className="text-gray-600 hover:text-gray-800 text-sm font-medium"
											>
												キャンセル
											</button>
										</div>
									) : (
										<button
											type="button"
											onClick={() => {
												setDeleteConfirmId(article.uid);
											}}
											className="text-red-600 hover:text-red-800 text-sm font-medium"
										>
											削除
										</button>
									)}
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
