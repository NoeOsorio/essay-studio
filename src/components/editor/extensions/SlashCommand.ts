import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion, {
  type SuggestionOptions,
  type SuggestionProps,
} from "@tiptap/suggestion";

export type SlashIcon =
  | "t1"
  | "t2"
  | "t3"
  | "paragraph"
  | "quote"
  | "bullet"
  | "ordered"
  | "code"
  | "divider";

export type SlashItem = {
  key: string;
  title: string;
  /** Which glyph the menu draws in the tile (the menu owns the artwork). */
  icon: SlashIcon;
  /** Extra search terms; the old titles stay here so `/h1` and `/quote` still match. */
  aliases?: string[];
  command: (args: { editor: Editor; range: Range }) => void;
};

// Rows and order follow Paper R2.3, with Párrafo after the headings (E6).
export const SLASH_ITEMS: SlashItem[] = [
  {
    key: "h1",
    title: "Sección",
    icon: "t1",
    aliases: ["h1", "heading 1", "titulo", "título 1", "titulo 1"],
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
    title: "Subsección",
    icon: "t2",
    aliases: ["h2", "heading 2", "seccion", "título 2", "titulo 2"],
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
    title: "Apartado",
    icon: "t3",
    aliases: ["h3", "heading 3", "subseccion", "título 3", "titulo 3"],
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
    icon: "paragraph",
    aliases: ["p", "parrafo", "text", "texto"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("paragraph").run(),
  },
  {
    key: "quote",
    title: "Cita",
    icon: "quote",
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
    icon: "bullet",
    aliases: ["list", "lista", "bullet"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    key: "ordered-list",
    title: "Lista numerada",
    icon: "ordered",
    aliases: ["numbered", "ordered", "numerada"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    key: "code",
    title: "Código",
    icon: "code",
    aliases: ["code", "codigo", "bloque de código", "bloque de codigo"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    key: "divider",
    title: "Separador",
    icon: "divider",
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
