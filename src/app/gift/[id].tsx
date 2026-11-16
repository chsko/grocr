import { useMutation, useQuery } from 'convex/react';
import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, ScrollView, View } from 'react-native';

import { Button, Chip, Field, Loading, Text } from '@/components/ui';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { parsePrice } from '@/convex/lib/gifts';
import { normalizeRecipeUrl, recipeSite } from '@/convex/lib/recipeLink';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { priceInput } from '@/lib/format';

/**
 * One gift's details (#81): title, price, link, note and who buys it. The buyer choices leave
 * out the person the gift is for. A gift deleted or hidden on another phone just closes.
 */
/** Back to the list; a gift opened straight from a link (the website) has nothing behind it. */
function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/gifts');
}

export default function GiftScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const giftId = id as Id<'gifts'>;
  const gift = useQuery(api.gifts.gift, { giftId });
  const gone = gift === null;
  useEffect(() => {
    if (gone) close();
  }, [gone]);
  if (!gift) return <Loading />;
  return <GiftForm key={gift._id} gift={gift} />;
}

type Gift = NonNullable<ReturnType<typeof useQuery<typeof api.gifts.gift>>>;

function GiftForm({ gift }: { gift: Gift }) {
  const colors = useColors();
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const updateGift = useMutation(api.gifts.updateGift);
  const removeGift = useMutation(api.gifts.removeGift);
  const moveGift = useMutation(api.gifts.moveGift);
  const [title, setTitle] = useState(gift.title);
  const [price, setPrice] = useState(priceInput(i18n.language, gift.price));
  const [url, setUrl] = useState(gift.url ?? '');
  const [note, setNote] = useState(gift.note ?? '');
  const [buyer, setBuyer] = useState(gift.buyerUserId);
  const [busy, setBusy] = useState(false);

  async function save() {
    const parsed = parsePrice(price);
    if (parsed === null) {
      Alert.alert(t('errors.title'), t('errors.INVALID_PRICE'));
      return;
    }
    if (title.trim() === '') {
      Alert.alert(t('errors.title'), t('errors.GIFT_TITLE_REQUIRED'));
      return;
    }
    setBusy(true);
    const ok = await attempt(t, () =>
      updateGift({
        giftId: gift._id,
        title,
        price: parsed ?? null,
        url,
        note,
        buyerUserId: buyer,
      }).then(() => true),
    );
    setBusy(false);
    if (ok) close();
  }

  function remove() {
    Alert.alert(t('gifts.edit.deleteTitle', { title: gift.title }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('gifts.edit.delete'),
        style: 'destructive',
        onPress: async () => {
          // The list query turns null and GiftScreen closes the sheet, so close only once.
          await attempt(t, () => removeGift({ giftId: gift._id }));
        },
      },
    ]);
  }

  const link = normalizeRecipeUrl(url);
  async function open(target: string) {
    try {
      await WebBrowser.openBrowserAsync(target, {
        controlsColor: colors.tomato,
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch {
      await Linking.openURL(target).catch(() => {});
    }
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}>
      <Text color={colors.muted}>{t('gifts.edit.forPerson', { name: gift.recipientName })}</Text>
      <Field
        label={t('gifts.edit.titleLabel')}
        value={title}
        onChangeText={setTitle}
        maxLength={120}
      />
      <Field
        label={t('gifts.edit.price')}
        value={price}
        onChangeText={setPrice}
        placeholder={t('gifts.edit.pricePlaceholder')}
        keyboardType="decimal-pad"
        maxLength={20}
      />
      <View style={{ gap: 8 }}>
        <Field
          label={t('gifts.edit.link')}
          value={url}
          onChangeText={setUrl}
          placeholder={t('gifts.edit.linkPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          maxLength={2000}
        />
        {link ? (
          <Button
            kind="ghost"
            title={`${t('gifts.edit.openLink')} (${recipeSite(link)})`}
            onPress={() => void open(link)}
          />
        ) : null}
      </View>
      <Field
        label={t('gifts.edit.note')}
        value={note}
        onChangeText={setNote}
        placeholder={t('gifts.edit.notePlaceholder')}
        multiline
        maxLength={500}
        inputStyle={{ minHeight: 80, textAlignVertical: 'top' }}
      />
      <View style={{ gap: 8 }}>
        <Text variant="label" color={colors.muted}>
          {t('gifts.edit.buyer')}
        </Text>
        <View style={styles.chips}>
          <Chip
            title={t('gifts.edit.nobody')}
            selected={buyer === null}
            accessibilityState={{ selected: buyer === null }}
            onPress={() => setBuyer(null)}
          />
          {gift.buyers.map((m) => (
            <Chip
              key={m.userId}
              title={m.name}
              selected={buyer === m.userId}
              accessibilityState={{ selected: buyer === m.userId }}
              onPress={() => setBuyer(m.userId)}
            />
          ))}
        </View>
      </View>
      <Button title={t('common.save')} onPress={() => void save()} disabled={busy} />
      {gift.year !== null ? (
        <Button
          kind="secondary"
          title={t('gifts.edit.toBank')}
          onPress={async () => {
            const ok = await attempt(t, () =>
              moveGift({ giftId: gift._id, year: null }).then(() => true),
            );
            if (ok) close();
          }}
        />
      ) : null}
      <Button kind="danger" title={t('gifts.edit.delete')} onPress={remove} />
    </ScrollView>
  );
}

const useStyles = makeStyles(() => ({
  content: { padding: 20, paddingBottom: 48, gap: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}));
