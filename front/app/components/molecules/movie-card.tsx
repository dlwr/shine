import {useEffect, useRef, useState} from 'react';
import {Button} from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';

type MovieCardProps = {
	movie: any;
	locale?: string;
	adminToken?: string;
};

type PosterInfo = {
	url: string;
	languageCode: string | undefined;
	isPrimary: number;
};

function selectBestPoster(
	posters: PosterInfo[] | undefined,
	locale: string,
): string | undefined {
	if (!posters || posters.length === 0) {
		return undefined;
	}

	// Convert locale to language code (e.g., 'ja' from 'ja-JP')
	const languageCode = locale.split('-')[0];

	// Priority:
	// 1. Primary poster with matching language
	// 2. Non-primary poster with matching language
	// 3. Primary poster with no language (international)
	// 4. Any primary poster
	// 5. First poster

	// Find poster with matching language and primary flag
	const primaryLocaleMatch = posters.find(
		(p) => p.isPrimary === 1 && p.languageCode === languageCode,
	);
	if (primaryLocaleMatch) return primaryLocaleMatch.url;

	// Find any poster with matching language
	const localeMatch = posters.find((p) => p.languageCode === languageCode);
	if (localeMatch) return localeMatch.url;

	// Find primary poster with no language (international)
	const primaryInternational = posters.find(
		(p) => p.isPrimary === 1 && !p.languageCode,
	);
	if (primaryInternational) return primaryInternational.url;

	// Find any primary poster
	const primaryAny = posters.find((p) => p.isPrimary === 1);
	if (primaryAny) return primaryAny.url;

	// Return first poster
	return posters[0].url;
}

type TranslationInfo = {
	languageCode: string;
	content: string;
	isDefault: number;
};

function selectBestTitle(movie: any, locale: string): string {
	// If movie.title is already provided (from public API), use it with fallback
	if (movie.title) {
		return movie.title;
	}

	// If movie.translations is available (from admin API), find the best translation
	if (movie.translations && Array.isArray(movie.translations)) {
		const languageCode = locale.split('-')[0];

		// Priority:
		// 1. Translation with matching language
		// 2. Default translation (isDefault = 1)
		// 3. Japanese translation ('ja')
		// 4. English translation ('en')
		// 5. First available translation

		// Find translation with matching language
		const localeMatch = movie.translations.find(
			(t: TranslationInfo) => t.languageCode === languageCode,
		);
		if (localeMatch) return localeMatch.content;

		// Find default translation
		const defaultTranslation = movie.translations.find(
			(t: TranslationInfo) => t.isDefault === 1,
		);
		if (defaultTranslation) return defaultTranslation.content;

		// Find Japanese translation
		const jaTranslation = movie.translations.find(
			(t: TranslationInfo) => t.languageCode === 'ja',
		);
		if (jaTranslation) return jaTranslation.content;

		// Find English translation
		const enTranslation = movie.translations.find(
			(t: TranslationInfo) => t.languageCode === 'en',
		);
		if (enTranslation) return enTranslation.content;

		// Return first available translation
		if (movie.translations.length > 0) {
			return movie.translations[0].content;
		}
	}

	// Fallback to "Unknown Title (year)"
	return `Unknown Title (${movie.year})`;
}

