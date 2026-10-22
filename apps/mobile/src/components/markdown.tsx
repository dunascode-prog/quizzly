import { Fragment, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { MathBlock } from '@/components/math-block';
import { CitationChip } from '@/components/ui/citation-chip';
import { GroundingCallout } from '@/components/ui/grounding-callout';
import { Text } from '@/components/ui/text';
import { FontFamily, Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/*
 * Renders the Markdown subset the explanation prompt asks for (prompts/explanation/v1.md):
 * headings, paragraphs, lists, bold/italic/inline code, [p. N] citations, fenced code, $$ maths,
 * simple tables, and "Additional context (not in your notes)" block quotes (FR-EXPL-03/05).
 */

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; code: string }
  | { kind: 'math'; tex: string }
  | { kind: 'callout'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'table'; rows: string[][] };

const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+/;
const OUTSIDE_NOTES = /^\**additional context \(not in your notes\):?\**\s*/i;

function startsBlock(line: string) {
  return /^```/.test(line) || line.trim().startsWith('$$') || /^#{1,6}\s/.test(line) || /^\s*>/.test(line) || LIST_ITEM.test(line) || /^\s*\|/.test(line);
}

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^```/.test(trimmed)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) body.push(lines[i++]);
      i++;
      blocks.push({ kind: 'code', code: body.join('\n') });
    } else if (trimmed.startsWith('$$')) {
      if (trimmed.length > 4 && trimmed.endsWith('$$')) {
        blocks.push({ kind: 'math', tex: trimmed.slice(2, -2).trim() });
        i++;
      } else {
        const body = [trimmed.slice(2)];
        i++;
        while (i < lines.length && !lines[i].includes('$$')) body.push(lines[i++]);
        if (i < lines.length) body.push(lines[i++].split('$$')[0]);
        blocks.push({ kind: 'math', tex: body.join('\n').trim() });
      }
    } else if (/^#{1,6}\s/.test(trimmed)) {
      const level = trimmed.match(/^#+/)![0].length;
      blocks.push({ kind: 'heading', level, text: trimmed.replace(/^#+\s*/, '').replace(/\s*#+$/, '') });
      i++;
    } else if (/^>/.test(trimmed)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, '').trim());
      const text = body.filter(Boolean).join(' ');
      blocks.push(OUTSIDE_NOTES.test(text) ? { kind: 'callout', text: text.replace(OUTSIDE_NOTES, '') } : { kind: 'quote', text });
    } else if (LIST_ITEM.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (LIST_ITEM.test(l)) {
          items.push(l.replace(LIST_ITEM, '').trim());
          i++;
        } else if (l.trim() && /^\s+/.test(l) && items.length) {
          items[items.length - 1] += ' ' + l.trim(); // wrapped item
          i++;
        } else if (!l.trim() && i + 1 < lines.length && LIST_ITEM.test(lines[i + 1])) {
          i++; // blank line between items of one list
        } else break;
      }
      blocks.push({ kind: 'list', ordered, items });
    } else if (/^\|/.test(trimmed)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const row = lines[i++].trim();
        if (/^\|?[\s:|-]+\|?$/.test(row)) continue; // the |---|---| separator
        rows.push(row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      }
      blocks.push({ kind: 'table', rows });
    } else if (!trimmed) {
      i++;
    } else {
      const body: string[] = [];
      while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) body.push(lines[i++].trim());
      blocks.push({ kind: 'paragraph', text: body.join(' ') });
    }
  }
  return blocks;
}

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[p\.\s*\d{1,4}\]|\*[^*\s][^*]*\*|_[^_\s][^_]*_|\$[^$\n]+\$)/g;

