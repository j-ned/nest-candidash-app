import { Marked, type Tokens } from 'marked';
import sanitizeHtml from 'sanitize-html';

// Même moteur et mêmes options que l'aperçu du front (parse-markdown.ts) : le PDF reprend
// l'aperçu. Un retour à la ligne simple reste un retour à la ligne (adresse, signature).
const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    heading({ tokens, depth }: Tokens.Heading): string {
      return `<h${depth} class="doc-h${depth}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
  },
});

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

// Liste blanche : ce qu'un CV ou une lettre peut contenir, rien d'autre. Ni image (une image
// distante trahirait l'ouverture du document), ni style, ni script, ni contrôle de formulaire.
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...HEADINGS,
    'p',
    'br',
    'ul',
    'ol',
    'li',
    'strong',
    'em',
    'del',
    's',
    'code',
    'pre',
    'blockquote',
    'hr',
    'a',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  allowedAttributes: {
    a: ['href'],
    ...Object.fromEntries(HEADINGS.map((tag) => [tag, ['class']])),
    th: ['align'],
    td: ['align'],
  },
  allowedClasses: Object.fromEntries(
    HEADINGS.map((tag, index) => [tag, [`doc-h${index + 1}`]]),
  ),
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
};

// Gabarit « sobre », calqué sur la feuille de l'aperçu (document-sheet.ts) : A4, marges de 8 % de
// la largeur sur les côtés et 7 % en haut et en bas, corps de 13 px. Polices installées dans le
// conteneur Gotenberg : aucune ressource externe.
const STYLES = `
@page { size: A4; margin: 14.7mm 16.8mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: #171717; font-family: 'Liberation Sans', Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.625; overflow-wrap: break-word; }
.doc-h1 { margin: 0 0 4px; font-size: 24px; line-height: 32px; font-weight: 700; letter-spacing: -0.025em; }
.doc-h2 { margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #d4d4d4; font-size: 12px; line-height: 16px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #404040; break-after: avoid; }
.doc-h3 { margin: 12px 0 0; font-size: 13px; font-weight: 600; break-after: avoid; }
.doc-h4, .doc-h5, .doc-h6 { margin: 8px 0 0; font-size: 13px; font-weight: 500; break-after: avoid; }
p, ul, ol { margin: 6px 0; }
ul { list-style: disc; padding-left: 20px; }
ol { list-style: decimal; padding-left: 20px; }
li { margin: 2px 0; }
a { color: inherit; text-decoration: underline; }
hr { margin: 16px 0; border: 0; border-top: 1px solid #d4d4d4; }
blockquote { margin: 6px 0; padding-left: 12px; border-left: 2px solid #d4d4d4; font-style: italic; }
code, pre { font-family: 'Liberation Mono', monospace; font-size: 0.9em; }
pre { white-space: pre-wrap; }
table { margin: 8px 0; border-collapse: collapse; }
th, td { padding: 0 12px 0 0; text-align: left; vertical-align: top; }
li, tr { break-inside: avoid; }
`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Markdown → page HTML **assainie** et autonome, prête pour Chromium (Gotenberg). */
export function renderDocumentHtml(title: string, markdown: string): string {
  const body = sanitizeHtml(
    marked.parse(markdown, { async: false }),
    SANITIZE_OPTIONS,
  );
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>${body}</body>
</html>`;
}
