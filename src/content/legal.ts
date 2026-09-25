/**
 * Legal copy shown in-app.
 *
 * The device-management agreement text is the version the customer accepts at
 * enrollment. The server records the version string and timestamp, so a change
 * here means bumping `DEVICE_MANAGEMENT_AGREEMENT_VERSION` and re-accepting.
 */
export interface LegalSection {
  heading: string;
  body: string[];
}

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: '1. What this app is for',
    body: [
      'This app is the customer application for mobile devices sold by Srabon Telecom on an installment ( EMI ) plan. It lets you see your device, your installment schedule, your payments, and to pay an installment.',
      'The app is provided by Srabon Telecom. Using the app does not change the terms of your purchase agreement, which is held on our servers.',
    ],
  },
  {
    heading: '2. Your account',
    body: [
      'You are responsible for keeping your mobile number and login credentials secure. Tell us immediately if you believe someone else has used your account.',
      'One account is linked to one customer record. The device, contract, installments, payments and support tickets shown in the app belong to your account only.',
    ],
  },
  {
    heading: '3. Payments',
    body: [
      'You can pay an installment through a supported payment gateway. A payment is only treated as paid when our server has received and verified the gateway transaction.',
      'The amount shown before payment is for information. The final payable amount is the one confirmed by our server when the payment order is created.',
      'If a payment is not confirmed, the app shows a pending status. No installment is marked paid on the basis of a message, a screenshot, or anything shown only inside the app.',
    ],
  },
  {
    heading: '4. Late payment',
    body: [
      'If an installment is not paid by its due date, reminders are sent and the contract status changes on our server. The app will show the outstanding amount and the due date.',
      'Where the device supports official Android Enterprise management, Srabon Telecom may use those officially supported capabilities to protect a device whose plan is overdue. Nothing else on the device is affected, and emergency functions are never disabled.',
    ],
  },
  {
    heading: '5. Device management consent',
    body: [
      'Device management is optional and applies only if you accept the separate Device Management Agreement. That agreement explains exactly what is collected and what management can do.',
      'You can review the agreement at any time in Settings, and you can ask our support team to stop device management for your device.',
    ],
  },
  {
    heading: '6. Your data',
    body: [
      'The app collects only what is needed to authenticate you, manage your device, manage your installments, take payment, send notifications and answer support requests. See the Privacy Policy for the full list.',
    ],
  },
  {
    heading: '7. Changes and termination',
    body: [
      'We may update these terms. The version in force at the time you accept is recorded. If you do not accept the updated terms, you can ask to close your account and return the device as per your purchase agreement.',
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: 'What we collect',
    body: [
      'Account details: your name, mobile number, and an email address if you provide one.',
      'Device details: device model, manufacturer, Android version, and a device identifier used to match this phone to your contract. Hardware identifiers such as the IMEI are not displayed in the app.',
      'Financial details: installment schedule, payment transactions and outstanding balance.',
      'Support details: the tickets you create and our replies to them.',
    ],
  },
  {
    heading: 'What we never collect',
    body: [
      'Location, contacts, SMS, call history, microphone, camera, personal files, browsing history and installed apps are not collected. The app does not request these Android permissions, and it blocks them in its manifest.',
      'The app does not use an Accessibility Service, a Notification Listener, Device Administrator abuse, root, or any hidden Android API to observe or control your phone.',
    ],
  },
  {
    heading: 'How your data is used',
    body: [
      'Your data is used to authenticate you, manage your device and installment plan, process payments, send you reminders about your plan, and answer your support requests.',
      'It is not sold, and it is not shared with third parties for advertising.',
    ],
  },
  {
    heading: 'How your data is stored',
    body: [
      'Your session tokens are stored in Android secure storage, protected by the device keystore. They are never written to ordinary app storage.',
      'No payment gateway secret, admin credential or service-role database key is ever present in this app. Those live only on our servers.',
    ],
  },
  {
    heading: 'Your rights',
    body: [
      'You can view your installment history and payment receipts in the app at any time.',
      'You can request a copy of your data, correct your profile, or ask us to delete your data once your purchase agreement has ended, by contacting support.',
    ],
  },
];

export const MANAGEMENT_AGREEMENT_SECTIONS: LegalSection[] = [
  {
    heading: '1. Purpose',
    body: [
      'This Device Management Agreement explains how Srabon Telecom may protect a device that is being paid for on an installment plan, and what that means for you while the plan is active and after it ends.',
    ],
  },
  {
    heading: '2. What we collect',
    body: [
      'Device model, manufacturer, Android version, and a device identifier so our servers can match this phone to your contract. A record of which version of this agreement you accepted, and when.',
      'We do not collect your location, contacts, SMS, call history, files, camera or microphone.',
    ],
  },
  {
    heading: '3. What device management can do',
    body: [
      'Where the device and Android officially support it, management allows Srabon Telecom to apply a screen lock to a device whose installment plan is overdue, and to release that lock after a payment is verified.',
      'On a phone bought normally from a shop, these controls are not available to any app. In that case the app reports that management is not supported on your device, and no lock, reset, or wipe is performed.',
    ],
  },
  {
    heading: '4. What it will never do',
    body: [
      'It will not read your personal data, delete your files, disable emergency functions, or block emergency calls. It will not install other applications or change system security settings. It will not operate through an Accessibility Service, root access, or any hidden or unofficial Android API.',
    ],
  },
  {
    heading: '5. If an installment becomes overdue',
    body: [
      'You receive reminders first. If the payment remains overdue, our server marks the contract as restricted and the app shows the outstanding amount, the due date and the options to pay or contact support.',
      'Any device action can only be taken by our server after it has verified your payment history. The app itself cannot restrict or unlock anything.',
    ],
  },
  {
    heading: '6. After a verified payment',
    body: [
      'As soon as our server verifies a payment that clears the overdue amount, it lifts the restriction and, where the device supports it, releases the device lock. The app then shows that access has been restored.',
    ],
  },
  {
    heading: '7. Your choices',
    body: [
      'Accepting this agreement is voluntary. You can ask support to stop device management at any time, and we will explain the effect on your plan before making any change.',
    ],
  },
  {
    heading: '8. Acceptance',
    body: [
      'By typing your full name and tapping accept, you confirm that you have read this agreement, that you agree to it, and that Srabon Telecom may record your name, the agreement version, and the time of acceptance against your contract.',
    ],
  },
];
