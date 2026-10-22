// Hermes has no WebCrypto. Without it Supabase's PKCE (Google sign-in) makes its code verifier
// with Math.random and sends it unhashed ("plain"), so supply the two calls it uses.
import * as Crypto from 'expo-crypto';

type WebCryptoSubset = {
  getRandomValues?: typeof Crypto.getRandomValues;
  subtle?: { digest: (algorithm: string, data: BufferSource) => Promise<ArrayBuffer> };
};

const g = globalThis as { crypto?: WebCryptoSubset };
g.crypto ??= {};
g.crypto.getRandomValues ??= Crypto.getRandomValues;
g.crypto.subtle ??= {
  digest: (algorithm, data) => Crypto.digest(algorithm as Crypto.CryptoDigestAlgorithm, data),
};
