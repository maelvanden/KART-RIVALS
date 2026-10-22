import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { colors, spacing } from '@/theme';

type Mode = 'sign-in' | 'sign-up';

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function submit() {
    setMessage(null);
    if (!isSupabaseConfigured) {
      setMessage({ text: 'Supabase n’est pas configuré (fichier .env manquant).', error: true });
      return;
    }
    setLoading(true);
    const credentials = { email: email.trim(), password };
    const { data, error } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);
    setLoading(false);
    if (error) {
      setMessage({ text: error.message, error: true });
    } else if (mode === 'sign-up' && !data.session) {
      setMessage({ text: 'Compte créé ! Confirme ton e-mail puis connecte-toi.', error: false });
    }
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#252C14', colors.background, colors.background, '#2A1A14']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.content}>
          <View style={styles.hero}>
            <View style={styles.checker}>
              {Array.from({ length: 8 }).map((_, i) => (
                <View key={i} style={[styles.square, { backgroundColor: (Math.floor(i / 4) + i) % 2 ? colors.text : 'transparent' }]} />
              ))}
            </View>
            <Text variant="display">
              KART <Text variant="display" style={{ color: colors.neon }}>RIVALS</Text>
            </Text>
            <Text variant="caption" style={styles.tagline}>
              Défie les pilotes de ta région, valide tes courses, grimpe au classement.
            </Text>
          </View>

          <View style={styles.form}>
            <Segmented
              options={[
                { value: 'sign-in', label: 'Connexion' },
                { value: 'sign-up', label: 'Inscription' },
              ]}
              value={mode}
              onChange={setMode}
            />
            <Input
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="pilote@exemple.fr"
            />
            <Input
              label="Mot de passe"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              placeholder={mode === 'sign-in' ? 'Ton mot de passe' : '8 caractères minimum'}
            />
            {message ? (
              <Text style={{ color: message.error ? colors.danger : colors.neon }}>{message.text}</Text>
            ) : null}
            <Button
              title={mode === 'sign-in' ? 'Entrer en piste' : 'Créer ma licence'}
              onPress={submit}
              loading={loading}
              // Nouveaux comptes : 8 caractères minimum ; les anciens comptes à 6 caractères se connectent toujours.
              disabled={!email || password.length < (mode === 'sign-in' ? 6 : 8)}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  content: { flex: 1, padding: spacing.xl, justifyContent: 'space-between' },
  hero: { marginTop: spacing.xxl * 1.5, gap: spacing.md },
  checker: { flexDirection: 'row', flexWrap: 'wrap', width: 64, borderWidth: 1, borderColor: colors.text },
  square: { width: 15.5, height: 15.5 },
  tagline: { fontSize: 16, lineHeight: 22, maxWidth: 300 },
  form: { gap: spacing.lg, marginBottom: spacing.lg },
});
