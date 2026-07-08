// ToggleRow — a SettingRow whose trailing element is an on/off Switch (the on-state
// uses brand Indigo, the thumb the raised-surface white). Shared by the settings
// surfaces so the toggle row is defined once, not per screen.

import { Switch } from 'react-native';

import { SettingRow } from '@/components/ui/SettingRow';
import { COLORS } from '@/styles/tokens';

export function ToggleRow({
  title,
  description,
  value,
  onValueChange,
  disabled = false,
}: {
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <SettingRow
      title={title}
      description={description}
      trailing={
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ false: COLORS.border, true: COLORS.brandPrimary }}
          thumbColor={COLORS.surfaceRaised}
        />
      }
    />
  );
}
