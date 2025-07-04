type Language = {
	code: string;
	name: string;
};

type LanguageSelectorProps = {
	locale: string;
};

export function LanguageSelector({locale}: LanguageSelectorProps) {
	const languages: Language[] = [
		{code: 'en', name: 'English'},
		{code: 'ja', name: '日本語'},
	];

	const getCurrentUrl = (newLocale: string): string => {
		if (globalThis.window !== undefined) {
			const url = new URL(globalThis.location.href);
			url.searchParams.set('locale', newLocale);
			return url.toString();
		}

		return `?locale=${newLocale}`;
	};

	return (
		<div className='flex gap-2 my-4 justify-center'>
			{languages.map(lang => (
				<a
					key={lang.code}
					href={getCurrentUrl(lang.code)}
					className={`px-4 py-2 border rounded text-sm no-underline transition-all duration-200 ${
						locale === lang.code
							? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:border-blue-700'
							: 'text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
					}`}
				>
					{lang.name}
				</a>
			))}
		</div>
	);
}
