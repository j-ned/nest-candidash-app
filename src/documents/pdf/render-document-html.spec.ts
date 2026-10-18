import { renderDocumentHtml } from './render-document-html';

describe('renderDocumentHtml', () => {
  it('renders the Markdown on an A4 page with the « sobre » layout', () => {
    const html = renderDocumentHtml(
      'CV Camille',
      '# Camille Martin\n\n## Expérience\n\n- Angular\n- NestJS',
    );

    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<title>CV Camille</title>');
    expect(html).toContain('size: A4');
    expect(html).toContain('<h1 class="doc-h1">Camille Martin</h1>');
    expect(html).toContain('<h2 class="doc-h2">Expérience</h2>');
    expect(html).toContain('<li>Angular</li>');
  });

  it('keeps single line breaks (address, contact details)', () => {
    const html = renderDocumentHtml('Lettre', '12 rue des Lilas\n44000 Nantes');

    expect(html).toContain('12 rue des Lilas<br');
  });

  it('escapes the title', () => {
    const html = renderDocumentHtml('<script>alert(1)</script>', 'x');

    expect(html).toContain(
      '<title>&lt;script&gt;alert(1)&lt;/script&gt;</title>',
    );
  });

  it.each([
    ['a script', '<script>alert(1)</script>', '<script'],
    ['an event handler', '<img src="x" onerror="alert(1)">', 'onerror'],
    ['an inline style', '<p style="color:red">texte</p>', 'style='],
    ['an iframe', '<iframe src="https://evil.test"></iframe>', '<iframe'],
    ['a remote image', '![photo](https://evil.test/track.png)', 'evil.test'],
    ['a javascript link', '[clic](javascript:alert(1))', 'javascript:'],
    ['a form control', '<input value="x">', '<input'],
  ])('drops %s', (_case, markdown, forbidden) => {
    const body = renderDocumentHtml('Doc', markdown).split('<body>')[1];

    expect(body).not.toContain(forbidden);
  });

  it('keeps safe links', () => {
    const html = renderDocumentHtml('Doc', '[Portfolio](https://exemple.fr)');

    expect(html).toContain('<a href="https://exemple.fr">Portfolio</a>');
  });
});
