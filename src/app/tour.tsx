import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, type ScrollViewInstance, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TourSceneView, type TourScene } from '@/components/tour-scenes';
import { Button, Text } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { makeStyles, useColors } from '@/lib/appearance';
import { useFamily, useMe } from '@/lib/session';

const PAGES: TourScene[] = ['loop', 'recipes', 'week', 'groceries', 'family'];

/**
 * The get-started tour (GRO-49): five swipeable pages that walk the weekly loop, then hand over
 * to the first real step. Opens by itself until finished or skipped, and again from Family.
 */
export default function TourScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { user } = useMe();
  const family = useFamily();
  const finishTour = useMutation(api.users.finishTour);
  const recipes = useQuery(api.recipes.list, { groupId: family.groupId });
  const [page, setPage] = useState(0);
  const pager = useRef<ScrollViewInstance>(null);
  // Set on the first exit, so a double tap cannot navigate twice.
  const leaving = useRef(false);
  const last = page === PAGES.length - 1;
  // Someone joining a family that already has recipes goes straight to planning.
  const hasRecipes = (recipes?.length ?? 0) > 0;

  function go(to: number) {
    setPage(to);
    pager.current?.scrollTo({ x: to * width, animated: true });
  }

  /** Leaves the tour for `next`, or for wherever it was opened from. */
  function done(next?: 'recipe' | 'week') {
    if (leaving.current) return;
    leaving.current = true;
    // Saved in the background: if it fails, the tour just shows again next time.
    if (!user.tourDone) void finishTour({}).catch(() => undefined);
    // Opened from Family it sits on top of the tabs; on first run it is the only screen.
    if (router.canGoBack()) {
      router.back();
      if (next) router.navigate(next === 'recipe' ? '/recipes' : '/week');
    } else {
      router.replace(next === 'recipe' ? '/recipes' : '/week');
    }
    if (next === 'recipe') router.push('/recipe/edit');
  }

  return (
    <View
      style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.top}>
        <Text variant="label" color={colors.muted}>
          {t('tour.open')}
        </Text>
        {last ? (
          <View style={{ height: 44 }} />
        ) : (
          <Button kind="ghost" title={t('tour.skip')} onPress={() => done()} />
        )}
      </View>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {PAGES.map((scene, index) => (
          // Each page scrolls on its own, for small phones and large text sizes.
          <ScrollView
            key={scene}
            style={{ width }}
            contentContainerStyle={styles.page}
            // Only the visible page is read out, so swiping and Next stay in step.
            accessibilityElementsHidden={index !== page}
            importantForAccessibility={index === page ? 'auto' : 'no-hide-descendants'}>
            {/* Smaller drawings on small phones, so the text and buttons still fit. */}
            <TourSceneView scene={scene} height={Math.round(Math.min(300, height * 0.36))} />
            <Text variant="title" accessibilityRole="header" style={{ marginTop: 28 }}>
              {t(`tour.${scene}.title`)}
            </Text>
            <Text color={colors.muted} style={{ marginTop: 10 }}>
              {t(`tour.${scene}.body`)}
            </Text>
          </ScrollView>
        ))}
      </ScrollView>

      <View style={styles.bottom}>
        <View
          style={styles.dots}
          accessible
          accessibilityLabel={t('tour.page', { page: page + 1, count: PAGES.length })}>
          {PAGES.map((scene, index) => (
            <View key={scene} style={[styles.dot, index === page && styles.dotOn]} />
          ))}
        </View>
        {last ? (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                kind="secondary"
                title={t('tour.back')}
                style={{ flex: 1 }}
                onPress={() => go(page - 1)}
              />
              <Button
                title={hasRecipes ? t('tour.planWeek') : t('tour.addFirstRecipe')}
                style={{ flex: 2 }}
                onPress={() => done(hasRecipes ? 'week' : 'recipe')}
              />
            </View>
            <Button
              kind="ghost"
              title={t('tour.lookAround')}
              style={{ alignSelf: 'center' }}
              onPress={() => done()}
            />
          </>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {page > 0 ? (
              <Button
                kind="secondary"
                title={t('tour.back')}
                style={{ flex: 1 }}
                onPress={() => go(page - 1)}
              />
            ) : null}
            <Button title={t('tour.next')} style={{ flex: 2 }} onPress={() => go(page + 1)} />
          </View>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  top: {
    paddingHorizontal: 20,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  page: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  bottom: { paddingHorizontal: 20, gap: 14 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: Radius.pill, backgroundColor: colors.dashed },
  dotOn: { width: 22, backgroundColor: colors.tomatoFill },
}));
