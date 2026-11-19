// Adds what app.json can't hold statically: Android App Links for the invite/share domain
// (FR-INV-02, ARCHITECTURE "Links"). The domain comes from EXPO_PUBLIC_INVITE_DOMAIN, the same
// host the website (apps/web, WEB.md) serves /i/{code}, /c/{code} and assetlinks.json on.
const domain = process.env.EXPO_PUBLIC_INVITE_DOMAIN || 'quizzly.app';

// Each build has its own Android ID and name so they install side by side (eas.json sets
// APP_VARIANT): the dev client, the staging app and the real app. Production keeps app.quizzly,
// the Play Store ID, which must never change.
const VARIANTS = {
  development: { suffix: '.dev', name: 'Quizzly Dev' },
  preview: { suffix: '.staging', name: 'Quizzly Staging' },
};
const variant = VARIANTS[process.env.APP_VARIANT];

module.exports = ({ config }) => ({
  ...config,
  name: variant ? variant.name : config.name,
  android: {
    ...config.android,
    package: config.android.package + (variant ? variant.suffix : ''),
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: domain, pathPrefix: '/i/' },
          { scheme: 'https', host: domain, pathPrefix: '/c/' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  extra: { ...config.extra, inviteDomain: domain },
});
