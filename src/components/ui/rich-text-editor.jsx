import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code2,
  Minus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Image as ImageIcon,
  Table as TableIcon,
  Columns2,
  Rows2,
  Trash2,
  Undo2,
  Redo2,
} from "lucide-react";

export default function RichTextEditor({
  value = "",
  onChange,
  placeholder = "Write here...",
  className = "",
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: { openOnClick: true, autolink: true },
      }),
      Highlight,
      Subscript,
      Superscript,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class:
          "min-h-[260px] w-full rounded-md border border-transparent bg-white px-5 py-4 text-sm leading-7 text-slate-900 outline-none",
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      onChange?.(nextEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = value || "";
    if (incoming !== current) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return null;

  const iconButtonClass = "h-8 w-8";
  const toolbarButtonVariant = (active) => (active ? "secondary" : "ghost");

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-1">
        <Button type="button" size="icon" className={iconButtonClass} variant={toolbarButtonVariant(editor.isActive("bold"))} title="Bold" aria-label="Bold" onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></Button>
        <Button type="button" size="icon" className={iconButtonClass} variant={toolbarButtonVariant(editor.isActive("italic"))} title="Italic" aria-label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></Button>
        <Button type="button" size="icon" className={iconButtonClass} variant={toolbarButtonVariant(editor.isActive("underline"))} title="Underline" aria-label="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></Button>
        <Button type="button" size="icon" className={iconButtonClass} variant={toolbarButtonVariant(editor.isActive("strike"))} title="Strike" aria-label="Strike" onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></Button>
        <Button type="button" size="icon" className={iconButtonClass} variant={toolbarButtonVariant(editor.isActive("highlight"))} title="Highlight" aria-label="Highlight" onClick={() => editor.chain().focus().toggleHighlight().run()}><Highlighter className="h-4 w-4" /></Button>
        <div className="mx-1 h-6 w-px bg-border" />
        <Button type="button" size="icon" className={iconButtonClass} variant={toolbarButtonVariant(editor.isActive("heading", { level: 1 }))} title="Heading 1" aria-label="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="h-4 w-4" /></Button>
        <Button type="button" size="icon" className={iconButtonClass} variant={toolbarButtonVariant(editor.isActive("heading", { level: 2 }))} title="Heading 2" aria-label="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></Button>
        <Button type="button" size="icon" className={iconButtonClass} variant={toolbarButtonVariant(editor.isActive("heading", { level: 3 }))} title="Heading 3" aria-label="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></Button>
        <div className="mx-1 h-6 w-px bg-border" />
        <Button type="button" size="icon" className={iconButtonClass} variant={toolbarButtonVariant(editor.isActive("bulletList"))} title="Bulleted list" aria-label="Bulleted list" onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></Button>
        <Button type="button" size="icon" className={iconButtonClass} variant={toolbarButtonVariant(editor.isActive("orderedList"))} title="Numbered list" aria-label="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Button>
        <Button type="button" size="icon" className={iconButtonClass} variant={toolbarButtonVariant(editor.isActive("taskList"))} title="Checklist" aria-label="Checklist" onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks className="h-4 w-4" /></Button>
        <Button type="button" size="icon" className={iconButtonClass} variant={toolbarButtonVariant(editor.isActive("blockquote"))} title="Quote" aria-label="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></Button>
        <Button type="button" size="icon" className={iconButtonClass} variant={toolbarButtonVariant(editor.isActive("codeBlock"))} title="Code block" aria-label="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code2 className="h-4 w-4" /></Button>
        <Button type="button" size="icon" className={iconButtonClass} variant="ghost" title="Horizontal rule" aria-label="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="h-4 w-4" /></Button>
        <div className="mx-1 h-6 w-px bg-border" />
        <Button type="button" size="icon" className={iconButtonClass} variant={toolbarButtonVariant(editor.isActive({ textAlign: "left" }))} title="Align left" aria-label="Align left" onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="h-4 w-4" /></Button>
        <Button type="button" size="icon" className={iconButtonClass} variant={toolbarButtonVariant(editor.isActive({ textAlign: "center" }))} title="Align center" aria-label="Align center" onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="h-4 w-4" /></Button>
        <Button type="button" size="icon" className={iconButtonClass} variant={toolbarButtonVariant(editor.isActive({ textAlign: "right" }))} title="Align right" aria-label="Align right" onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="h-4 w-4" /></Button>
        <div className="mx-1 h-6 w-px bg-border" />
        <Button
          type="button"
          size="icon"
          className={iconButtonClass}
          variant="ghost"
          title="Insert image by URL"
          aria-label="Insert image by URL"
          onClick={() => {
            const url = window.prompt("Image URL");
            if (!url) return;
            editor.chain().focus().setImage({ src: url.trim() }).run();
          }}
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" className={iconButtonClass} variant={toolbarButtonVariant(editor.isActive("table"))} title="Insert table" aria-label="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon className="h-4 w-4" /></Button>
        <Button type="button" size="icon" className={iconButtonClass} variant="ghost" title="Add column" aria-label="Add column" onClick={() => editor.chain().focus().addColumnBefore().run()} disabled={!editor.isActive("table")}><Columns2 className="h-4 w-4" /></Button>
        <Button type="button" size="icon" className={iconButtonClass} variant="ghost" title="Add row" aria-label="Add row" onClick={() => editor.chain().focus().addRowBefore().run()} disabled={!editor.isActive("table")}><Rows2 className="h-4 w-4" /></Button>
        <Button type="button" size="icon" className={iconButtonClass} variant="ghost" title="Delete table" aria-label="Delete table" onClick={() => editor.chain().focus().deleteTable().run()} disabled={!editor.isActive("table")}><Trash2 className="h-4 w-4" /></Button>
        <div className="mx-1 h-6 w-px bg-border" />
        <Button type="button" size="icon" className={iconButtonClass} variant="ghost" title="Undo" aria-label="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></Button>
        <Button type="button" size="icon" className={iconButtonClass} variant="ghost" title="Redo" aria-label="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></Button>
      </div>
      <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
        <div className="flex items-center gap-1 rounded-md border bg-background p-1 shadow-sm">
          <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleBold().run()}>B</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleItalic().run()}>I</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleUnderline().run()}>U</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleHighlight().run()}>H</Button>
        </div>
      </BubbleMenu>
      <FloatingMenu editor={editor} tippyOptions={{ duration: 100 }}>
        <div className="flex items-center gap-1 rounded-md border bg-background p-1 shadow-sm">
          <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleTaskList().run()}>☑</Button>
        </div>
      </FloatingMenu>
      <div className="rounded-md border border-slate-200 bg-white shadow-sm">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
