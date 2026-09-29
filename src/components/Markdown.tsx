import ReactMarkdown from "react-markdown";

/**
 * Affiche une note en markdown simple (gras, italique, listes, liens, titres, code).
 * react-markdown n'interprète pas le HTML brut et neutralise les liens "javascript:" :
 * une note ne peut donc pas injecter de script (XSS).
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown text-sm">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
          img: ({ alt }) => <span>[image : {alt}]</span>, // pas de chargement d'images externes
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
