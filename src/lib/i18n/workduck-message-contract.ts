import type { enMessages } from './locales/en';

export type WorkduckMessages = WidenMessageStrings<typeof enMessages>;

type WidenMessageStrings<T> = T extends string
	? string
	: { readonly [Key in keyof T]: WidenMessageStrings<T[Key]> };