function Inline({ text, onCite }: { text: string; onCite: (page: number) => void }) {
  const theme = useTheme();
  const parts = text.split(INLINE).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        const cite = part.match(/^\[p\.\s*(\d+)\]$/);
        if (cite) {
          const page = Number(cite[1]);
          return <CitationChip key={i} page={page} onPress={() => onCite(page)} />;
        }
        if (/^(\*\*|__).+(\*\*|__)$/.test(part)) {
          return (
            <Text key={i} variant="reading" style={styles.bold}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (/^`.+`$/.test(part) || /^\$.+\$$/.test(part)) {
          return (
            <Text key={i} variant="reading" style={[styles.inlineCode, { backgroundColor: theme.backgroundElement }]}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        if (/^[*_].+[*_]$/.test(part)) {
          return (
            <Text key={i} variant="reading" style={styles.italic}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

function Para({ text, onCite, variant = 'reading' as const }: { text: string; onCite: (p: number) => void; variant?: 'reading' | 'body' }) {
  return (
    <Text variant={variant}>
      <Inline text={text} onCite={onCite} />
    </Text>
  );
}

export function Markdown({ content, onCite }: { content: string; onCite: (page: number) => void }) {
  const theme = useTheme();
  const blocks = parseBlocks(content);
  const out: ReactNode[] = blocks.map((b, i) => {
    switch (b.kind) {
      case 'heading':
        return (
          <Text key={i} variant={b.level <= 2 ? 'heading' : 'label'} accessibilityRole="header" style={i > 0 && styles.headingGap}>
            {b.text.replace(/\*\*/g, '')}
          </Text>
        );
      case 'paragraph':
        return <Para key={i} text={b.text} onCite={onCite} />;
      case 'list':
        return (
          <View key={i} style={styles.list}>
            {b.items.map((item, j) => (
              <View key={j} style={styles.item}>
                <Text variant="reading" style={styles.marker} importantForAccessibility="no">
                  {b.ordered ? `${j + 1}.` : '•'}
                </Text>
                <View style={styles.itemText}>
                  <Para text={item} onCite={onCite} />
                </View>
              </View>
            ))}
          </View>
        );
      case 'code':
        return (
          <ScrollView key={i} horizontal style={[styles.code, { backgroundColor: theme.text }]} contentContainerStyle={styles.codeInner}>
            <Text color="onInk" style={styles.codeText} selectable>
              {b.code}
            </Text>
          </ScrollView>
        );
      case 'math':
        return <MathBlock key={i} tex={b.tex} />;
      case 'callout':
        return (
          <GroundingCallout key={i}>
            <Para text={b.text} onCite={onCite} variant="body" />
          </GroundingCallout>
        );
      case 'quote':
        return (
          <View key={i} style={[styles.quote, { borderColor: theme.line }]}>
            <Para text={b.text} onCite={onCite} />
          </View>
        );
      case 'table':
        return (
          <View key={i} style={[styles.table, { borderColor: theme.line }]}>
            {b.rows.map((row, r) => (
              <View key={r} style={[styles.row, r > 0 && { borderTopWidth: 1, borderColor: theme.line }]}>
                {row.map((cell, c) => (
                  <View key={c} style={styles.cell}>
                    <Text variant="small" style={r === 0 && styles.bold}>
                      <Inline text={cell} onCite={onCite} />
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        );
    }
  });
  return <View style={styles.root}>{out}</View>;
}

const styles = StyleSheet.create({
  root: { gap: Spacing.three },
  headingGap: { marginTop: Spacing.two },
  bold: { fontFamily: FontFamily.semibold },
  italic: { fontStyle: 'italic' },
  inlineCode: { fontFamily: Fonts.mono, fontSize: 15 },
  list: { gap: Spacing.two },
  item: { flexDirection: 'row', gap: Spacing.two },
  marker: { minWidth: 18 },
  itemText: { flex: 1 },
  code: { borderRadius: Radius.option + 2 },
  codeInner: { padding: Spacing.gutter },
  codeText: { fontFamily: Fonts.mono, fontSize: 13, lineHeight: 22 },
  quote: { borderLeftWidth: 3, paddingLeft: Spacing.three },
  table: { borderWidth: 1, borderRadius: Radius.field / 2, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  cell: { flex: 1, padding: Spacing.two },
});
