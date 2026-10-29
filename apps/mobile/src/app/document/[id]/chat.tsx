import { router, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArrowUp, ChevronLeft, Flag, ThumbsDown, ThumbsUp } from '@/components/icons';
import { Markdown } from '@/components/markdown';
import { Banner } from '@/components/ui/banner';
import { CitationChip } from '@/components/ui/citation-chip';
import { GroundingCallout } from '@/components/ui/grounding-callout';
import { HeroCard } from '@/components/ui/hero-card';
import { IconButton } from '@/components/ui/icon-button';
import { Pill } from '@/components/ui/pill';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Radius, Size, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ask, type ChatMessage, ChatStreamError, citedPages, splitReply, useChat } from '@/lib/chat';
import { friendlyError } from '@/lib/errors';
import { createQuiz } from '@/lib/quiz';
import { useOutline, useRate } from '@/lib/study';

const SUGGESTIONS = ['Summarise the main points', 'What is most likely to come out in the exam?'];
// Quick actions after an answer (FR-CHAT-06); "Quiz me on this" builds a quiz instead of asking.

function UserBubble({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.bubble, styles.user, { backgroundColor: theme.text }]}>
      <Text variant="reading" color="onInk">
        {text}
      </Text>
    </View>
  );
}

type AnswerProps = {
  content: string;
  pages: number[];
  documentId: string;
  /** Stored answers can be rated and reported; the one still streaming can't. */
  message?: ChatMessage;
  selected?: boolean;
  onLongPress?: () => void;
};

function AnswerBubble({ content, pages, documentId, message, selected, onLongPress }: AnswerProps) {
  const theme = useTheme();
  const rate = useRate('chat_message');
  const [rated, setRated] = useState<1 | -1 | null>(null);
  const { answer, outside } = splitReply(content);
  const open = (n: number) => router.push({ pathname: '/document/[id]/page/[n]', params: { id: documentId, n: String(n) } });
  const thumbs = (rating: 1 | -1) => {
    if (!message) return;
    setRated(rating);
    rate.mutate({ target_id: message.id, rating });
  };
  const report = () =>
    message && router.push({ pathname: '/report', params: { targetId: message.id, targetType: 'chat_message' } });

  return (
    <View style={styles.answerWrap}>
      <Pressable
        onLongPress={onLongPress}
        disabled={!message}
        accessibilityHint={message ? 'Long-press to rate or report this answer' : undefined}
        accessibilityActions={
          message
            ? [
                { name: 'helpful', label: 'Helpful' },
                { name: 'unhelpful', label: 'Not helpful' },
                { name: 'report', label: 'Report' },
              ]
            : undefined
        }
        onAccessibilityAction={(e) =>
          e.nativeEvent.actionName === 'report' ? report() : thumbs(e.nativeEvent.actionName === 'helpful' ? 1 : -1)
        }
        style={[styles.bubble, styles.assistant, { backgroundColor: theme.backgroundElement }]}>
        {answer ? (
          <Markdown content={answer} onCite={open} />
        ) : (
          <View style={styles.thinking} accessibilityLabel="Reading your notes">
            <ProgressRing size={20} strokeWidth={2.5} color="text" trackColor="line" />
            <Text variant="body" color="textSecondary">
              Reading your notes…
            </Text>
          </View>
        )}
        {pages.length ? (
          <View style={styles.chips}>
            {pages.slice(0, 4).map((p) => (
              <CitationChip key={p} page={p} onPress={() => open(p)} />
            ))}
          </View>
        ) : null}
        {outside ? (
          <GroundingCallout>
            <Text variant="body">{outside}</Text>
          </GroundingCallout>
        ) : null}
      </Pressable>
      {selected && message ? (
        <View style={styles.actions}>
          <IconButton
            icon={ThumbsUp}
            tone={rated === 1 ? 'ink' : 'light'}
            accessibilityLabel={rated === 1 ? 'Marked helpful' : 'Helpful'}
            onPress={() => thumbs(1)}
          />
          <IconButton
            icon={ThumbsDown}
            tone={rated === -1 ? 'ink' : 'light'}
            accessibilityLabel={rated === -1 ? 'Marked not helpful' : 'Not helpful'}
            onPress={() => thumbs(-1)}
          />
          <IconButton icon={Flag} accessibilityLabel="Report this answer" onPress={report} />
        </View>
      ) : null}
    </View>
  );
}

