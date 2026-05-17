# Workduck i18n

This folder keeps UI copy split by responsibility so adding languages does not grow one large file.

- `workduck-language.ts` is the compatibility entrypoint used by app code.
- `workduck-language-options.ts` owns supported language IDs, labels, defaults, and HTML `lang` values.
- `workduck-messages.ts` registers locale message objects and returns the active language messages.
- `workduck-message-contract.ts` derives the required message shape from English while allowing each locale to use its own string values.
- `locales/<language>.ts` stores one locale's message object.

To add a language, create `locales/<language>.ts`, export `<language>Messages`, register it in `workduck-messages.ts`, and add the language option in `workduck-language-options.ts`.
