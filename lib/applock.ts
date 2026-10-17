// Bloqueo de la app con la biometría del dispositivo (Face ID / Touch ID) vía WebAuthn.
// Es un bloqueo de pantalla: impide abrir la app sin tu cara o código del teléfono,
// pero no cifra los datos guardados en el navegador.

const KEY = 'lovely-fit-lock'
export const LOCK_AFTER_MS = 5 * 60_000

interface LockConfig {
  credentialId: string
}

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))

export function getLock(): LockConfig | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as LockConfig) : null
  } catch {
    return null
  }
}

export async function lockSupported(): Promise<boolean> {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}

/** Registra una llave en el dispositivo (pide Face ID). */
export async function enableLock(): Promise<void> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: random(32),
      rp: { name: 'Lovely Fit', id: location.hostname },
      user: { id: random(16), name: 'lovely-fit', displayName: 'Lovely Fit' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('No se pudo activar el bloqueo.')
  localStorage.setItem(KEY, JSON.stringify({ credentialId: b64(cred.rawId) }))
}

export function disableLock() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* sin storage: no hay bloqueo */
  }
}

/** Pide Face ID. Debe llamarse desde un toque del usuario (iOS lo exige). */
export async function unlock(): Promise<boolean> {
  const cfg = getLock()
  if (!cfg) return true
  try {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        allowCredentials: [{ type: 'public-key', id: unb64(cfg.credentialId) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return !!res
  } catch {
    return false
  }
}
