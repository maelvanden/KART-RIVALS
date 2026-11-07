import { router } from 'expo-router';

import { WelcomeTour } from '@/features/welcome/welcome-tour';

/** Revoir la présentation (depuis Modifier ma licence). */
export default function WelcomeScreen() {
  return <WelcomeTour onDone={() => router.back()} />;
}
