import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Check, ChevronRight, X } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { type Institution, institutionLabel, useInstitutionSearch } from '@/lib/profile';

export type InstitutionChoice = { kind: 'listed'; institution: Institution } | { kind: 'other'; name: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (choice: InstitutionChoice) => void;
};

/** Searchable school list; "My school isn't listed" lets the student type it (FR-PROF-02). */
export function InstitutionPicker({ visible, onClose, onPick }: Props) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState(false);
  const [other, setOther] = useState('');
  const results = useInstitutionSearch(query);

  const close = () => {
    setTyping(false);
    onClose();
  };

  const notListed = (
    <Pressable
      onPress={() => {
        setOther(query.trim());
        setTyping(true);
      }}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.8 : 1 }]}>
      <Text variant="label" style={styles.rowText}>
        My school isn&apos;t listed
      </Text>
      <ChevronRight size={20} color={theme.text} />
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text variant="title" accessibilityRole="header" style={styles.title}>
            {typing ? 'Type your school' : 'Find your school'}
          </Text>
          <IconButton icon={X} accessibilityLabel="Close" onPress={close} />
        </View>

        {typing ? (
          <View style={styles.body}>
            <TextField
              label="School name"
              value={other}
              onChangeText={setOther}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              maxLength={160}
            />
            <ActionPill
              label="Use this school"
              icon={Check}
              disabled={other.trim().length < 3}
              onPress={() => {
                onPick({ kind: 'other', name: other.trim() });
                close();
              }}
            />
          </View>
        ) : (
          <FlatList
            data={results.data ?? []}
            keyExtractor={(i) => i.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.body}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                <TextField
                  label="Search"
                  value={query}
                  onChangeText={setQuery}
                  placeholder="UNILAG or University of Lagos"
                  autoFocus
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {results.isError ? <Banner message={friendlyError(results.error)} /> : null}
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onPick({ kind: 'listed', institution: item });
                  close();
                }}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.8 : 1 },
                ]}>
                <View style={styles.rowText}>
                  <Text variant="label">{institutionLabel(item)}</Text>
                  {item.state ? (
                    <Text variant="small" color="textSecondary">
                      {item.state}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              results.isFetching ? undefined : (
                <Text variant="small" color="textSecondary" style={styles.empty}>
                  No school matches &quot;{query.trim()}&quot;.
                </Text>
              )
            }
            ListFooterComponent={notListed}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.gutter,
    paddingVertical: Spacing.three,
  },
  title: { flex: 1 },
  body: {
    paddingHorizontal: Spacing.gutter,
    paddingBottom: Spacing.five,
    gap: Spacing.twoHalf,
  },
  listHeader: { gap: Spacing.twoHalf, marginBottom: Spacing.one },
  row: {
    minHeight: Size.field,
    borderRadius: Radius.field,
    paddingHorizontal: Spacing.gutter - 2,
    paddingVertical: Spacing.twoHalf,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rowText: { flex: 1, gap: Spacing.half },
  empty: { paddingVertical: Spacing.two },
});
