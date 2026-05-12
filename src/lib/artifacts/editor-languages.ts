import type { Extension } from "@codemirror/state";

export const artifactEditorLanguages = ["markdown", "json", "yaml"] as const;

export type ArtifactEditorLanguage = (typeof artifactEditorLanguages)[number];

export async function loadArtifactEditorLanguageExtension(
  language: ArtifactEditorLanguage
): Promise<Extension> {
  switch (language) {
    case "json":
      {
        const { json } = await import("@codemirror/lang-json");

        return json();
      }
    case "yaml":
      {
        const { yaml } = await import("@codemirror/lang-yaml");

        return yaml();
      }
    case "markdown":
      {
        const { markdown } = await import("@codemirror/lang-markdown");

        return markdown();
      }
  }

  const exhaustiveLanguage: never = language;
  return exhaustiveLanguage;
}
