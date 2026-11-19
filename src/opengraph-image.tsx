import { ImageResponse } from "next/og";

/**
 * PARTIE 4 — Image OpenGraph dynamique (1200 × 630) aux couleurs NexiRole.
 * Servie sur /opengraph-image : affichée sur LinkedIn, WhatsApp, X…
 */

export const alt = "NexiRole — Votre assistant carrière intelligents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#051937",
          padding: 64,
          position: "relative",
        }}
      >
        {/* Bandeau doré supérieur */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 14,
            background: "#FFC107",
            display: "flex",
          }}
        />

        {/* Marque */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "#FFC107",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
              fontWeight: 800,
              color: "#051937",
            }}
          >
            N
          </div>
          <div
            style={{
              fontSize: 52,
              fontWeight: 800,
              color: "#FFFFFF",
              letterSpacing: -1,
            }}
          >
            NexiRole
          </div>
        </div>

        {/* Slogan */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 64,
              fontWeight: 800,
              color: "#FFFFFF",
              lineHeight: 1.15,
              maxWidth: 1000,
            }}
          >
            <div style={{ display: "flex" }}>Votre assistant carrière</div>
            <div style={{ display: "flex", color: "#FFC107" }}>intelligents.</div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "#94A3B8",
              maxWidth: 900,
              lineHeight: 1.4,
            }}
          >
            Recherche d&apos;emploi en direct · CV ATS généré par l&apos;IA ·
            lettres de motivation · kit d&apos;entretien
          </div>
        </div>

        {/* Badges plans */}
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              padding: "12px 28px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.10)",
              color: "#FFFFFF",
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            Découverte · Gratuit
          </div>
          <div
            style={{
              display: "flex",
              padding: "12px 28px",
              borderRadius: 999,
              background: "#FFC107",
              color: "#051937",
              fontSize: 24,
              fontWeight: 800,
            }}
          >
            Pass Boost · 30 jours
          </div>
          <div
            style={{
              display: "flex",
              padding: "12px 28px",
              borderRadius: 999,
              border: "2px solid #FFC107",
              color: "#FFC107",
              fontSize: 24,
              fontWeight: 800,
            }}
          >
            Carrière Pro · 90 jours
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
