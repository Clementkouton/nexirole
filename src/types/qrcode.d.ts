/* ==================================================================
   NexiRole — Déclaration minimale du module "qrcode"
   Le paquet npm "qrcode" n'expose pas de types TypeScript et
   @types/qrcode n'est pas installé : le créateur de CV l'importe
   déjà dynamiquement (export PDF avec QR), la route PDF publique
   l'utilise côté serveur. Si @types/qrcode est installé un jour,
   ce fichier peut être supprimé sans autre modification.
   ================================================================== */

declare module "qrcode" {
  interface QRCodeToDataURLOptions {
    type?: "image/png" | "image/jpeg" | "image/webp";
    width?: number;
    margin?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }

  const QRCode: {
    toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
  };

  export default QRCode;
}