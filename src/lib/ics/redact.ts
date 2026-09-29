/**
 * Masque tout ce qui ressemble à un secret dans un texte avant de l'écrire dans un log
 * ou de le renvoyer au navigateur : paramètres ?token=..., et URL complètes.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => url.replace(/\?.*$/, "?[masqué]"))
    .replace(/(token|key|secret|password)=([^&\s"']+)/gi, "$1=[masqué]");
}
