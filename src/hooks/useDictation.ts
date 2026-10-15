/**
 * useDictation — extracted from App.jsx lines 158-233 (`demarrerDictee`).
 * This is genuinely well-built code with 3 real bug fixes already baked in
 * (per the original's own comment, preserved below) — ported as close to
 * verbatim as possible rather than "improved," since there's nothing to
 * improve here structurally. Only the calling convention changed slightly
 * (a factory function returning a controller object, same as the original;
 * TypeScript types added).
 *
 * Consumed by Chat and Journal (this batch) and will be consumed by Step 6's
 * Live Workout Mode set-by-set dictation later.
 */

export interface DictationController {
  arreter: () => void;
}

export interface DictationCallbacks {
  texteInitial?: string;
  onTexte: (text: string) => void;
  onEtat?: (active: boolean) => void;
  onErreur?: (message: string) => void;
}

// Minimal ambient typing for the non-standard Web Speech API — not in
// lib.dom.d.ts by default.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

/**
 * demarrerDictee — starts a voice dictation session. Fixes three defects of
 * a naive Web Speech API usage (preserved from the original comment):
 *  1. previously-typed text was overwritten instead of being appended to;
 *  2. Chrome stops listening after a few seconds of silence — this
 *     restarts automatically until the user explicitly taps Stop;
 *  3. no error was ever explained (mic denied, unsupported browser).
 */
export function demarrerDictee({
  texteInitial = "",
  onTexte,
  onEtat,
  onErreur,
}: DictationCallbacks): DictationController | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!SR) {
    onErreur?.("La dictée n'est pas disponible sur ce navigateur. Utilise Chrome, Edge ou Safari.");
    return null;
  }

  const r = new SR();
  r.lang = "fr-FR";
  // continuous = false deliberately: Android doesn't honor it and cuts off
  // after every sentence regardless. We restart ourselves in onend, giving
  // the same comfort on mobile and desktop.
  r.continuous = false;
  r.interimResults = true;

  const joindre = (a: string, b: string) => (a ? a.replace(/\s+$/, "") + " " : "") + b;

  // `base` = permanently acquired text. `provisoire` = in-progress sentence,
  // displayed but never accumulated.
  //
  // The final result REPLACES rather than appends. This is the key point:
  // Android returns each fragment as a separate final result ("je suis",
  // "je suis pressé", "je suis pressé d'aller"...). Summing them stacked
  // prefixes; keeping only the latest gives the complete sentence.
  let base = texteInitial ? texteInitial.replace(/\s+$/, "") : "";
  let provisoire = "";
  let arretDemande = false;

  r.onstart = () => onEtat?.(true);

  r.onresult = (e) => {
    let definitif = "";
    let encours = "";
    for (let i = 0; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) definitif = t;
      else encours = t;
    }
    if (definitif) {
      base = joindre(base, definitif.trim());
      encours = "";
    }
    provisoire = encours;
    onTexte(joindre(base, provisoire));
  };

  r.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return; // harmless
    arretDemande = true;
    onEtat?.(false);
    onErreur?.(
      e.error === "not-allowed"
        ? "Micro refusé. Autorise l'accès au micro pour ce site dans les réglages du navigateur."
        : "La dictée s'est interrompue. Réessaie."
    );
  };

  r.onend = () => {
    if (arretDemande) {
      onEtat?.(false);
      return;
    }
    // Sentence end: restart to continue dictation. `base` already holds
    // everything acquired, nothing to carry over.
    provisoire = "";
    try {
      r.start();
    } catch {
      onEtat?.(false);
    }
  };

  const controller: DictationController = {
    arreter: () => {
      arretDemande = true;
      try {
        r.stop();
      } catch {
        // ignore — recognition may already be stopped
      }
      onEtat?.(false);
    },
  };

  try {
    r.start();
  } catch {
    onEtat?.(false);
  }

  return controller;
}
