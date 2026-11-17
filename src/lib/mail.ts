/**
 * Envoi d'emails — réinitialisation de mot de passe.
 * 1. RESEND_API_KEY définie → envoi réel via Resend (gratuit : 100 emails/jour),
 *    appel REST direct via fetch : aucune dépendance npm nécessaire.
 * 2. Absente → le lien est affiché dans la CONSOLE du serveur (dev).
 *    Aucun lien n'est renvoyé dans la réponse HTTP (anti-énumération).
 *
 * IMPORTANT Resend : tant qu'aucun domaine n'est vérifié dans votre compte
 * Resend, l'expéditeur "onboarding@resend.dev" ne délivre qu'à l'adresse
 * email de PROPRIÉTAIRE du compte Resend — idéal pour tester avec votre
 * propre email. Pour écrire à tout le monde : vérifiez un domaine
 * (Resend → Domains) puis mettez MAIL_FROM="NexiRole <noreply@votre-domaine>".
 */

const FROM = process.env.MAIL_FROM ?? "NexiRole <onboarding@resend.dev>";

function resetEmailHtml(resetUrl: string, minutes: number): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">
    <div style="background:#051937;border-radius:12px 12px 0 0;padding:24px 32px">
      <h1 style="color:#ffffff;font-size:20px;margin:0">NexiRole</h1>
      <p style="color:#ffc107;font-size:13px;margin:4px 0 0">Votre assistant carrière IA</p>
    </div>
    <div style="padding:32px">
      <h2 style="color:#051937;font-size:18px;margin-top:0">Réinitialisation de votre mot de passe</h2>
      <p style="color:#334155;font-size:14px;line-height:1.6">
        Vous avez demandé la réinitialisation du mot de passe de votre compte NexiRole.
        Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :
      </p>
      <p style="text-align:center;margin:28px 0">
        <a href="${resetUrl}"
           style="background:#051937;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:bold;font-size:14px">
          Choisir un nouveau mot de passe
        </a>
      </p>
      <p style="color:#64748b;font-size:13px;line-height:1.6">
        Ce lien est valable ${minutes} minutes et ne peut être utilisé qu'une seule fois.
        Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email —
        votre mot de passe actuel reste inchangé.
      </p>
      <p style="color:#94a3b8;font-size:12px;border-top:1px solid #e2e8f0;padding-top:16px">
        Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/>
        <a href="${resetUrl}" style="color:#051937;word-break:break-all">${resetUrl}</a>
      </p>
    </div>
  </div>`;
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  expiresMinutes = 60
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(
      `\n[MAIL] RESEND_API_KEY absente — lien de réinitialisation pour ${to} (valable ${expiresMinutes} min) :\n  ${resetUrl}\n`
    );
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: "NexiRole — Réinitialisation de votre mot de passe",
        html: resetEmailHtml(resetUrl, expiresMinutes),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(
        "[MAIL] Erreur Resend :",
        res.status,
        await res.text().catch(() => "")
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error("[MAIL] Envoi impossible :", error);
    return false;
  }
}