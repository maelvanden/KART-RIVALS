import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Apple, isAppleSignInAvailable, signInWithApple, signInWithGoogle } from '@/features/auth/social-sign-in';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors, radius, spacing } from '@/theme';

/** « Continuer avec Google / Apple » : le compte est créé à la première connexion, puis on choisit son pseudo. */
export function SocialButtons({ onError }: { onError: (message: string | null) => void }) {
  const [apple, setApple] = useState(false);
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);

  useEffect(() => {
    isAppleSignInAvailable()
      .then(setApple)
      .catch(() => setApple(false));
  }, []);

  const run = async (provider: 'google' | 'apple') => {
    if (!isSupabaseConfigured) return onError('Supabase n’est pas configuré (fichier .env manquant).');
    onError(null);
    setBusy(provider);
    try {
      await (provider === 'google' ? signInWithGoogle() : signInWithApple());
    } catch (e) {
      onError(e instanceof Error ? e.message : 'La connexion a échoué, réessaie.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.divider}>
        <View style={styles.line} />
        <Text variant="caption">ou</Text>
        <View style={styles.line} />
      </View>
      {apple && Apple ? (
        <Apple.AppleAuthenticationButton
          buttonType={Apple.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={Apple.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={radius.md}
          style={styles.apple}
          onPress={() => !busy && run('apple')}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continuer avec Google"
        disabled={!!busy}
        onPress={() => run('google')}
        style={({ pressed }) => [styles.google, pressed && styles.pressed]}>
        {busy === 'google' ? (
          <ActivityIndicator color="#1F1F1F" />
        ) : (
          <>
            <Text style={styles.g}>G</Text>
            <Text style={styles.googleText}>Continuer avec Google</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  apple: { height: 48 },
  google: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#FFFFFF',
  },
  pressed: { opacity: 0.8 },
  g: { fontSize: 20, fontWeight: '900', color: '#4285F4' },
  googleText: { fontSize: 17, fontWeight: '600', color: '#1F1F1F' },
});