// Screen 08 (DESIGN.md §7): questions about one document, answered from its pages with citations,
// streamed as they're written (FR-CHAT-01..06).
export default function ChatScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const chat = useChat(id);
  const outline = useOutline(id);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<{ question: string; soFar: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [quizzing, setQuizzing] = useState(false);

  const messages = chat.data?.messages ?? [];
  const title = outline.data?.document.title;
  const last = messages[messages.length - 1];
  const busy = pending !== null;

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setText('');
    setError(null);
    setSelected(null);
    setPending({ question: q, soFar: '' });
    try {
      const done = await ask(id, q, (soFar) => setPending({ question: q, soFar }));
      AccessibilityInfo.announceForAccessibility(splitReply(done.answer.content).answer);
    } catch (e) {
      setError(e instanceof ChatStreamError ? e.message : friendlyError(e));
      setText(q); // keep the question so it can be sent again
    } finally {
      setPending(null);
      // The stored answer can lay out taller than the streamed one (citation chips).
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  // "Quiz me on this": 5 questions on the topic the last answer cited (FR-CHAT-06).
  const lastTopic =
    last?.role === 'assistant' && last.citations.length
      ? outline.data?.topics.find((t) =>
          last.citations.some((c) => t.page_start !== null && t.page_end !== null && c.page >= t.page_start && c.page <= t.page_end),
        )
      : undefined;
  const quizMe = async () => {
    if (!lastTopic) return;
    setQuizzing(true);
    setError(null);
    try {
      const quiz = await createQuiz(id, {
        topic_ids: [lastTopic.id],
        types: ['mcq', 'true_false', 'fill_blank'],
        difficulty: 'mixed',
        count: 5,
        mode: 'practice',
      });
      router.push({ pathname: '/quiz/[id]/play', params: { id: quiz.id, mode: 'practice' } });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setQuizzing(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.inner, styles.header]}>
          <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
          <View style={styles.flex}>
            <Text variant="heading" accessibilityRole="header">
              Ask your notes
            </Text>
            {title ? (
              <Text variant="small" color="textSecondary" numberOfLines={1}>
                {title}
              </Text>
            ) : null}
          </View>
        </View>

        <ScrollView
          ref={scroll}
          style={styles.flex}
          contentContainerStyle={[styles.inner, styles.list]}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
          {chat.isError ? <Banner message={friendlyError(chat.error)} /> : null}
          {chat.data && messages.length === 0 && !busy ? (
            <HeroCard>
              <Text variant="title" color="onInk">
                Ask anything about {title ?? 'these notes'}
              </Text>
              <Text variant="body" color="mutedOnInk">
                Answers come from your notes, with the page they came from. If your notes don&apos;t cover it, you&apos;ll
                be told.
              </Text>
            </HeroCard>
          ) : null}
          {messages.map((m) =>
            m.role === 'user' ? (
              <UserBubble key={m.id} text={m.content} />
            ) : (
              <AnswerBubble
                key={m.id}
                content={m.content}
                pages={m.citations.map((c) => c.page)}
                documentId={id}
                message={m}
                selected={selected === m.id}
                onLongPress={() => setSelected((s) => (s === m.id ? null : m.id))}
              />
            ),
          )}
          {pending ? (
            <>
              <UserBubble text={pending.question} />
              <AnswerBubble content={pending.soFar} pages={citedPages(pending.soFar)} documentId={id} />
            </>
          ) : null}
          {error ? <Banner message={error} /> : null}
        </ScrollView>

        <View style={[styles.inner, styles.footer]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} keyboardShouldPersistTaps="handled">
            {messages.length === 0
              ? SUGGESTIONS.map((s) => <Pill key={s} label={s} onPress={() => send(s)} />)
              : last?.role === 'assistant' && !busy
                ? [
                    // Order as in design 08: the two that fit on screen first, then "Give an example".
                    <Pill key="simpler" label="Explain simpler" onPress={() => send('Explain that more simply.')} />,
                    lastTopic ? (
                      <Pill key="quiz" label={quizzing ? 'Making a quiz…' : 'Quiz me on this'} onPress={quizMe} />
                    ) : null,
                    <Pill key="example" label="Give an example" onPress={() => send('Give me an example.')} />,
                  ]
                : null}
          </ScrollView>
          <View style={[styles.input, { backgroundColor: theme.backgroundElement }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Ask a question"
              placeholderTextColor={theme.textSecondary}
              selectionColor={theme.text}
              accessibilityLabel="Your question"
              maxLength={2000}
              multiline
              // Web textareas default to two rows; one keeps the placeholder centred in the pill.
              numberOfLines={Platform.OS === 'web' ? 1 : undefined}
              submitBehavior="submit"
              returnKeyType="send"
              onSubmitEditing={() => send(text)}
              onKeyPress={(e) => {
                // Web: Enter sends, Shift+Enter starts a new line (native uses the keyboard's send key).
                const key = e.nativeEvent as { key: string; shiftKey?: boolean };
                if (Platform.OS === 'web' && key.key === 'Enter' && !key.shiftKey) {
                  e.preventDefault();
                  void send(text);
                }
              }}
              style={[styles.field, { color: theme.text }]}
            />
            <Pressable
              onPress={() => send(text)}
              disabled={!text.trim() || busy}
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !text.trim() || busy }}
              style={({ pressed }) => [
                styles.send,
                { backgroundColor: theme.text, opacity: !text.trim() || busy ? 0.45 : pressed ? 0.8 : 1 },
              ]}>
              <ArrowUp size={24} color={theme.onInk} strokeWidth={2.2} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.gutter },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  list: { gap: Spacing.three, paddingVertical: Spacing.three },
  bubble: { borderRadius: 24, paddingHorizontal: Spacing.gutter - 2, paddingVertical: Spacing.three, gap: Spacing.twoHalf },
  user: { alignSelf: 'flex-end', maxWidth: '85%', borderBottomRightRadius: 8 },
  assistant: { alignSelf: 'flex-start', maxWidth: '94%', borderBottomLeftRadius: 8 },
  answerWrap: { gap: Spacing.two },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: -Spacing.one, paddingBottom: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two },
  footer: { gap: Spacing.twoHalf, paddingBottom: Spacing.three, paddingTop: Spacing.one },
  quick: { gap: Spacing.two },
  input: {
    minHeight: Size.field,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.gutter,
    paddingRight: (Size.field - 52) / 2,
    gap: Spacing.two,
  },
  field: { ...Type.reading, flex: 1, maxHeight: 120, paddingVertical: Spacing.twoHalf, outlineWidth: 0 },
  send: { width: 52, height: 52, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
});
