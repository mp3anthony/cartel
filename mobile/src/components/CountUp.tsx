import { Text, type StyleProp, type TextStyle } from 'react-native';

import { useMountProgress } from '../theme/motion';

/**
 * A whole number that counts up from 0 on mount (#145), over the shared on-mount motion.
 * Once the motion has finished a changed `value` shows immediately, never counting again.
 * Visual only: callers that speak the number to assistive tech do it in their own label,
 * so a screen reader never hears a mid-count value.
 */
export function CountUp({ value, style }: { value: number; style?: StyleProp<TextStyle> }) {
  const progress = useMountProgress();
  return (
    <Text style={[style, { fontVariant: ['tabular-nums'] }]}>{Math.round(value * progress)}</Text>
  );
}
