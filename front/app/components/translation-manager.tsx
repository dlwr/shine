import {useState} from 'react';

type Translation = {
	uid: string;
	languageCode: string;
	content: string;
	isDefault: number;
};

type MovieDetails = {
	uid: string;
	year: number;
	originalLanguage: string;
	imdbId: string | undefined;
	tmdbId: number | undefined;
	translations: Translation[];
	nominations: Array<{
		uid: string;
		isWinner: boolean;
		specialMention: string | undefined;
		category: {uid: string; name: string};
		ceremony: {uid: string; number: number; year: number};
		organization: {uid: string; name: string; shortName: string};
	}>;
	posters: Array<{
		uid: string;
		url: string;
		width: number | undefined;
		height: number | undefined;
		languageCode: string | undefined;
		source: string | undefined;
		isPrimary: number;
	}>;
};

type TranslationManagerProps = {
	movieId: string;
	apiUrl: string;
	translations: Translation[];
	onTranslationsUpdate: (movieData: MovieDetails) => void;
};

export default function TranslationManager({
	movieId,
	apiUrl,
	translations,
	onTranslationsUpdate,
}: TranslationManagerProps) {
	const [editingTranslation, setEditingTranslation] = useState<
		string | undefined
	>(undefined);
	const [newTranslation, setNewTranslation] = useState({
		languageCode: '',
		content: '',
		isDefault: false,
	});
	const [showAddTranslation, setShowAddTranslation] = useState(false);
	const [translationError, setTranslationError] = useState<string | undefined>(
		undefined,
	);

	const addTranslation = async () => {
		if (!newTranslation.languageCode.trim() || !newTranslation.content.trim()) {
			setTranslationError('言語コードとタイトルは必須です');
			return;
		}

		const token = globalThis.localStorage?.getItem('adminToken');
		if (!token) {
			globalThis.location.href = '/admin/login';
			return;
		}

		try {
			const response = await fetch(`${apiUrl}/movies/${movieId}/translations`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					languageCode: newTranslation.languageCode.trim(),
					content: newTranslation.content.trim(),
					isDefault: newTranslation.isDefault,
				}),
			});

			if (response.status === 401) {
				globalThis.localStorage?.removeItem('adminToken');
				globalThis.location.href = '/admin/login';
				return;
			}

			if (!response.ok) {
				const errorData = (await response
					.json()
					.catch(() => ({error: 'Unknown error'}))) as {error?: string};
				throw new Error(errorData.error || 'Failed to add translation');
			}

			const movieResponse = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
				headers: {Authorization: `Bearer ${token}`},
			});

			if (movieResponse.ok) {
				const data = (await movieResponse.json()) as MovieDetails;
				onTranslationsUpdate(data);
			}

			setNewTranslation({languageCode: '', content: '', isDefault: false});
			setShowAddTranslation(false);
			setTranslationError(undefined);

			globalThis.alert?.('翻訳を追加しました');
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to add translation';
			setTranslationError(message);
			console.error('Add translation error:', error);
		}
	};

	const updateTranslation = async (
		languageCode: string,
		content: string,
		isDefault: boolean,
	) => {
		if (!languageCode.trim() || !content.trim()) {
			setTranslationError('言語コードとタイトルは必須です');
			return;
		}

		const token = globalThis.localStorage?.getItem('adminToken');
		if (!token) {
			globalThis.location.href = '/admin/login';
			return;
		}

		try {
			const response = await fetch(`${apiUrl}/movies/${movieId}/translations`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					languageCode: languageCode.trim(),
					content: content.trim(),
					isDefault,
				}),
			});

			if (response.status === 401) {
				globalThis.localStorage?.removeItem('adminToken');
				globalThis.location.href = '/admin/login';
				return;
			}

			if (!response.ok) {
				const errorData = (await response
					.json()
					.catch(() => ({error: 'Unknown error'}))) as {error?: string};
				throw new Error(errorData.error || 'Failed to update translation');
			}

			const movieResponse = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
				headers: {Authorization: `Bearer ${token}`},
			});

			if (movieResponse.ok) {
				const data = (await movieResponse.json()) as MovieDetails;
				onTranslationsUpdate(data);
			}

			setEditingTranslation(undefined);
			setTranslationError(undefined);

			globalThis.alert?.('翻訳を更新しました');
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to update translation';
			setTranslationError(message);
			console.error('Update translation error:', error);
		}
	};

	const deleteTranslation = async (languageCode: string) => {
		if (!globalThis.confirm?.(`「${languageCode}」の翻訳を削除しますか？`)) {
			return;
		}

		const token = globalThis.localStorage?.getItem('adminToken');
		if (!token) {
			globalThis.location.href = '/admin/login';
			return;
		}

		try {
			const response = await fetch(
				`${apiUrl}/movies/${movieId}/translations/${languageCode}`,
				{
					method: 'DELETE',
					headers: {
						Authorization: `Bearer ${token}`,
					},
				},
			);

			if (response.status === 401) {
				globalThis.localStorage?.removeItem('adminToken');
				globalThis.location.href = '/admin/login';
				return;
			}

			if (!response.ok) {
				const errorData = (await response
					.json()
					.catch(() => ({error: 'Unknown error'}))) as {error?: string};
				throw new Error(errorData.error || 'Failed to delete translation');
			}

			const movieResponse = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
				headers: {Authorization: `Bearer ${token}`},
			});

			if (movieResponse.ok) {
				const data = (await movieResponse.json()) as MovieDetails;
				onTranslationsUpdate(data);
			}

			globalThis.alert?.('翻訳を削除しました');
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to delete translation';
			globalThis.alert?.(message);
			console.error('Delete translation error:', error);
		}
	};

	return (
		<div className="bg-white rounded-lg shadow p-6">
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-lg font-medium text-gray-900">翻訳</h3>
				<button
					type="button"
					onClick={() => {
						setShowAddTranslation(!showAddTranslation);
					}}
					className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
				>
					{showAddTranslation ? 'キャンセル' : '翻訳を追加'}
				</button>
			</div>

			{showAddTranslation && (
				<div className="mb-6 p-4 border border-gray-200 rounded bg-gray-50">
					<h4 className="font-medium mb-3">新しい翻訳を追加</h4>
					<div className="space-y-3">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								言語コード
							</label>
							<input
								type="text"
								value={newTranslation.languageCode}
								onChange={(event) => {
									setNewTranslation({
										...newTranslation,
										languageCode: event.target.value,
									});
								}}
								className="w-full px-3 py-2 border border-gray-300 rounded-md"
								placeholder="例: ja, en, fr"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								タイトル
							</label>
							<input
								type="text"
								value={newTranslation.content}
								onChange={(event) => {
									setNewTranslation({
										...newTranslation,
										content: event.target.value,
									});
								}}
								className="w-full px-3 py-2 border border-gray-300 rounded-md"
								placeholder="映画のタイトル"
							/>
						</div>
						<div className="flex items-center">
							<input
								type="checkbox"
								id="isDefault"
								checked={newTranslation.isDefault}
								onChange={(event) => {
									setNewTranslation({
										...newTranslation,
										isDefault: event.target.checked,
									});
								}}
								className="mr-2"
							/>
							<label htmlFor="isDefault" className="text-sm text-gray-700">
								デフォルトの翻訳にする
							</label>
						</div>
						{translationError && (
							<p className="text-red-600 text-sm">{translationError}</p>
						)}
						<div className="flex space-x-2">
							<button
								type="button"
								onClick={addTranslation}
								className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700"
							>
								追加
							</button>
							<button
								type="button"
								onClick={() => {
									setShowAddTranslation(false);
									setNewTranslation({
										languageCode: '',
										content: '',
										isDefault: false,
									});
									setTranslationError(undefined);
								}}
								className="bg-gray-500 text-white px-4 py-2 rounded text-sm hover:bg-gray-600"
							>
								キャンセル
							</button>
						</div>
					</div>
				</div>
			)}

			<div className="space-y-3">
				{translations.length === 0 ? (
					<p className="text-gray-500 italic">翻訳がありません</p>
				) : (
					translations.map((translation) => (
						<div
							key={translation.uid}
							className="flex items-center justify-between p-3 border border-gray-200 rounded"
						>
							{editingTranslation === translation.uid ? (
								<EditTranslationForm
									translation={translation}
									onSave={async (languageCode, content, isDefault) =>
										updateTranslation(languageCode, content, isDefault)
									}
									onCancel={() => {
										setEditingTranslation(undefined);
									}}
								/>
							) : (
								<>
									<div className="flex-1">
										<span className="font-medium text-blue-600">
											{translation.languageCode}
										</span>
										<span className="mx-2 text-gray-400">→</span>
										<span>{translation.content}</span>
										{translation.isDefault === 1 && (
											<span className="ml-2 bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
												デフォルト
											</span>
										)}
									</div>
									<div className="flex space-x-2">
										<button
											type="button"
											onClick={() => {
												setEditingTranslation(translation.uid);
											}}
											className="text-blue-600 hover:text-blue-800 text-sm"
										>
											編集
										</button>
										<button
											type="button"
											onClick={async () =>
												deleteTranslation(translation.languageCode)
											}
											className="text-red-600 hover:text-red-800 text-sm"
										>
											削除
										</button>
									</div>
								</>
							)}
						</div>
					))
				)}
			</div>
		</div>
	);
}

