import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.createTransporter();
  }

  private createTransporter() {
    const port = parseInt(process.env.MAIL_PORT || '465');
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port,
      secure: port === 465, // 465 = TLS implicite ; 587 = STARTTLS (secure false)
      requireTLS: port !== 465, // force STARTTLS sur 587, jamais en clair
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD,
      },
    });
  }

  async sendVerificationEmail(email: string, code: string): Promise<boolean> {
    try {
      // Si les variables d'environnement ne sont pas configurées, utiliser la console
      if (!process.env.MAIL_USER || !process.env.MAIL_PASSWORD) {
        console.log(
          `⚠️  Configuration email manquante. Code de validation pour ${email}: ${code}`,
        );
        console.log(
          '💡 Pour envoyer de vrais emails, configurez MAIL_USER et MAIL_PASSWORD dans votre fichier .env',
        );
        return true;
      }

      const mailOptions = {
        from: `"${process.env.MAIL_FROM_NAME || 'Candidash'}" <${process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USER}>`,
        to: email,
        subject: 'Code de validation - Candidash',
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Candidash</h1>
              <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Validation de votre inscription</p>
            </div>

            <div style="background: #ffffff; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h2 style="color: #333; text-align: center; margin-bottom: 30px;">Votre code de validation</h2>

              <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
                Bonjour,<br><br>
                Merci de vous être inscrit sur Candidash ! Pour finaliser votre inscription, veuillez utiliser le code de validation suivant :
              </p>

              <div style="background: #f8f9fa; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
                <span style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: monospace;">${code}</span>
              </div>

              <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                Ce code est valide pendant <strong>10 minutes</strong>. Si vous n'avez pas demandé cette inscription, vous pouvez ignorer cet email.
              </p>

              <div style="text-align: center; margin-top: 40px;">
                <p style="color: #999; font-size: 14px; margin: 0;">
                  Candidash - Votre assistant pour gérer vos candidatures
                </p>
              </div>
            </div>
          </div>
        `,
        text: `
Candidash - Code de validation

Bonjour,

Merci de vous être inscrit sur Candidash ! Pour finaliser votre inscription, veuillez utiliser le code de validation suivant :

Code : ${code}

Ce code est valide pendant 10 minutes. Si vous n'avez pas demandé cette inscription, vous pouvez ignorer cet email.

Candidash - Votre assistant pour gérer vos candidatures
        `.trim(),
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email de validation envoyé à ${email}`);
      return true;
    } catch (error) {
      console.error("❌ Erreur lors de l'envoi de l'email:", error);
      // En cas d'erreur, afficher le code dans la console comme fallback
      console.log(`🔄 Fallback - Code de validation pour ${email}: ${code}`);
      return true; // On retourne true pour ne pas bloquer l'inscription
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!process.env.MAIL_USER || !process.env.MAIL_PASSWORD) {
        console.log(
          "⚠️  Configuration email non trouvée dans les variables d'environnement",
        );
        return false;
      }

      await this.transporter.verify();
      console.log('✅ Connexion au serveur email réussie');
      return true;
    } catch (error) {
      console.error('❌ Erreur de connexion au serveur email:', error);
      return false;
    }
  }
}
