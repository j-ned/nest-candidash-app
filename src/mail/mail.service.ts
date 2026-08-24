import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

export interface ReminderEmailData {
  userEmail: string;
  userName: string;
  jobTitle: string;
  company: string;
  appliedAt?: Date;
  jobUrl?: string;
}

export interface RegistrationEmailData {
  userEmail: string;
  userName?: string;
  registrationDate: Date;
}

export interface PasswordResetEmailData {
  userEmail: string;
  userName?: string;
  resetToken: string;
  resetUrl: string;
}

export interface PasswordChangeEmailData {
  userEmail: string;
  userName?: string;
  changeDate: Date;
}

interface BaseEmailTemplateData {
  userName?: string;
  title: string;
  greeting: string;
  mainContent: string;
  ctaButton?: {
    text: string;
    url?: string;
  };
  additionalInfo?: string;
  footerMessage: string;
  type: 'success' | 'info' | 'warning' | 'primary';
  icon: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    const port = Number(this.configService.get('MAIL_PORT'));
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST'),
      port,
      secure: port === 465, // 465 = TLS implicite ; 587 = STARTTLS (secure false)
      requireTLS: port !== 465, // force STARTTLS sur 587, jamais en clair
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASSWORD'),
      },
      tls: {
        rejectUnauthorized: false,
        checkServerIdentity: () => undefined,
      },
    });
  }

  async sendRegistrationConfirmationEmail(
    data: RegistrationEmailData,
  ): Promise<boolean> {
    try {
      const htmlContent = this.generateRegistrationEmailTemplate(data);
      const textContent = this.generateRegistrationEmailText(data);

      const mailOptions = {
        from: `${this.configService.get<string>('MAIL_FROM_NAME')} <${this.configService.get<string>('MAIL_FROM_ADDRESS')}>`,
        to: data.userEmail,
        subject: 'Bienvenue ! Confirmation de votre inscription',
        text: textContent,
        html: htmlContent,
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `Email de confirmation d'inscription envoyé avec succès à ${data.userEmail}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Erreur lors de l'envoi de l'email de confirmation à ${data.userEmail}:`,
        error,
      );
      return false;
    }
  }

  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<boolean> {
    try {
      const htmlContent = this.generatePasswordResetEmailTemplate(data);
      const textContent = this.generatePasswordResetEmailText(data);

      const mailOptions = {
        from: `${this.configService.get<string>('MAIL_FROM_NAME')} <${this.configService.get<string>('MAIL_FROM_ADDRESS')}>`,
        to: data.userEmail,
        subject: 'Réinitialisation de votre mot de passe',
        text: textContent,
        html: htmlContent,
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `Email de réinitialisation de mot de passe envoyé avec succès à ${data.userEmail}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Erreur lors de l'envoi de l'email de réinitialisation à ${data.userEmail}:`,
        error,
      );
      return false;
    }
  }

  async sendPasswordChangeConfirmationEmail(
    data: PasswordChangeEmailData,
  ): Promise<boolean> {
    try {
      const htmlContent = this.generatePasswordChangeEmailTemplate(data);
      const textContent = this.generatePasswordChangeEmailText(data);

      const mailOptions = {
        from: `${this.configService.get<string>('MAIL_FROM_NAME')} <${this.configService.get<string>('MAIL_FROM_ADDRESS')}>`,
        to: data.userEmail,
        subject: 'Votre mot de passe a été modifié',
        text: textContent,
        html: htmlContent,
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `Email de confirmation de changement de mot de passe envoyé avec succès à ${data.userEmail}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Erreur lors de l'envoi de l'email de confirmation de changement de mot de passe à ${data.userEmail}:`,
        error,
      );
      return false;
    }
  }

  async sendReminderEmail(data: ReminderEmailData): Promise<boolean> {
    try {
      const htmlContent = this.generateReminderEmailTemplate(data);
      const textContent = this.generateReminderEmailText(data);

      const mailOptions = {
        from: `${this.configService.get<string>('MAIL_FROM_NAME')} <${this.configService.get<string>('MAIL_FROM_ADDRESS')}>`,
        to: data.userEmail,
        subject: `Rappel de candidature - ${data.jobTitle} chez ${data.company}`,
        text: textContent,
        html: htmlContent,
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `Email de rappel envoyé avec succès à ${data.userEmail} pour ${data.jobTitle}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Erreur lors de l'envoi de l'email de rappel à ${data.userEmail}:`,
        error,
      );
      return false;
    }
  }

  private generateBaseEmailTemplate(
    templateData: BaseEmailTemplateData,
  ): string {
    const themeConfig = this.getThemeConfig(templateData.type);

    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${templateData.title}</title>
        <style>
          /* Design System Variables - Basé sur le frontend */
          :root {
            /* Base Colors */
            --color-text: oklch(20.02% 0.013 177.93);
            --color-background: oklch(97.28% 0.004 179.74);
            --color-primary: oklch(68.00% 0.087 171.94);
            --color-primary-500: oklch(68.00% 0.087 171.94);
            --color-primary-600: oklch(62.00% 0.087 171.94);
            --color-primary-700: oklch(56.00% 0.087 171.94);

            /* Success Colors */
            --color-success: oklch(65.00% 0.125 142.00);
            --color-success-50: oklch(96.00% 0.025 142.00);
            --color-success-100: oklch(92.00% 0.040 142.00);
            --color-success-500: oklch(65.00% 0.125 142.00);
            --color-success-600: oklch(58.00% 0.125 142.00);
            --color-success-700: oklch(51.00% 0.125 142.00);

            /* Warning Colors */
            --color-warning: oklch(75.00% 0.120 75.00);
            --color-warning-50: oklch(98.00% 0.020 75.00);
            --color-warning-100: oklch(95.00% 0.035 75.00);
            --color-warning-500: oklch(75.00% 0.120 75.00);
            --color-warning-600: oklch(68.00% 0.120 75.00);
            --color-warning-700: oklch(61.00% 0.120 75.00);

            /* Info Colors */
            --color-info: oklch(70.00% 0.110 230.00);
            --color-info-50: oklch(96.00% 0.020 230.00);
            --color-info-100: oklch(92.00% 0.035 230.00);
            --color-info-500: oklch(70.00% 0.110 230.00);
            --color-info-600: oklch(63.00% 0.110 230.00);
            --color-info-700: oklch(56.00% 0.110 230.00);

            /* Gray Colors */
            --color-gray-50: oklch(98.00% 0.002 179.74);
            --color-gray-100: oklch(95.00% 0.003 179.74);
            --color-gray-200: oklch(90.00% 0.004 179.74);
            --color-gray-300: oklch(83.00% 0.005 179.74);
            --color-gray-400: oklch(68.00% 0.008 179.74);
            --color-gray-500: oklch(53.00% 0.010 179.74);
            --color-gray-600: oklch(43.00% 0.012 179.74);
            --color-gray-700: oklch(35.00% 0.012 179.74);
            --color-gray-800: oklch(28.00% 0.013 179.74);
            --color-gray-900: oklch(20.02% 0.013 177.93);
          }

          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            line-height: 1.6;
            background-color: #f9fafb;
            color: #111827;
          }

          .email-wrapper {
            width: 100%;
            background-color: #f9fafb;
            padding: 20px 0;
          }

          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            overflow: hidden;
          }

          .header {
            background: ${themeConfig.headerGradient};
            padding: 32px 24px;
            text-align: center;
          }

          .header h1 {
            color: #ffffff;
            margin: 0;
            font-size: 28px;
            font-weight: 700;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }

          .header p {
            color: rgba(255, 255, 255, 0.9);
            margin: 8px 0 0 0;
            font-size: 16px;
            font-weight: 500;
          }

          .content {
            padding: 32px 24px;
            background-color: #ffffff;
          }

          .content p {
            margin: 0 0 16px 0;
            color: #374151;
            font-size: 16px;
          }

          .main-content {
            background: ${themeConfig.contentBackground};
            ${themeConfig.contentBorder ? `border-left: 4px solid ${themeConfig.accentColor};` : ''}
            padding: 20px;
            margin: 24px 0;
            border-radius: 8px;
          }

          .cta-button {
            display: inline-block;
            padding: 16px 32px;
            background: ${themeConfig.buttonGradient};
            color: #ffffff;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 700;
            font-size: 16px;
            margin: 20px 0;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            transition: all 0.2s ease;
          }

          .cta-button:hover {
            box-shadow: 0 6px 8px -1px rgba(0, 0, 0, 0.15);
            transform: translateY(-1px);
          }

          .additional-info {
            background-color: #f9fafb;
            border-radius: 8px;
            padding: 16px;
            margin: 24px 0;
            color: #4b5563;
            font-size: 14px;
          }

          .footer {
            background-color: #f9fafb;
            padding: 24px;
            text-align: center;
            border-top: 1px solid #e5e7eb;
          }

          .footer p {
            margin: 0;
            color: #6b7280;
            font-size: 14px;
            line-height: 1.5;
          }

          .brand-signature {
            margin-top: 8px;
            color: ${themeConfig.accentColor};
            font-weight: 600;
          }

          /* Dark mode support */
          @media (prefers-color-scheme: dark) {
            :root {
              --color-text: oklch(94.55% 0.009 179.60);
              --color-background: oklch(14.93% 0.007 178.97);
              --color-gray-50: oklch(10.00% 0.002 178.97);
              --color-gray-100: oklch(12.00% 0.003 178.97);
              --color-gray-200: oklch(16.00% 0.004 178.97);
              --color-gray-500: oklch(50.00% 0.010 178.97);
              --color-gray-600: oklch(65.00% 0.012 178.97);
              --color-gray-700: oklch(75.00% 0.012 178.97);
            }
            .email-wrapper { background-color: oklch(14.93% 0.007 178.97); }
            .container { background-color: oklch(20.00% 0.007 178.97); }
            .content { background-color: oklch(20.00% 0.007 178.97); }
            .content p { color: oklch(85.00% 0.013 178.97); }
            .main-content { background-color: oklch(25.00% 0.008 178.97); }
            .additional-info { background-color: oklch(17.00% 0.007 178.97); }
            .footer { background-color: oklch(14.93% 0.007 178.97); border-top-color: oklch(25.00% 0.008 178.97); }
          }

          /* Mobile responsiveness */
          @media only screen and (max-width: 600px) {
            .email-wrapper { padding: 10px; }
            .header { padding: 24px 16px; }
            .header h1 { font-size: 24px; }
            .content { padding: 24px 16px; }
            .main-content, .additional-info { padding: 16px; }
            .cta-button { padding: 14px 24px; font-size: 15px; }
          }
        </style>
      </head>
      <body>
        <div class="email-wrapper">
          <div class="container">
            <div class="header">
              <h1>${templateData.icon} ${templateData.title}</h1>
            </div>
            <div class="content">
              <p>Bonjour <strong>${templateData.userName || 'cher utilisateur'}</strong>,</p>
              <p>${templateData.greeting}</p>

              <div class="main-content">
                ${templateData.mainContent}
              </div>

              ${
                templateData.ctaButton
                  ? `
                <div style="text-align: center; margin: 32px 0;">
                  ${
                    templateData.ctaButton.url
                      ? `<a href="${templateData.ctaButton.url}" class="cta-button">${templateData.ctaButton.text}</a>`
                      : `<p style="font-weight: 600; color: #374151; font-size: 18px;">${templateData.ctaButton.text}</p>`
                  }
                </div>
              `
                  : ''
              }

              ${
                templateData.additionalInfo
                  ? `
                <div class="additional-info">
                  ${templateData.additionalInfo}
                </div>
              `
                  : ''
              }
            </div>
            <div class="footer">
              <p>${templateData.footerMessage}</p>
              <p class="brand-signature">CandidashApp - Votre assistant candidature</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Retourne la configuration de thème selon le type d'email
   */
  private getThemeConfig(type: 'success' | 'info' | 'warning' | 'primary') {
    const configs = {
      success: {
        headerGradient:
          'linear-gradient(135deg, oklch(65.00% 0.125 142.00) 0%, oklch(58.00% 0.125 142.00) 100%)',
        buttonGradient:
          'linear-gradient(135deg, oklch(65.00% 0.125 142.00) 0%, oklch(58.00% 0.125 142.00) 100%)',
        contentBackground:
          'linear-gradient(135deg, oklch(96.00% 0.025 142.00) 0%, oklch(92.00% 0.040 142.00) 100%)',
        accentColor: 'oklch(58.00% 0.125 142.00)',
        contentBorder: true,
      },
      warning: {
        headerGradient:
          'linear-gradient(135deg, oklch(75.00% 0.120 75.00) 0%, oklch(68.00% 0.120 75.00) 100%)',
        buttonGradient:
          'linear-gradient(135deg, oklch(75.00% 0.120 75.00) 0%, oklch(68.00% 0.120 75.00) 100%)',
        contentBackground:
          'linear-gradient(135deg, oklch(98.00% 0.020 75.00) 0%, oklch(95.00% 0.035 75.00) 100%)',
        accentColor: 'oklch(68.00% 0.120 75.00)',
        contentBorder: true,
      },
      info: {
        headerGradient:
          'linear-gradient(135deg, oklch(70.00% 0.110 230.00) 0%, oklch(63.00% 0.110 230.00) 100%)',
        buttonGradient:
          'linear-gradient(135deg, oklch(70.00% 0.110 230.00) 0%, oklch(63.00% 0.110 230.00) 100%)',
        contentBackground:
          'linear-gradient(135deg, oklch(96.00% 0.020 230.00) 0%, oklch(92.00% 0.035 230.00) 100%)',
        accentColor: 'oklch(63.00% 0.110 230.00)',
        contentBorder: true,
      },
      primary: {
        headerGradient:
          'linear-gradient(135deg, oklch(68.00% 0.087 171.94) 0%, oklch(62.00% 0.087 171.94) 100%)',
        buttonGradient:
          'linear-gradient(135deg, oklch(68.00% 0.087 171.94) 0%, oklch(62.00% 0.087 171.94) 100%)',
        contentBackground: 'oklch(98.00% 0.002 179.74)',
        accentColor: 'oklch(62.00% 0.087 171.94)',
        contentBorder: false,
      },
    };
    return configs[type];
  }

  /**
   * Génère le template HTML pour l'email de rappel
   */
  private generateReminderEmailTemplate(data: ReminderEmailData): string {
    const appliedDateText = data.appliedAt
      ? `postulé le ${data.appliedAt.toLocaleDateString('fr-FR')}`
      : 'postulé récemment';

    // data.jobTitle/company/jobUrl proviennent d'une saisie utilisateur (y
    // compris via un jeton d'API bas-privilège, ex. l'extension navigateur)
    // et finissent interpolés tels quels dans le HTML de cet email envoyé
    // depuis l'identité SMTP de l'app : échappement obligatoire.
    const safeJobTitle = this.escapeHtml(data.jobTitle);
    const safeCompany = this.escapeHtml(data.company);
    const safeJobUrl = data.jobUrl ? this.escapeHtml(data.jobUrl) : undefined;

    const mainContent = `
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <div style="display: flex; margin-bottom: 12px; align-items: center;">
          <span style="font-weight: 600; color: #1f2937; min-width: 100px; margin-right: 12px;">Poste :</span>
          <span style="color: oklch(62.00% 0.087 171.94); font-weight: 600;">${safeJobTitle}</span>
        </div>
        <div style="display: flex; margin-bottom: 12px; align-items: center;">
          <span style="font-weight: 600; color: #1f2937; min-width: 100px; margin-right: 12px;">Entreprise :</span>
          <span style="color: oklch(62.00% 0.087 171.94); font-weight: 600;">${safeCompany}</span>
        </div>
        <div style="display: flex; margin-bottom: ${safeJobUrl ? '12px' : '0'}; align-items: center;">
          <span style="font-weight: 600; color: #1f2937; min-width: 100px; margin-right: 12px;">Status :</span>
          <span style="color: oklch(62.00% 0.087 171.94); font-weight: 600;">${appliedDateText}</span>
        </div>
        ${
          safeJobUrl
            ? `<div style="display: flex; margin-bottom: 0; align-items: center;">
          <span style="font-weight: 600; color: #1f2937; min-width: 100px; margin-right: 12px;">Annonce :</span>
          <a href="${safeJobUrl}" target="_blank" rel="noreferrer" style="color: oklch(62.00% 0.087 171.94); font-weight: 600; text-decoration: underline;">Voir l'offre d'emploi</a>
        </div>`
            : ''
        }
      </div>

      <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin: 24px 0 16px;">
        <h3 style="color: #1f2937; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">💡 Nos recommandations pour votre relance :</h3>
        <div style="list-style: none; padding: 0; margin: 0;">
          <div style="display: flex; align-items: flex-start; margin-bottom: 12px;">
            <span style="color: oklch(58.00% 0.125 142.00); margin-right: 8px; margin-top: 2px; font-weight: bold;">✓</span>
            <span style="color: #374151; line-height: 1.5;">Envoyer un email de suivi poli et personnalisé au recruteur</span>
          </div>
          <div style="display: flex; align-items: flex-start; margin-bottom: 12px;">
            <span style="color: oklch(58.00% 0.125 142.00); margin-right: 8px; margin-top: 2px; font-weight: bold;">✓</span>
            <span style="color: #374151; line-height: 1.5;">Vérifier le statut de votre candidature sur leur portail</span>
          </div>
          <div style="display: flex; align-items: flex-start; margin-bottom: 0;">
            <span style="color: oklch(58.00% 0.125 142.00); margin-right: 8px; margin-top: 2px; font-weight: bold;">✓</span>
            <span style="color: #374151; line-height: 1.5;">Mettre à jour votre dossier si vous avez de nouvelles compétences</span>
          </div>
        </div>
      </div>

      <p>Nous vous souhaitons plein de succès avec cette candidature !</p>
    `;

    return this.generateBaseEmailTemplate({
      userName: data.userName,
      title: 'Rappel de candidature',
      greeting:
        'Il est temps de relancer votre candidature ! Voici un résumé de votre postulation :',
      mainContent,
      ctaButton: safeJobUrl
        ? { text: "Voir l'annonce", url: safeJobUrl }
        : { text: "💪 Restez proactif dans votre recherche d'emploi !" },
      footerMessage:
        'Cet email a été envoyé automatiquement par votre système de suivi des candidatures.',
      type: 'primary',
      icon: '🔔',
      additionalInfo:
        'Une relance bien formulée peut faire la différence et montrer votre motivation.',
    });
  }

  /**
   * Génère le template HTML pour l'email de confirmation d'inscription
   */
  private generateRegistrationEmailTemplate(
    data: RegistrationEmailData,
  ): string {
    const registrationDateText =
      data.registrationDate.toLocaleDateString('fr-FR');

    const mainContent = `
      <div style="text-align: center; padding: 24px; margin: 24px 0; background: linear-gradient(135deg, oklch(96.00% 0.025 142.00) 0%, oklch(92.00% 0.040 142.00) 100%); border: 2px solid oklch(58.00% 0.125 142.00); border-radius: 12px;">
        <h2 style="color: oklch(47.00% 0.101 142.00); margin: 0 0 8px 0; font-size: 24px; font-weight: 700;">✨ Félicitations !</h2>
        <p style="color: oklch(51.00% 0.125 142.00); font-size: 16px; font-weight: 500; margin: 0;">Votre compte CandidashApp a été créé avec succès</p>
      </div>

      <p>Votre inscription a été confirmée le <span style="color: oklch(58.00% 0.125 142.00); font-weight: 600; font-size: 17px;">${registrationDateText}</span>. Vous faites maintenant partie de notre communauté de chercheurs d'emploi proactifs !</p>

      <h3 style="font-weight: 600; color: #1f2937; font-size: 18px; margin: 24px 0 16px 0;">🚀 Voici ce que vous pouvez faire dès maintenant :</h3>

      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin: 24px 0;">
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div style="font-size: 24px; margin-bottom: 8px;">📝</div>
          <div style="color: #1e293b; font-weight: 600; font-size: 16px; margin-bottom: 4px;">Gérer vos candidatures</div>
          <p style="color: #64748b; font-size: 14px; line-height: 1.4; margin: 0;">Créez et organisez toutes vos candidatures en un seul endroit</p>
        </div>
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div style="font-size: 24px; margin-bottom: 8px;">📊</div>
          <div style="color: #1e293b; font-weight: 600; font-size: 16px; margin-bottom: 4px;">Suivre votre progression</div>
          <p style="color: #64748b; font-size: 14px; line-height: 1.4; margin: 0;">Surveillez l'évolution de chaque postulation en temps réel</p>
        </div>
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div style="font-size: 24px; margin-bottom: 8px;">⏰</div>
          <div style="color: #1e293b; font-weight: 600; font-size: 16px; margin-bottom: 4px;">Rappels automatiques</div>
          <p style="color: #64748b; font-size: 14px; line-height: 1.4; margin: 0;">Ne ratez plus jamais un follow-up grâce à nos notifications</p>
        </div>
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div style="font-size: 24px; margin-bottom: 8px;">📈</div>
          <div style="color: #1e293b; font-weight: 600; font-size: 16px; margin-bottom: 4px;">Analytics détaillés</div>
          <p style="color: #64748b; font-size: 14px; line-height: 1.4; margin: 0;">Analysez vos performances et optimisez votre approche</p>
        </div>
      </div>

      <p>Nous sommes ravis de vous accompagner dans votre recherche d'emploi et vous souhaitons beaucoup de succès dans vos démarches !</p>

      <p style="margin-top: 32px; margin-bottom: 0;"><strong>L'équipe CandidashApp</strong><br>
      <em>Votre partenaire pour une recherche d'emploi organisée et efficace</em></p>
    `;

    return this.generateBaseEmailTemplate({
      userName: data.userName,
      title: 'Bienvenue sur CandidashApp !',
      greeting:
        "Félicitations ! Votre parcours vers l'emploi idéal commence ici.",
      mainContent,
      ctaButton: {
        text: '🎯 Connectez-vous à votre tableau de bord et créez votre première candidature !',
      },
      footerMessage:
        'Cet email a été envoyé automatiquement suite à votre inscription.',
      type: 'success',
      icon: '🎉',
    });
  }

  /**
   * Génère le template HTML pour l'email de réinitialisation de mot de passe
   */
  private generatePasswordResetEmailTemplate(
    data: PasswordResetEmailData,
  ): string {
    const mainContent = `
      <div style="padding: 20px; margin: 24px 0; background: linear-gradient(135deg, oklch(98.00% 0.020 75.00) 0%, oklch(95.00% 0.035 75.00) 100%); border: 2px solid oklch(68.00% 0.120 75.00); border-radius: 12px;">
        <div style="display: flex; align-items: center; margin-bottom: 12px;">
          <span style="font-size: 24px; margin-right: 8px;">⚠️</span>
          <h3 style="color: oklch(61.00% 0.120 75.00); font-weight: 700; font-size: 16px; margin: 0;">Important - Sécurité</h3>
        </div>
        <p style="color: oklch(61.00% 0.120 75.00); font-weight: 500; margin: 0; font-size: 15px;">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email. Votre mot de passe actuel reste parfaitement sécurisé et inchangé.</p>
      </div>

      <p>⏰ Ce lien de réinitialisation expirera dans <span style="color: oklch(62.00% 0.155 25.00); font-weight: 700;">1 heure</span> pour des raisons de sécurité.</p>

      <div style="background-color: #f3f4f6; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0 0 8px 0; color: #4b5563; font-size: 14px; font-weight: 500;"><strong>Le bouton ne fonctionne pas ?</strong></p>
        <p style="margin: 0 0 8px 0; color: #4b5563; font-size: 14px;">Copiez et collez ce lien dans votre navigateur :</p>
        <div style="word-break: break-all; color: #6b7280; font-size: 13px; font-family: monospace; background-color: #ffffff; padding: 8px; border-radius: 4px; border: 1px solid #e5e7eb;">${data.resetUrl}</div>
      </div>

      <p>Si vous rencontrez des difficultés, n'hésitez pas à nous contacter.</p>

      <p style="margin-top: 32px; margin-bottom: 0;"><strong>L'équipe CandidashApp</strong><br>
      <em>Votre sécurité est notre priorité</em></p>
    `;

    return this.generateBaseEmailTemplate({
      userName: data.userName,
      title: 'Réinitialisation de mot de passe',
      greeting:
        'Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte CandidashApp.',
      mainContent,
      ctaButton: {
        text: 'Réinitialiser mon mot de passe',
        url: data.resetUrl,
      },
      footerMessage:
        'Cet email a été envoyé automatiquement suite à une demande de réinitialisation de mot de passe.',
      type: 'warning',
      icon: '🔐',
    });
  }

  /**
   * Génère le template HTML pour l'email de confirmation de changement de mot de passe
   */
  private generatePasswordChangeEmailTemplate(
    data: PasswordChangeEmailData,
  ): string {
    const changeDateText = data.changeDate.toLocaleString('fr-FR');

    const mainContent = `
      <p>Nous vous confirmons que le mot de passe de votre compte a été modifié le <strong>${changeDateText}</strong>.</p>

      <p>Si vous êtes à l'origine de ce changement, aucune action supplémentaire n'est nécessaire.</p>
      <p>Si vous n'êtes pas à l'origine de cette modification, veuillez réinitialiser votre mot de passe immédiatement et contacter le support.</p>

      <p style="margin-bottom: 0;">Ceci est un message automatique pour la sécurité de votre compte.</p>
    `;

    return this.generateBaseEmailTemplate({
      userName: data.userName,
      title: 'Mot de passe modifié',
      greeting: 'Confirmation de changement de votre mot de passe.',
      mainContent,
      footerMessage: 'CandidashApp - Votre sécurité est notre priorité',
      type: 'info',
      icon: '🔒',
    });
  }

  /**
   * Génère le contenu texte pour l'email de réinitialisation de mot de passe
   */
  private generatePasswordResetEmailText(data: PasswordResetEmailData): string {
    return `
Réinitialisation de votre mot de passe

Bonjour ${data.userName || 'cher utilisateur'},

Vous avez demandé la réinitialisation de votre mot de passe pour votre compte sur notre plateforme de suivi des candidatures.

⚠️ IMPORTANT : Si vous n'avez pas demandé cette réinitialisation, ignorez cet email. Votre mot de passe actuel reste inchangé.

Pour réinitialiser votre mot de passe, cliquez sur le lien suivant :
${data.resetUrl}

Ce lien expirera dans 1 heure pour des raisons de sécurité.

Cordialement,
L'équipe de support

---
Cet email a été envoyé automatiquement suite à une demande de réinitialisation de mot de passe.
    `;
  }

  /**
   * Génère le contenu texte pour l'email de confirmation d'inscription
   */
  private generateRegistrationEmailText(data: RegistrationEmailData): string {
    const registrationDateText =
      data.registrationDate.toLocaleDateString('fr-FR');

    return `
Bienvenue ! Confirmation d'inscription

Bonjour ${data.userName || 'cher utilisateur'},

Félicitations ! Votre compte a été créé avec succès.

Votre inscription sur notre plateforme de suivi des candidatures a été confirmée le ${registrationDateText}.

Vous pouvez maintenant :
- Créer et gérer vos candidatures
- Suivre l'évolution de vos postulations
- Recevoir des rappels automatiques
- Organiser vos recherches d'emploi

Nous vous souhaitons beaucoup de succès dans vos recherches !

L'équipe de support

---
Cet email a été envoyé automatiquement suite à votre inscription.
    `;
  }

  /**
   * Génère le contenu texte pour l'email de rappel
   */
  private generateReminderEmailText(data: ReminderEmailData): string {
    const appliedDateText = data.appliedAt
      ? `postulé le ${data.appliedAt.toLocaleDateString('fr-FR')}`
      : 'postulé récemment';

    return `
Rappel de candidature

Bonjour ${data.userName || 'cher utilisateur'},

Il est temps de relancer votre candidature pour le poste :

- Poste : ${data.jobTitle}
- Entreprise : ${data.company}
- Status : ${appliedDateText}${data.jobUrl ? `\n- Annonce : ${data.jobUrl}` : ''}

Nous vous recommandons de :
- Envoyer un email de suivi poli au recruteur
- Vérifier le statut de votre candidature sur leur portail
- Mettre à jour votre dossier de candidature si nécessaire

N'hésitez pas à personnaliser votre message de relance pour montrer votre intérêt continu pour le poste.

Bonne chance avec votre candidature !

---
Cet email a été envoyé automatiquement par votre système de suivi des candidatures.
    `;
  }

  /**
   * Génère le contenu texte pour l'email de confirmation de changement de mot de passe
   */
  private generatePasswordChangeEmailText(
    data: PasswordChangeEmailData,
  ): string {
    const changeDateText = data.changeDate.toLocaleString('fr-FR');
    return `
Confirmation de changement de mot de passe

Bonjour ${data.userName || 'cher utilisateur'},

Nous vous confirmons que le mot de passe de votre compte a été modifié le ${changeDateText}.

Si vous êtes à l'origine de ce changement, aucune action supplémentaire n'est nécessaire.

Si vous n'êtes pas à l'origine de cette modification, veuillez réinitialiser votre mot de passe immédiatement et contacter le support.

CandidashApp - Votre sécurité est notre priorité
    `;
  }

  /**
   * Échappe les caractères HTML spéciaux pour neutraliser toute injection
   * dans un template email généré à partir de données utilisateur (y
   * compris texte et contexte d'attribut, ex. href="...").
   */
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
