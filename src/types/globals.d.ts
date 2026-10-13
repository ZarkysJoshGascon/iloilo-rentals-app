// Browser globals added by third-party scripts loaded at runtime.

// Google Identity Services (https://accounts.google.com/gsi/client), used for
// the Sign in with Google button. Only the calls the login page makes.
interface GoogleAccountsId {
  initialize(config: {
    client_id: string
    callback: (response: { credential: string }) => void
    [option: string]: unknown
  }): void
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void
  cancel?(): void
}

interface GoogleIdentity {
  accounts: { id: GoogleAccountsId }
}

// Cloudflare Turnstile (https://challenges.cloudflare.com/turnstile/v0/api.js),
// the bot check on the Interior Design inquiry form.
interface Turnstile {
  render(container: HTMLElement | string, options: Record<string, unknown>): string
  reset(widgetId?: string): void
  remove?(widgetId: string): void
}

interface Window {
  google?: GoogleIdentity
  turnstile?: Turnstile
}
