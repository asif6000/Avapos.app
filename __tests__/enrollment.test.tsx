import { render, userEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import EnrollmentScreen from '../app/device/enrollment';
import { DEVICE_MANAGEMENT_AGREEMENT_VERSION } from '@/config/agreement';
import { lightTheme } from '@/theme/theme';
import type { DeviceState, EnrollmentStatus } from '@/types/domain';

/**
 * The sale, and what the app is allowed to claim afterwards.
 *
 * The financing model depends on three things being true, and none of them is
 * about the code being clever:
 *
 * - the customer consents explicitly, before anything is enrolled
 * - the app reports what Android actually says, so a shop phone that was never
 *   provisioned as a device owner does not come back looking enrolled
 * - the binding is only "confirmed" when the server has said so
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));

const mockAcceptAgreement = jest.fn().mockResolvedValue({ accepted: true });
jest.mock('@/hooks/queries', () => ({
  useAcceptAgreement: () => ({ mutateAsync: mockAcceptAgreement }),
}));

jest.mock('@/store/networkStore', () => ({
  useNetworkStore: (selector: (state: { online: boolean }) => unknown) => selector({ online: true }),
}));

const mockRequestEnrollment = jest.fn();
const mockGetEnrollmentStatus = jest.fn();
const mockGetDeviceState = jest.fn();

jest.mock('@/services/deviceManagement', () => ({
  deviceManagementService: {
    requestEnrollment: (...args: unknown[]) => mockRequestEnrollment(...args),
    getEnrollmentStatus: () => mockGetEnrollmentStatus(),
    getDeviceState: () => mockGetDeviceState(),
  },
}));

async function renderScreen() {
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 24, left: 0, right: 0, bottom: 24 },
      }}
    >
      <PaperProvider theme={lightTheme}>
        <EnrollmentScreen />
      </PaperProvider>
    </SafeAreaProvider>,
  );
}

type View = Awaited<ReturnType<typeof renderScreen>>;

/**
 * Press by role rather than by testID: it is how a screen reader finds the
 * control, so a test that presses this way is also asserting the control is
 * reachable at all.
 */
const pressNext = (view: View) => userEvent.press(view.getByRole('button', { name: 'Next' }));

/** Reads through every explanation, which is the step just before the agreement. */
async function walkToTheAgreement(view: View) {
  for (let step = 0; step < 12; step += 1) {
    if (!view.queryByTestId('enrollment-next')) return;
    await pressNext(view);
  }
}

/** Reads through, ticks the box, types the name, submits. */
async function acceptTheAgreement(view: View) {
  await walkToTheAgreement(view);
  await userEvent.press(view.getByRole('checkbox'));
  await userEvent.type(view.getByTestId('enrollment-signature'), 'Asif Hossain');
  await userEvent.press(view.getByRole('button', { name: 'Accept and continue' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAcceptAgreement.mockResolvedValue({ accepted: true });
  mockGetEnrollmentStatus.mockResolvedValue('NOT_ENROLLED' as EnrollmentStatus);
  mockGetDeviceState.mockResolvedValue(null as DeviceState | null);
});

describe('enrollment', () => {
  it('tells the customer what the shop has to do, and what the app cannot', async () => {
    const view = await renderScreen();

    // The chain, in the order it happens.
    expect(
      await view.findByText('How this works when you buy the phone'),
    ).toBeTruthy();
    expect(view.getByText(/The shop provisions the phone as an Android Enterprise device owner/)).toBeTruthy();

    await walkToTheAgreement(view);
    // The honest limits, stated before anyone signs anything: the last three
    // steps, reached by stepping back from the agreement.
    // The header's back and the step's back both say "Back"; step back three
    // times to reach the last three explanations.
    for (let back = 0; back < 3; back += 1) {
      await userEvent.press(view.getByTestId('enrollment-back'));
    }
    expect(view.getByText('Can you uninstall this app?')).toBeTruthy();
    await userEvent.press(view.getByTestId('enrollment-next'));
    expect(view.getByText('What no customer app can do')).toBeTruthy();
    await userEvent.press(view.getByTestId('enrollment-next'));
    expect(view.getByText('This app is never hidden')).toBeTruthy();
  });

  it('cannot be submitted without an explicit consent and a typed name', async () => {
    const view = await renderScreen();

    await walkToTheAgreement(view);

    // The submit button exists but is disabled: nothing is enrolled silently.
    expect(view.getByRole('button', { name: 'Accept and continue' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(mockAcceptAgreement).not.toHaveBeenCalled();
  });

  it('records the agreement on the server before it attempts enrollment', async () => {
    const order: string[] = [];
    mockAcceptAgreement.mockImplementation(async () => {
      order.push('agreement');
      return { accepted: true };
    });
    mockRequestEnrollment.mockImplementation(async () => {
      order.push('enrollment');
      return { nativeOutcome: 'NOT_ENROLLED' as EnrollmentStatus, deviceState: null };
    });

    const view = await renderScreen();
    await acceptTheAgreement(view);

    await waitFor(() => expect(mockAcceptAgreement).toHaveBeenCalled());
    expect(order).toEqual(['agreement', 'enrollment']);
    expect(mockAcceptAgreement).toHaveBeenCalledWith(
      expect.objectContaining({
        agreementVersion: DEVICE_MANAGEMENT_AGREEMENT_VERSION,
        accepted: true,
        signatureName: 'Asif Hossain',
      }),
    );
  });

  it('never calls a phone with no device owner enrolled', async () => {
    mockRequestEnrollment.mockResolvedValue({
      nativeOutcome: 'NOT_ENROLLED' as EnrollmentStatus,
      deviceState: null,
    });

    const view = await renderScreen();
    await acceptTheAgreement(view);

    expect(await view.findByText('Enrollment result')).toBeTruthy();
    expect(view.getByText('Agreement recorded')).toBeTruthy();
    expect(
      view.getByText(/This phone is not under enterprise device management yet/),
    ).toBeTruthy();
    expect(view.queryByText(/Android reports this app as the device owner/)).toBeNull();
    // And the binding is not claimed either.
    expect(view.getByText(/Waiting for our server to confirm the binding/)).toBeTruthy();
  });

  it('reports a real enrollment once Android confirms it', async () => {
    mockRequestEnrollment.mockResolvedValue({
      nativeOutcome: 'ENROLLED' as EnrollmentStatus,
      deviceState: 'ACTIVE' as DeviceState,
    });

    const view = await renderScreen();
    await acceptTheAgreement(view);

    expect(
      await view.findByText(/Android reports this app as the device owner/),
    ).toBeTruthy();
    expect(view.getByText('Confirmed by our server.')).toBeTruthy();
  });

  it('updates the result when the phone is provisioned later', async () => {
    mockRequestEnrollment.mockResolvedValue({
      nativeOutcome: 'NOT_ENROLLED' as EnrollmentStatus,
      deviceState: null,
    });
    mockGetEnrollmentStatus.mockResolvedValue('ENROLLED' as EnrollmentStatus);

    const view = await renderScreen();
    await acceptTheAgreement(view);
    await view.findByText(/not under enterprise device management yet/);

    await userEvent.press(view.getByTestId('enrollment-check-again'));

    expect(
      await view.findByText(/Android reports this app as the device owner/),
    ).toBeTruthy();
  });

  it('does not touch the service when the customer only reads', async () => {
    const view = await renderScreen();
    await view.findByText('How this works when you buy the phone');

    expect(mockRequestEnrollment).not.toHaveBeenCalled();
  });
});
