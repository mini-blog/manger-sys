import { useEffect, useId } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import DOMPurify from 'dompurify';
import { Box, Button, Stack, Typography } from '@mui/material';
const clean = (html: string) =>
  DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: [],
  });
export function RichView({ html }: { html?: string | null }) {
  return html ? (
    <Box
      sx={{ '& p': { my: 0.5 }, overflowWrap: 'anywhere' }}
      dangerouslySetInnerHTML={{ __html: clean(html) }}
    />
  ) : (
    <Typography color="text.secondary">Not provided</Typography>
  );
}
export function RichText({
  label,
  value,
  onChange,
  max = 2000,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (html: string) => void;
  max?: number;
  disabled?: boolean;
}) {
  const id = useId();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        strike: false,
        horizontalRule: false,
        link: false,
        underline: false,
      }),
    ],
    content: clean(value),
    editable: !disabled,
    editorProps: {
      attributes: { role: 'textbox', 'aria-labelledby': id, 'aria-multiline': 'true' },
    },
    onUpdate: ({ editor }) => onChange(clean(editor.getHTML())),
  });
  useEffect(() => {
    if (editor && clean(editor.getHTML()) !== clean(value))
      editor.commands.setContent(clean(value), { emitUpdate: false });
  }, [editor, value]);
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  const length = editor?.getText().length ?? 0;
  return (
    <Box>
      <Typography id={id} variant="body2" sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      <Box
        sx={{
          border: '1px solid',
          borderColor: length > max ? 'error.main' : 'divider',
          borderRadius: 1,
        }}
      >
        <Stack direction="row" sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
          <Button
            disabled={disabled}
            size="small"
            aria-label="Bold"
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <strong>B</strong>
          </Button>
          <Button
            disabled={disabled}
            size="small"
            aria-label="Italic"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <em>I</em>
          </Button>
          <Button
            disabled={disabled}
            size="small"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            Bullets
          </Button>
          <Button
            disabled={disabled}
            size="small"
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            Numbered
          </Button>
        </Stack>
        <Box sx={{ '& .tiptap': { outline: 'none', minHeight: 90, p: 1.5, '& p': { my: 0.5 } } }}>
          <EditorContent editor={editor} />
        </Box>
      </Box>
      <Typography variant="caption" color={length > max ? 'error' : 'text.secondary'}>
        {length} / {max}
      </Typography>
    </Box>
  );
}
