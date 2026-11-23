// =============================================================
// [SYNC-PUBLICATION V2] Route atomique de publication du CV.
// POST /api/cv/<id>/publier : chaque clic d un bouton (publication,
// PDF avec QR, PDF simple) ecrit les modifications dans la base
// AVANT toute action. Le publie et l export restent identiques.
// GET  /api/cv/<id>/publier : diagnostic (existe ? publie ? cles ?)
// Body accepte : { cv: ... } | { data: ... } | { payload: ... } | brut
// Si "cv" est absent, la version stockee dans CvDocument est reprise.
// =============================================================
import { PrismaClient } from '@prisma/client';

const g = globalThis as any;
if (!g.__nexirolePrismaV2) {
  g.__nexirolePrismaV2 = new PrismaClient();
}
const prisma: any = g.__nexirolePrismaV2;

function errMsg(e: unknown): string {
  const anyE = e as any;
  return String((anyE && anyE.message) || e);
}

function jsonRes(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getCvId(ctx: any): Promise<string> {
  let p: any = (ctx && ctx.params) || {};
  if (p && typeof p.then === 'function') {
    p = await p;
  }
  return String((p && p.id) || '').trim();
}

const ID_KEYS = ['cvId', 'documentId', 'cvDocumentId', 'id'];
const JSON_KEYS = ['data', 'contenu', 'content', 'payload', 'cv', 'cvData', 'resume', 'json'];

export async function POST(req: Request, ctx?: any) {
  try {
    const cvId = await getCvId(ctx);
    if (!cvId) {
      return jsonRes({ ok: false, error: 'cvId manquant dans l URL de la route' }, 400);
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    if (body && typeof body === 'object' && body.source !== undefined) {
      delete body.source;
    }
    const hasCvKey = !!(body && typeof body === 'object' && ('cv' in body || 'data' in body || 'payload' in body));
    let raw: any = null;
    if (hasCvKey) {
      raw = body.cv !== undefined ? body.cv : (body.data !== undefined ? body.data : body.payload);
    } else if (body && typeof body === 'object') {
      raw = { ...body };
    }
    const hasData = !!(raw && typeof raw === 'object' && Object.keys(raw).length > 0);

    const writes: string[] = [];
    const errors: string[] = [];

    // 1) version stockee actuelle
    let stored: any = null;
    try {
      stored = await prisma.cvDocument.findUnique({ where: { id: cvId } });
    } catch (e) {
      errors.push('cvDocument.findUnique: ' + errMsg(e));
    }

    // 2) ecriture CvDocument
    let docData: any = null;
    if (hasData) {
      docData = raw;
    } else if (stored) {
      const c: any = { ...stored };
      delete c.id;
      docData = c;
    }
    if (docData) {
      try {
        await prisma.cvDocument.update({ where: { id: cvId }, data: docData });
        writes.push('cvDocument.update');
      } catch (e) {
        errors.push('cvDocument.update: ' + errMsg(e));
        try {
          await prisma.cvDocument.update({ where: { id: cvId }, data: {} });
          writes.push('cvDocument.touch');
        } catch (e2) {
          errors.push('cvDocument.touch: ' + errMsg(e2));
        }
      }
    } else {
      errors.push('cvDocument: aucune donnee a ecrire (cv absent et version stockee introuvable)');
    }

    // 3) PublicResume (copie publique) - essais multiples sur formes de schema
    const pubContent: any = hasData ? raw : (docData || stored || {});
    let pubDone = false;
    for (const ik of ID_KEYS) {
      if (pubDone) break;
      for (const jk of JSON_KEYS) {
        try {
          await prisma.publicResume.upsert({
            where: { [ik]: cvId },
            update: { [jk]: pubContent },
            create: { [ik]: cvId, [jk]: pubContent },
          });
          writes.push('publicResume.upsert(' + ik + ',' + jk + ')');
          pubDone = true;
          break;
        } catch (e) {
          if (errors.length < 16) {
            errors.push('publicResume.upsert(' + ik + ',' + jk + '): ' + errMsg(e));
          }
        }
      }
    }
    if (!pubDone) {
      errors.push('publicResume: aucune forme de schema n a fonctionne (voir erreurs)');
    }

    // 4) relecture pour renvoyer le lien public
    let pubRow: any = null;
    for (const ik of ID_KEYS) {
      try {
        pubRow = await prisma.publicResume.findFirst({ where: { [ik]: cvId } });
        if (pubRow) break;
      } catch {
        // forme non supportee : essai suivant
      }
    }
    const slug: string = String((pubRow && (pubRow.slug || pubRow.url || pubRow.publicSlug)) || '');

    const ok = writes.some((w) => w !== 'cvDocument.touch');
    return jsonRes({
      ok,
      publicOk: pubDone,
      cvId,
      writes,
      errors,
      slug,
      url: slug ? '/u/' + slug : '',
      cv: pubContent,
      storedKeys: Object.keys(stored || {}),
      pubKeys: pubRow ? Object.keys(pubRow) : [],
    });
  } catch (e) {
    return jsonRes({ ok: false, error: errMsg(e) }, 500);
  }
}

export async function GET(_req: Request, ctx?: any) {
  try {
    const cvId = await getCvId(ctx);
    if (!cvId) {
      return jsonRes({ ok: false, error: 'cvId manquant' }, 400);
    }
    let stored: any = null;
    let err = '';
    try {
      stored = await prisma.cvDocument.findUnique({ where: { id: cvId } });
    } catch (e) {
      err = errMsg(e);
    }
    let pubRow: any = null;
    for (const ik of ID_KEYS) {
      try {
        pubRow = await prisma.publicResume.findFirst({ where: { [ik]: cvId } });
        if (pubRow) break;
      } catch {
        // essai suivant
      }
    }
    return jsonRes({
      ok: !!stored,
      cvId,
      exists: !!stored,
      published: !!pubRow,
      storedKeys: Object.keys(stored || {}),
      pubKeys: pubRow ? Object.keys(pubRow) : [],
      error: err,
    });
  } catch (e) {
    return jsonRes({ ok: false, error: errMsg(e) }, 500);
  }
}