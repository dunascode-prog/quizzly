// Adds what app.json can't hold statically: Android App Links for the invite/share domain
// (FR-INV-02, ARCHITECTURE "Links"). The domain comes from EXPO_PUBLIC_INVITE_DOMAIN, the same
// host the website (apps/web, WEB.md) serves /i/{code}, /c/{code} and assetlinks.json on.
const domain = process.env.EXPO_PUBLIC_INVITE_DOMAIN || 'quizzly.app';

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
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
