import { render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorState, EmptyState } from '@/components/StateViews';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { AppButton } from '@/components/ui/AppButton';
import { Field } from '@/components/ui/Field';
import { ListRow } from '@/components/ui/ListRow';
import { StatTile } from '@/components/ui/StatTile';
import { MIN_TAP_TARGET } from '@/theme/layout';
import { lightTheme } from '@/theme/theme';

/**
 * The shared building blocks, tested where it counts: a customer must be able to
 * hit every control with a thumb, and must never lose the only way out of a
 * broken screen.
 */

async function renderWithTheme(ui: React.ReactElement) {
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 24, left: 0, right: 0, bottom: 24 },
      }}
    >
      <PaperProvider theme={lightTheme}>{ui}</PaperProvider>
    </SafeAreaProvider>,
  );
}

/** Flattens a style tree, so a layout assertion is about the number in it. */
function numbersIn(style: unknown): number[] {
  if (Array.isArray(style)) return style.flatMap(numbersIn);
  if (style && typeof style === 'object') {
    return Object.values(style as Record<string, unknown>).flatMap((value) =>
      typeof value === 'number' ? [value] : numbersIn(value),
    );
  }
  return [];
}

describe('AppButton', () => {
  it('is at least a thumb tall, whatever the screen asks for', async () => {
    const view = await renderWithTheme(<AppButton label="Pay now" onPress={jest.fn()} testID="cta" />);
    expect(numbersIn(view.getByTestId('cta').parent?.props.style)).toContain(MIN_TAP_TARGET);
  });

  it('stretches to the full width when it is the main action of the page', async () => {
    const view = await renderWithTheme(<AppButton block label="Sign in" onPress={jest.fn()} testID="cta" />);
    expect(view.getByTestId('cta').parent?.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ alignSelf: 'stretch' })]),
    );
  });

  it('does not fire while it is loading', async () => {
    const view = await renderWithTheme(<AppButton block label="Pay" loading onPress={jest.fn()} testID="cta" />);

    expect(view.getByTestId('cta').props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true,
    });
  });

  it('is announced as a button, not as a box of text', async () => {
    const view = await renderWithTheme(<AppButton label="Sign out" onPress={jest.fn()} testID="cta" />);

    expect(view.getByTestId('cta').props.accessibilityRole).toBe('button');
    expect(view.getByTestId('cta').props.accessibilityLabel).toBe('Sign out');
  });
});

describe('ListRow', () => {
  it('shows the title, the detail and the trailing value together', async () => {
    const view = await renderWithTheme(
      <ListRow title="Installment 2" subtitle="10 Sep 2026" trailing="৳2,500" onPress={jest.fn()} />,
    );

    expect(view.getByText('Installment 2')).toBeTruthy();
    expect(view.getByText('10 Sep 2026')).toBeTruthy();
    expect(view.getByText('৳2,500')).toBeTruthy();
  });

  it('is pressable and says what it is', async () => {
    const onPress = jest.fn();
    const view = await renderWithTheme(
      <ListRow title="Installment 2" subtitle="10 Sep 2026" onPress={onPress} />,
    );

    const row = view.getByLabelText('Installment 2, 10 Sep 2026');
    expect(row.props.accessibilityRole).toBe('button');
    await row.props.onClick?.();
    expect(onPress).toHaveBeenCalled();
  });
});

describe('StatTile', () => {
  it('labels the number it is showing', async () => {
    const view = await renderWithTheme(<StatTile label="Remaining" value="৳18,500" />);

    expect(view.getByText('Remaining')).toBeTruthy();
    expect(view.getByText('৳18,500')).toBeTruthy();
  });
});

describe('InfoRow', () => {
  it('renders inside a card with both halves readable', async () => {
    const view = await renderWithTheme(
      <SectionCard title="Device">
        <InfoRow label="Model" value="SM-A155F" />
      </SectionCard>,
    );

    expect(view.getByText('DEVICE')).toBeTruthy();
    expect(view.getByLabelText('Model: SM-A155F')).toBeTruthy();
  });
});

describe('Field', () => {
  it('shows its validation message under the input', async () => {
    const view = await renderWithTheme(
      <Field
        label="Email address"
        value="nope"
        onChangeText={jest.fn()}
        error
        helper="That email address is not correct."
        testID="email"
      />,
    );

    expect(view.getByText('That email address is not correct.')).toBeTruthy();
  });
});

describe('a failed screen', () => {
  it('offers a way out when the customer is signed in', async () => {
    const view = await renderWithTheme(
      <ErrorState message="Unable to reach our servers. Please try again." onSignOut={jest.fn()} />,
    );

    expect(view.getByTestId('error-sign-out')).toBeTruthy();
  });

  it('does not offer one where there is nothing to sign out of', async () => {
    const view = await renderWithTheme(<EmptyState title="Nothing here yet" />);

    expect(view.queryByTestId('error-sign-out')).toBeNull();
    expect(view.getByText('Nothing here yet')).toBeTruthy();
  });
});