export function MovieCard({movie, locale = 'en', adminToken}: MovieCardProps) {
	const [showStreamingMenu, setShowStreamingMenu] = useState(false);
	const [showDetails, setShowDetails] = useState(false);
	const cardRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
				setShowStreamingMenu(false);
			}
		};

		if (showStreamingMenu) {
			document.addEventListener('mousedown', handleClickOutside);
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [showStreamingMenu]);

	const labels = {
		en: {
			noPoster: 'No Poster',
			winner: 'Winner',
			nominee: 'Nominee',
			edit: 'Edit',
			relatedArticles: 'Submitted Links',
			addArticle: 'Add Link',
			showMore: 'Show details',
			showLess: 'Hide details',
			searchOn: 'Search on',
			adminEdit: 'Edit Movie',
		},
		ja: {
			noPoster: 'ポスターなし',
			winner: '受賞',
			nominee: 'ノミネート',
			edit: '編集',
			relatedArticles: '投稿されたリンク',
			addArticle: 'リンクを追加',
			showMore: '詳細を表示',
			showLess: '詳細を隠す',
			searchOn: '検索する',
			adminEdit: '映画を編集',
		},
	};

	const t = labels[locale as keyof typeof labels] || labels.en;

	const movieTitle = selectBestTitle(movie, locale);

	const streamingServices = [
		{
			name: 'U-NEXT',
			color: 'bg-black text-white',
			url: (title: string) =>
				`https://video.unext.jp/freeword?query=${encodeURIComponent(title)}`,
		},
		{
			name: 'Amazon Prime',
			color: 'bg-blue-600 text-white',
			url: (title: string) =>
				`https://www.amazon.co.jp/s?k=${encodeURIComponent(
					title,
				)}&i=prime-instant-video`,
		},
		{
			name: 'TMDb',
			color: 'bg-green-600 text-white',
			url: (title: string) =>
				movie.tmdbId
					? `https://www.themoviedb.org/movie/${movie.tmdbId}`
					: `https://www.themoviedb.org/search?query=${encodeURIComponent(title)}`,
		},
		{
			name: 'Filmarks',
			color: 'bg-purple-600 text-white',
			url: (title: string) =>
				`https://filmarks.com/search/movies?q=${encodeURIComponent(title)}`,
		},
	];

	// Group nominations by organization and ceremony
	const nominationsByOrg =
		movie.nominations?.reduce(
			(acc: any, nom: any) => {
				const orgKey = nom.organization.uid;
				acc[orgKey] ||= {
					organization: nom.organization,
					ceremonies: {},
				};

				const ceremonyKey = nom.ceremony.uid;
				if (!acc[orgKey].ceremonies[ceremonyKey]) {
					acc[orgKey].ceremonies[ceremonyKey] = {
						ceremony: nom.ceremony,
						nominations: [],
					};
				}

				acc[orgKey].ceremonies[ceremonyKey].nominations.push(nom);
				return acc;
			},
			{} as Record<string, any>,
		) || {};

	const isMobile = globalThis.window !== undefined && window.innerWidth <= 768;

	return (
		<Card ref={cardRef} className="relative h-full w-80 overflow-hidden">
			<div
				className="h-[400px] md:h-[450px] bg-gray-100 flex items-center justify-center relative cursor-pointer"
				onMouseEnter={() => !isMobile && setShowStreamingMenu(true)}
				onMouseLeave={() => !isMobile && setShowStreamingMenu(false)}
				onClick={() => isMobile && setShowStreamingMenu(!showStreamingMenu)}
			>
				{(() => {
					const posterUrl =
						movie.posterUrls && movie.posterUrls.length > 0
							? selectBestPoster(movie.posterUrls, locale)
							: movie.posterUrl;
					return posterUrl ? (
						<img
							src={posterUrl}
							alt={`${movieTitle} poster`}
							className="w-full h-full object-cover"
						/>
					) : (
						<div className="text-gray-500 text-xl">{t.noPoster}</div>
					);
				})()}

				{/* Streaming services hover menu */}
				{showStreamingMenu && (
					<div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20">
						<div className="bg-white rounded-lg p-6 max-w-xs w-full mx-4">
							<h4 className="text-lg font-semibold text-gray-900 mb-4 text-center">
								{t.searchOn}
							</h4>
							<div className="grid grid-cols-1 gap-3">
								{streamingServices.map((service) => (
									<a
										key={service.name}
										href={service.url(movieTitle)}
										target="_blank"
										rel="noopener noreferrer"
										className={`block px-4 py-3 rounded-md text-center text-sm font-medium ${service.color}`}
										onClick={(e) => {
											e.stopPropagation();
										}}
									>
										{service.name}
									</a>
								))}
							</div>
							<a
								href={
									movie.imdbUrl ||
									`https://www.imdb.com/find?q=${encodeURIComponent(
										movieTitle + ' ' + movie.year,
									)}`
								}
								target="_blank"
								rel="noopener noreferrer"
								className="block px-4 py-3 mt-3 bg-yellow-500 text-gray-900 rounded-md text-center text-sm font-medium"
								onClick={(e) => {
									e.stopPropagation();
								}}
							>
								IMDb
							</a>
							<a
								href={`https://www.google.com/search?q=${encodeURIComponent(
									movieTitle +
										' ' +
										movie.year +
										' ' +
										(locale === 'ja' ? '映画' : 'movie'),
								)}`}
								target="_blank"
								rel="noopener noreferrer"
								className="block px-4 py-3 mt-3 bg-gray-600 text-white rounded-md text-center text-sm font-medium"
								onClick={(e) => {
									e.stopPropagation();
								}}
							>
								Google
							</a>
						</div>
					</div>
				)}
			</div>

			<CardHeader>
				<CardTitle className="text-xl md:text-2xl">
					{selectBestTitle(movie, locale)}
				</CardTitle>
				<CardDescription className="text-lg">{movie.year}</CardDescription>
			</CardHeader>
			<CardContent className="flex-grow flex flex-col">
				<div
					className={`${
						isMobile && !showDetails ? 'max-h-0 overflow-hidden' : 'max-h-none'
					} transition-all duration-300`}
				>
					{movie.nominations && movie.nominations.length > 0 && (
						<div className="mt-auto pt-4 border-t border-gray-200">
							{Object.values(nominationsByOrg).map((orgData: any) => (
								<div key={orgData.organization.uid} className="mb-4 last:mb-0">
									<h4 className="text-sm font-semibold text-gray-700 mb-2">
										{orgData.organization.shortName ||
											orgData.organization.name}
									</h4>
									{Object.values(orgData.ceremonies).map(
										(ceremonyData: any) => (
											<div key={ceremonyData.ceremony.uid} className="mb-2">
												<span className="text-xs text-gray-600 font-medium">
													{ceremonyData.ceremony.year}
												</span>
												<ul className="list-none p-0 mt-1">
													{ceremonyData.nominations.map((nom: any) => (
														<li
															key={nom.uid}
															className="text-xs py-1 flex items-center justify-between"
														>
															<span className="text-gray-700">
																{nom.category.name}
															</span>
															<span
																className={`text-xs px-2 py-1 rounded font-medium ml-2 ${
																	nom.isWinner
																		? 'bg-yellow-400 text-gray-900'
																		: 'bg-gray-200 text-gray-700'
																}`}
															>
																{nom.isWinner ? t.winner : t.nominee}
															</span>
														</li>
													))}
												</ul>
											</div>
										),
									)}
								</div>
							))}
						</div>
					)}
					{movie.articleLinks && movie.articleLinks.length > 0 && (
						<div className="px-6 pb-2 border-t border-gray-200">
							<h4 className="text-sm font-semibold text-gray-700 mt-4 mb-3">
								{t.relatedArticles}
							</h4>
							<ul className="list-none p-0 m-0">
								{movie.articleLinks.map((article: any) => (
									<li key={article.uid} className="mb-1.5 last:mb-0">
										<a
											href={article.url}
											target="_blank"
											rel="noopener noreferrer"
											className="block px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md no-underline text-inherit transition-all duration-200 hover:bg-gray-100 hover:border-gray-300 hover:translate-x-0.5"
										>
											<span className="text-xs text-gray-700 overflow-hidden text-ellipsis whitespace-nowrap block leading-snug">
												{article.title}
											</span>
										</a>
									</li>
								))}
							</ul>
						</div>
					)}
					<a
						href={`/movies/${movie.uid}`}
						className="inline-block mx-6 my-3 px-2 py-1 text-gray-500 no-underline rounded text-xs font-normal transition-all duration-200 border border-transparent hover:text-gray-700 hover:bg-gray-100 hover:border-gray-200"
					>
						+ {t.addArticle}
					</a>
					{adminToken && (
						<a
							href={`/admin/movies/${movie.uid}`}
							className="inline-block mx-6 my-1 px-2 py-1 bg-blue-600 text-white no-underline rounded text-xs font-medium transition-all duration-200 hover:bg-blue-700"
						>
							{t.adminEdit}
						</a>
					)}
				</div>
				{isMobile && (
					<Button
						onClick={() => {
							setShowDetails(!showDetails);
						}}
						variant="outline"
						className="w-full mt-3 text-gray-500"
						size="sm"
					>
						<span>{showDetails ? t.showLess : t.showMore}</span>
						<span
							className={`text-xs transition-transform duration-200 ${
								showDetails ? 'rotate-180' : ''
							}`}
						>
							▼
						</span>
					</Button>
				)}
			</CardContent>
		</Card>
	);
}
