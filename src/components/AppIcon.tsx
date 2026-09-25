import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Thin wrapper so screens can pass a plain string icon name without fighting
 * the icon set's literal union type.
 */
export function AppIcon({
  name,
  size = 20,
  color,
}: {
  name: string;
  size?: number;
  color: ColorValue;
}) {
  return <MaterialCommunityIcons name={name as IconName} size={size} color={color} />;
}
