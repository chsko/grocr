import { useMutation } from 'convex/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { showEntry, WhatsNewCard } from '@/components/whats-new';
import { Text } from '@/components/ui';
import { api } from '@/convex/_generated/api';
import { makeStyles, useColors } from '@/lib/appearance';
import { dayMonth } from '@/lib/format';
import { useMe } from '@/lib/session';
import { entriesByDate, LATEST_WHATS_NEW, unseenEntries } from '@/lib/whats-new';

/** Family > What's new: every entry, newest first, with the unseen ones marked (GRO-66). */
export default function WhatsNewScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useStyles();
  const { user } = useMe();
  const see = useMutation(api.users.seeWhatsNew);
  // Which were new when the screen opened; kept so the marks don't vanish once it is saved.
  const [fresh] = useState(() => new Set(unseenEntries(user.whatsNewSeen).map((e) => e.n)));

  useEffect(() => {
    void see({ upTo: LATEST_WHATS_NEW }).catch(() => undefined);
  }, [see]);

  let index = 0;
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}>
      <Text color={colors.muted}>{t('whatsNew.intro')}</Text>
      {entriesByDate().map((group) => (
        <View key={group.date} style={styles.group}>
          <Text variant="section" color={colors.muted}>
            {dayMonth(t, group.date)}
          </Text>
          {group.entries.map((entry) => (
            <WhatsNewCard
              key={entry.n}
              entry={entry}
              index={index++}
              isNew={fresh.has(entry.n)}
              onShow={showEntry}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const useStyles = makeStyles(() => ({
  content: { padding: 20, paddingBottom: 40, gap: 28 },
  group: { gap: 18 },
}));
