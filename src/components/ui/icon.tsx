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
  suit: { ios: 'tshirt.fill', material: 'checkroom' },
  gloves: { ios: 'hand.raised.fill', material: 'back_hand' },
  shoes: { ios: 'shoe.fill', material: 'steps' },
  ribProtector: { ios: 'shield.lefthalf.filled', material: 'shield' },
  shop: { ios: 'bag.fill', material: 'shopping_bag' },
  coin: { ios: 'star.circle.fill', material: 'stars' },
  gift: { ios: 'gift.fill', material: 'redeem' },
  trending: { ios: 'chart.line.uptrend.xyaxis', material: 'trending_up' },
  premium: { ios: 'rosette', material: 'workspace_premium' },
  lock: { ios: 'lock.fill', material: 'lock' },
  group: { ios: 'person.3.fill', material: 'groups' },
  checkCircle: { ios: 'checkmark.circle.fill', material: 'check_circle' },
  radio: { ios: 'antenna.radiowaves.left.and.right', material: 'cell_tower' },
  recruit: { ios: 'person.badge.plus', material: 'person_add' },
  teammates: { ios: 'person.2.fill', material: 'group' },
  team: { ios: 'shield.checkered', material: 'shield_person' },
  send: { ios: 'paperplane.fill', material: 'send' },
  plus: { ios: 'plus', material: 'add' },
  camera: { ios: 'camera.fill', material: 'photo_camera' },
  gallery: { ios: 'photo.on.rectangle', material: 'photo_library' },
  share: { ios: 'square.and.arrow.up', material: 'ios_share' },
  poll: { ios: 'chart.bar.fill', material: 'bar_chart' },
  pinned: { ios: 'pin.fill', material: 'push_pin' },
  seen: { ios: 'checkmark.circle', material: 'done_all' },
  report: { ios: 'flag.fill', material: 'flag' },
  block: { ios: 'nosign', material: 'block' },
  more: { ios: 'ellipsis', material: 'more_horiz' },
  hidden: { ios: 'eye.slash', material: 'visibility_off' },
  ticket: { ios: 'ticket.fill', material: 'confirmation_number' },
  globe: { ios: 'globe', material: 'language' },
  phone: { ios: 'phone.fill', material: 'call' },
  route: { ios: 'point.topleft.down.to.point.bottomright.curvepath', material: 'route' },
  link: { ios: 'link', material: 'link' },
  trash: { ios: 'trash', material: 'delete' },
  admin: { ios: 'checkmark.shield.fill', material: 'admin_panel_settings' },
  locate: { ios: 'location.circle', material: 'my_location' },
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
