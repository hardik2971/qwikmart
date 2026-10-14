'use client';
// TipTap rich-text editor (replaces the Quill editor of components/editor.blade.php). Value is HTML.
import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import { Bold, Italic, Strikethrough, List, ListOrdered, Quote, Heading2, Heading3, Link2, AlignLeft, AlignCenter, AlignRight, Undo2, Redo2, Eraser } from 'lucide-react';
import { cx } from '@/components/ui';

export function RichEditor({ value, onChange, rtl = false, minHeight = 200 }: { value: string; onChange: (html: string) => void; rtl?: boolean; minHeight?: number }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Link.configure({ openOnClick: false }), TextAlign.configure({ types: ['heading', 'paragraph'] })],
    content: value || '',
    editorProps: { attributes: { dir: rtl ? 'rtl' : 'ltr', style: `min-height:${minHeight}px` } },
    onUpdate: ({ editor }) => { const h = editor.getHTML(); onChange(h === '<p></p>' ? '' : h); },
  });
  // external value changes (AI generate / translate)
  useEffect(() => {
    if (editor && value !== editor.getHTML() && !(value === '' && editor.getHTML() === '<p></p>')) editor.commands.setContent(value || '', { emitUpdate: false } as any);
  }, [value, editor]);
  if (!editor) return <div className="input" style={{ minHeight }} />;
  const B = ({ on, active, title, children }: { on: () => void; active?: boolean; title: string; children: React.ReactNode }) => (
    <button type="button" title={title} onClick={on} className={cx('p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700', active && 'text-primary bg-primary-50')}>{children}</button>
  );
  const i = 'w-4 h-4';
  return (
    <div className="rte rounded-lg border border-line bg-white dark:bg-slate-800 dark:border-dark-line">
      <div className="flex flex-wrap gap-0.5 border-b border-line dark:border-dark-line px-2 py-1.5 text-slate-600 dark:text-slate-300">
        <B title="Heading 2" on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}><Heading2 className={i} /></B>
        <B title="Heading 3" on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })}><Heading3 className={i} /></B>
        <B title="Bold" on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}><Bold className={i} /></B>
        <B title="Italic" on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}><Italic className={i} /></B>
        <B title="Strike" on={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')}><Strikethrough className={i} /></B>
        <B title="Bullet list" on={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}><List className={i} /></B>
        <B title="Ordered list" on={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}><ListOrdered className={i} /></B>
        <B title="Quote" on={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')}><Quote className={i} /></B>
        <B title="Align left" on={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft className={i} /></B>
        <B title="Align center" on={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter className={i} /></B>
        <B title="Align right" on={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight className={i} /></B>
        <B title="Link" on={() => { const u = window.prompt('Link URL', editor.getAttributes('link').href || 'https://'); if (u === null) return; if (!u) editor.chain().focus().unsetLink().run(); else editor.chain().focus().setLink({ href: u }).run(); }} active={editor.isActive('link')}><Link2 className={i} /></B>
        <B title="Clear formatting" on={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><Eraser className={i} /></B>
        <span className="flex-1" />
        <B title="Undo" on={() => editor.chain().focus().undo().run()}><Undo2 className={i} /></B>
        <B title="Redo" on={() => editor.chain().focus().redo().run()}><Redo2 className={i} /></B>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
