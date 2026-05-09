import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion, {
  type SuggestionOptions,
  type SuggestionProps,
} from "@tiptap/suggestion";

export type SlashItem = {
  key: string;
  title: string;
  hint?: string;
  aliases?: string[];
  command: (args: { editor: Editor; range: Range }) => void;
};

export const SLASH_ITEMS: SlashItem[] = [
  {
    key: "h1",
    title: "Título 1",
    hint: "encabezado grande",
    aliases: ["h1", "heading 1", "titulo"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 1 })
        .run(),
  },
  {
    key: "h2",
    title: "Título 2",
    hint: "sección",
    aliases: ["h2", "heading 2", "seccion"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 2 })
        .run(),
  },
  {
    key: "h3",
    title: "Título 3",
    hint: "subsección",
    aliases: ["h3", "heading 3", "subseccion"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 3 })
        .run(),
  },
  {
    key: "paragraph",
    title: "Párrafo",
    hint: "texto base",
    aliases: ["p", "parrafo", "text", "texto"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("paragraph").run(),
  },
  {
    key: "quote",
    title: "Cita",
    hint: "blockquote",
    aliases: ["quote", "cita", "blockquote"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("paragraph")
        .toggleBlockquote()
        .run(),
  },
  {
    key: "bullet-list",
    title: "Lista",
    hint: "viñetas",
    aliases: ["list", "lista", "bullet"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    key: "ordered-list",
    title: "Lista numerada",
    hint: "1. 2. 3.",
    aliases: ["numbered", "ordered", "numerada"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    key: "code",
    title: "Bloque de código",
    hint: "monospace",
    aliases: ["code", "codigo"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    key: "divider",
    title: "Separador",
    hint: "línea horizontal",
    aliases: ["hr", "divider", "rule", "separador"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
];

function filterItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter((it) => {
    const haystack = [it.key, it.title, ...(it.aliases ?? [])]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

type SlashRender = SuggestionOptions<SlashItem, SlashItem>["render"];

type SlashCommandOptions = {
  render: SlashRender;
};

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",
  addOptions(): SlashCommandOptions {
    return {
      render: () => ({
        onStart() {},
        onUpdate() {},
        onKeyDown() {
          return false;
        },
        onExit() {},
      }),
    };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: "/",
        startOfLine: false,
        items: ({ query }) => filterItems(query),
        // `props` is the selected SlashItem; we run its command.
        command: ({ editor, range, props }) => {
          props.command({ editor, range });
        },
        render: this.options.render,
      }),
    ];
  },
});

export type SlashSuggestionProps = SuggestionProps<SlashItem, SlashItem>;
