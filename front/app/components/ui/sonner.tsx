import {Toaster as Sonner, ToasterProps} from 'sonner';

const Toaster = ({...props}: ToasterProps) => {
	// React Router v7では独自のテーマ管理を使用
	const theme = 'system';

	return (
		<Sonner
			theme={theme as ToasterProps['theme']}
			className="toaster group"
			style={
				{
					'--normal-bg': 'var(--popover)',
					'--normal-text': 'var(--popover-foreground)',
					'--normal-border': 'var(--border)',
				} as React.CSSProperties
			}
			{...props}
		/>
	);
};

export {Toaster};
