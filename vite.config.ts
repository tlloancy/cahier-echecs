import { defineConfig, type Plugin } from 'vite'

/**
 * Politique de sécurité du contenu, ajoutée à la page construite (pas au serveur de dev).
 * La page ne parle qu'à elle-même et à api.chess.com, ne charge d'images que de flagcdn.com,
 * et n'exécute aucun script en ligne. Le moteur tourne dans un worker du même site.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src-elem 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: https://flagcdn.com",
  "connect-src 'self' https://api.chess.com",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'cahier-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
    },
  }
}

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/cahier-echecs/' : '/',
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  plugins: [contentSecurityPolicy()],
}))
