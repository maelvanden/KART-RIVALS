import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import type { ColorValue } from 'react-native';

import { colors } from '@/theme';

export type IconName = { ios: SFSymbol; material: AndroidSymbol };

export const icons = {
  license: { ios: 'person.text.rectangle', material: 'id_card' },
  challenge: { ios: 'flag.checkered', material: 'sports_score' },
  nearby: { ios: 'location.fill', material: 'near_me' },
  trophy: { ios: 'trophy.fill', material: 'emoji_events' },
  bolt: { ios: 'bolt.fill', material: 'bolt' },
  clock: { ios: 'clock', material: 'schedule' },
  timer: { ios: 'stopwatch', material: 'timer' },
  pin: { ios: 'mappin.and.ellipse', material: 'location_on' },
  check: { ios: 'checkmark', material: 'check' },
  close: { ios: 'xmark', material: 'close' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', material: 'logout' },
  edit: { ios: 'pencil', material: 'edit' },
  chevron: { ios: 'chevron.right', material: 'chevron_right' },
  search: { ios: 'magnifyingglass', material: 'search' },
  map: { ios: 'map.fill', material: 'map' },
  directions: { ios: 'arrow.triangle.turn.up.right.diamond.fill', material: 'directions' },
  star: { ios: 'star.fill', material: 'star' },
  starOutline: { ios: 'star', material: 'star_border' },
  flame: { ios: 'flame.fill', material: 'local_fire_department' },
  medal: { ios: 'medal.fill', material: 'military_tech' },
  crown: { ios: 'crown.fill', material: 'crown' },
  explore: { ios: 'safari.fill', material: 'explore' },
  helmet: { ios: 'flag.checkered.2.crossed', material: 'sports_motorsports' },
  trending: { ios: 'chart.line.uptrend.xyaxis', material: 'trending_up' },
  premium: { ios: 'rosette', material: 'workspace_premium' },
  lock: { ios: 'lock.fill', material: 'lock' },
} satisfies Record<string, IconName>;

type Props = { name: IconName; size?: number; color?: ColorValue };

export function Icon({ name, size = 20, color = colors.text }: Props) {
  return (
    <SymbolView
      name={{ ios: name.ios, android: name.material, web: name.material }}
      size={size}
      tintColor={color}
    />
  );
}
