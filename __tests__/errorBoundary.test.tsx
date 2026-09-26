import { fireEvent, render } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '@/components/AppErrorBoundary';

/**
 * What a customer sees when the app cannot draw itself.
 *
 * The reported symptom was "the app does not open": splash, then gone. In a
 * release build that is what an uncaught render error looks like, because there is
 * no red box and the console goes nowhere a person can read it. These tests exist
 * so the next one of those is legible on the phone instead of invisible.
 */

function Boom({ message = 'kaboom' }: { message?: string }): never {
  throw new Error(message);
}

function wrap(node: React.ReactNode) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 24, left: 0, right: 0, bottom: 24 },
      }}
    >
      <PaperProvider>{node}</PaperProvider>
    </SafeAreaProvider>
  );
}

let consoleError: jest.SpyInstance;
let consoleWarn: jest.SpyInstance;

beforeEach(() => {
  // React logs the caught error itself; the point of these tests is the screen,
  // not the noise.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AppErrorBoundary', () => {
  it('renders its children when nothing is wrong', async () => {
    const view = await render(wrap(<AppErrorBoundary>{<Text>Customer</Text>}</AppErrorBoundary>));
    expect(await view.findByText('Customer')).toBeTruthy();
    expect(view.queryByText('The app could not start')).toBeNull();
  });

  it('shows the error on the device instead of a blank screen', async () => {
    const view = await render(
      wrap(
        <AppErrorBoundary>
          <Boom />
        </AppErrorBoundary>,
      ),
    );

    expect(await view.findByText('The app could not start')).toBeTruthy();
  });

  it('puts the message and the component stack on screen, so it can be copied', async () => {
    const view = await render(
      wrap(
        <AppErrorBoundary>
          <Boom message="Something specific went wrong" />
        </AppErrorBoundary>,
      ),
    );

    // The details are one selectable block - message, then stack - so this is a
    // substring match. The stack is the diagnosis; without it this screen is just
    // an apology.
    const details = await view.findByText(/Something specific went wrong/);
    expect(String(details.props.children)).toMatch(/Something specific went wrong/);
  });

  it('does not pretend the failure did not happen', async () => {
    const view = await render(
      wrap(
        <AppErrorBoundary>
          <Boom />
        </AppErrorBoundary>,
      ),
    );

    expect(await view.findByText('The app could not start')).toBeTruthy();
    // A screen that quietly showed the login form instead would leave a customer
    // signing in repeatedly against an app that is broken.
    expect(view.queryByText('Customer')).toBeNull();
  });

  it('records the error where a developer will find it', async () => {
    await render(
      wrap(
        <AppErrorBoundary>
          <Boom message="recorded please" />
        </AppErrorBoundary>,
      ),
    );

    await Promise.resolve();
    expect(consoleError).toHaveBeenCalled();
    const logged = consoleError.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain('the app failed to render');
  });

  it('offers a restart, and a restart that still fails does not loop forever', async () => {
    const view = await render(
      wrap(
        <AppErrorBoundary>
          <Boom message="still broken" />
        </AppErrorBoundary>,
      ),
    );

    expect(await view.findByText('Restart')).toBeTruthy();
    // Re-throwing on restart is expected here: the fault is in the child, and the
    // boundary is honest about it rather than papering over it.
    fireEvent.press(view.getByText('Restart'));
    expect(await view.findByText(/still broken/)).toBeTruthy();
  });

  it('renders the children again once the fault is gone', async () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('transient');
      return <Text>Recovered</Text>;
    }

    const view = await render(
      wrap(
        <AppErrorBoundary>
          <Flaky />
        </AppErrorBoundary>,
      ),
    );

    expect(await view.findByText('The app could not start')).toBeTruthy();

    shouldThrow = false;
    fireEvent.press(view.getByText('Restart'));

    // This is the whole reason Restart is the only action offered: the boundary
    // holds a dead tree, and rebuilding it is the only honest recovery.
    expect(await view.findByText('Recovered')).toBeTruthy();
  });

  it('takes a custom heading when a caller knows more', async () => {
    const view = await render(
      wrap(
        <AppErrorBoundary heading="The Home screen could not load">
          <Boom />
        </AppErrorBoundary>,
      ),
    );

    expect(await view.findByText('The Home screen could not load')).toBeTruthy();
  });

  it('catches a failure in a child that is not a component, such as a bad prop shape', async () => {
    function BadConsumer({ items }: { items: string[] }) {
      // No boundary would survive this one either, but it is the everyday shape:
      // a null arriving where a list was expected.
      return <Text>{items.map((i) => i).join()}</Text>;
    }

    const view = await render(
      wrap(
        <AppErrorBoundary>
          <BadConsumer items={null as unknown as string[]} />
        </AppErrorBoundary>,
      ),
    );

    expect(await view.findByText('The app could not start')).toBeTruthy();
  });
});

describe('the boundary is not a place to hide a working screen', () => {
  it('shows nothing extra around healthy content', async () => {
    const view = await render(
      wrap(
        <AppErrorBoundary>
          <View>
            <Text>only this</Text>
          </View>
        </AppErrorBoundary>,
      ),
    );

    expect(await view.findByText('only this')).toBeTruthy();
    expect(view.queryByText('Details')).toBeNull();
    expect(view.queryByText('Restart')).toBeNull();
  });
});
