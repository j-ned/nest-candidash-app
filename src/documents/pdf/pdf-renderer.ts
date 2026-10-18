import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const RENDER_TIMEOUT_MS = 20_000;

/**
 * Client de Gotenberg (Chromium headless), joignable uniquement sur le réseau interne
 * (`GOTENBERG_URL`). Sans configuration, l'export est indisponible mais le reste de l'API tourne.
 */
@Injectable()
export class PdfRenderer {
  private readonly logger = new Logger(PdfRenderer.name);

  constructor(private readonly config: ConfigService) {}

  async render(html: string): Promise<Buffer> {
    const baseUrl = this.config.get<string>('GOTENBERG_URL');
    if (!baseUrl) {
      throw new ServiceUnavailableException(
        'L’export PDF est momentanément indisponible',
      );
    }

    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    // Format et marges viennent de la règle @page du gabarit
    form.append('preferCssPageSize', 'true');
    form.append('printBackground', 'true');
    for (const side of [
      'marginTop',
      'marginBottom',
      'marginLeft',
      'marginRight',
    ]) {
      form.append(side, '0');
    }

    try {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, '')}/forms/chromium/convert/html`,
        {
          method: 'POST',
          headers: this.authorization(),
          body: form,
          signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        throw new Error(`Gotenberg a répondu ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      this.logger.error('Échec de la génération du PDF', error as Error);
      throw new BadGatewayException('La génération du PDF a échoué');
    }
  }

  // Gotenberg lancé avec --api-enable-basic-auth : le réseau Docker est partagé par toutes les
  // applications du serveur, l'authentification en limite l'accès à l'API.
  private authorization(): Record<string, string> {
    const username = this.config.get<string>('GOTENBERG_USERNAME');
    const password = this.config.get<string>('GOTENBERG_PASSWORD');
    if (!username || !password) return {};
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    return { Authorization: `Basic ${token}` };
  }
}