type EditTranslationFormProps = {
	translation: Translation;
	onSave: (languageCode: string, content: string, isDefault: boolean) => void;
	onCancel: () => void;
};

function EditTranslationForm({
	translation,
	onSave,
	onCancel,
}: EditTranslationFormProps) {
	const [languageCode, setLanguageCode] = useState(translation.languageCode);
	const [content, setContent] = useState(translation.content);
	const [isDefault, setIsDefault] = useState(translation.isDefault === 1);

	return (
		<div className="flex-1 space-y-2">
			<div className="flex space-x-2">
				<input
					type="text"
					value={languageCode}
					onChange={(event) => {
						setLanguageCode(event.target.value);
					}}
					className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
					placeholder="言語"
				/>
				<input
					type="text"
					value={content}
					onChange={(event) => {
						setContent(event.target.value);
					}}
					className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
					placeholder="タイトル"
				/>
			</div>
			<div className="flex items-center justify-between">
				<div className="flex items-center">
					<input
						type="checkbox"
						id={`default-${translation.uid}`}
						checked={isDefault}
						onChange={(event) => {
							setIsDefault(event.target.checked);
						}}
						className="mr-1"
					/>
					<label htmlFor={`default-${translation.uid}`} className="text-xs">
						デフォルト
					</label>
				</div>
				<div className="flex space-x-2">
					<button
						type="button"
						onClick={() => {
							onSave(languageCode, content, isDefault);
						}}
						className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700"
					>
						保存
					</button>
					<button
						type="button"
						onClick={onCancel}
						className="bg-gray-500 text-white px-2 py-1 rounded text-xs hover:bg-gray-600"
					>
						キャンセル
					</button>
				</div>
			</div>
		</div>
	);
}
