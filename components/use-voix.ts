"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { textePourVoix } from "@/lib/voix";

/**
 * La voix dans le chat, en deux crochets indépendants.
 *
 * useDictee : micro → texte. Whisper tourne dans un Web Worker
 * (public/voix/stt-worker.js). L'enregistrement s'arrête seul après un
 * silence ; le texte reconnu est rendu à l'appelant, qui le place dans la
 * zone de saisie. Rien n'est envoyé sans que l'utilisateur ait pu relire :
 * un montant ou un nom mal entendu se corrige avant de partir.
 *
 * useLecture : texte → voix, par la synthèse vocale du navigateur.
 */

const MODELE_STT = process.env.NEXT_PUBLIC_STT_MODELE ?? "onnx-community/whisper-base";
/** WebGPU sur option : utile avec un modèle plus grand (whisper-small). */
const WEBGPU = process.env.NEXT_PUBLIC_STT_WEBGPU === "1";

/** Niveau RMS au-delà duquel on considère que l'utilisateur parle. */
const SEUIL_PAROLE = 0.02;
const SILENCE_FIN_MS = 1500;
const ATTENTE_MAX_MS = 8000;   // rien entendu : on abandonne
const DUREE_MAX_MS = 30000;

export type EtatDictee = "inactif" | "ecoute" | "transcription";

export function useDictee(surTexte: (texte: string) => void) {
    const [etat, setEtat] = useState<EtatDictee>("inactif");
    const [progression, setProgression] = useState<number | null>(null);
    const [niveau, setNiveau] = useState(0);
    const [erreur, setErreur] = useState<string | null>(null);

    const surTexteRef = useRef(surTexte);
    useEffect(() => { surTexteRef.current = surTexte; }, [surTexte]);

    const workerRef = useRef<Worker | null>(null);
    const fichiersRef = useRef<Record<string, { charge: number; total: number }>>({});
    const enregistreurRef = useRef<MediaRecorder | null>(null);
    const fluxRef = useRef<MediaStream | null>(null);
    const contexteRef = useRef<AudioContext | null>(null);
    const boucleRef = useRef<number | null>(null);
    const parleRef = useRef(false);

    const worker = useCallback(() => {
        if (workerRef.current) return workerRef.current;
        const w = new Worker("/voix/stt-worker.js", { type: "module" });
        w.onmessage = ({ data }) => {
            if (data.type === "progression") {
                fichiersRef.current[data.fichier] = { charge: data.charge, total: data.total };
                const f = Object.values(fichiersRef.current);
                const total = f.reduce((a, x) => a + x.total, 0);
                setProgression(total ? Math.round((100 * f.reduce((a, x) => a + x.charge, 0)) / total) : null);
            } else if (data.type === "pret") {
                setProgression(null);
            } else if (data.type === "texte") {
                setEtat("inactif");
                if (data.texte) surTexteRef.current(data.texte);
                else setErreur("Je n'ai rien compris. Réessayez en parlant plus près du micro.");
            } else if (data.type === "erreur") {
                setEtat("inactif");
                setProgression(null);
                setErreur(`Reconnaissance vocale indisponible : ${data.message}`);
            }
        };
        workerRef.current = w;
        return w;
    }, []);

    const liberer = useCallback(() => {
        if (boucleRef.current !== null) cancelAnimationFrame(boucleRef.current);
        boucleRef.current = null;
        fluxRef.current?.getTracks().forEach((p) => p.stop());
        fluxRef.current = null;
        contexteRef.current?.close().catch(() => { });
        contexteRef.current = null;
        setNiveau(0);
    }, []);

    const arreter = useCallback(() => {
        const r = enregistreurRef.current;
        if (r && r.state !== "inactive") r.stop();
        liberer();
    }, [liberer]);

    const transcrire = useCallback(async (morceaux: Blob[], type: string) => {
        if (!parleRef.current) {
            setEtat("inactif");
            setErreur("Je n'ai rien entendu.");
            return;
        }
        setEtat("transcription");
        try {
            const donnees = await new Blob(morceaux, { type }).arrayBuffer();
            // Whisper attend du mono à 16 kHz : le décodage rééchantillonne à la
            // fréquence du contexte audio.
            const ctx = new AudioContext({ sampleRate: 16000 });
            const audio = await ctx.decodeAudioData(donnees);
            await ctx.close();
            const pcm = new Float32Array(audio.getChannelData(0));
            worker().postMessage({ type: "transcrire", modele: MODELE_STT, webgpu: WEBGPU, audio: pcm }, [pcm.buffer]);
        } catch (e) {
            setEtat("inactif");
            setErreur(`Audio illisible : ${e instanceof Error ? e.message : String(e)}`);
        }
    }, [worker]);

    const demarrer = useCallback(async () => {
        setErreur(null);
        if (!navigator.mediaDevices?.getUserMedia) {
            setErreur("Le micro n'est accessible qu'en HTTPS ou sur localhost.");
            return;
        }
        // Le modèle se charge pendant que l'utilisateur parle.
        worker().postMessage({ type: "charger", modele: MODELE_STT, webgpu: WEBGPU });

        let flux: MediaStream;
        try {
            flux = await navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
            });
        } catch (e) {
            setErreur(e instanceof DOMException && e.name === "NotAllowedError"
                ? "L'accès au micro a été refusé."
                : "Aucun micro n'est disponible.");
            return;
        }
        fluxRef.current = flux;

        const morceaux: Blob[] = [];
        const enregistreur = new MediaRecorder(flux);
        enregistreur.ondataavailable = (e) => { if (e.data.size) morceaux.push(e.data); };
        enregistreur.onstop = () => transcrire(morceaux, enregistreur.mimeType);
        enregistreurRef.current = enregistreur;

        // Détection de fin de phrase : niveau sonore mesuré à chaque image.
        const ctx = new AudioContext();
        const analyseur = ctx.createAnalyser();
        analyseur.fftSize = 1024;
        ctx.createMediaStreamSource(flux).connect(analyseur);
        contexteRef.current = ctx;
        const tampon = new Float32Array(analyseur.fftSize);

        parleRef.current = false;
        const debut = performance.now();
        let dernierSon = debut;

        const mesurer = () => {
            analyseur.getFloatTimeDomainData(tampon);
            const rms = Math.sqrt(tampon.reduce((a, x) => a + x * x, 0) / tampon.length);
            setNiveau(Math.min(1, rms * 12));
            const t = performance.now();
            if (rms > SEUIL_PAROLE) { parleRef.current = true; dernierSon = t; }

            const finPhrase = parleRef.current && t - dernierSon > SILENCE_FIN_MS;
            const rienEntendu = !parleRef.current && t - debut > ATTENTE_MAX_MS;
            if (finPhrase || rienEntendu || t - debut > DUREE_MAX_MS) {
                arreter();
                return;
            }
            boucleRef.current = requestAnimationFrame(mesurer);
        };

        enregistreur.start();
        setEtat("ecoute");
        boucleRef.current = requestAnimationFrame(mesurer);
    }, [arreter, transcrire, worker]);

    const basculer = useCallback(() => {
        if (etat === "ecoute") arreter();
        else if (etat === "inactif") demarrer();
    }, [etat, arreter, demarrer]);

    useEffect(() => () => {
        liberer();
        workerRef.current?.terminate();
    }, [liberer]);

    return { etat, progression, niveau, erreur, basculer, effacerErreur: () => setErreur(null) };
}

// ---------------------------------------------------------------------------
// Synthèse vocale
// ---------------------------------------------------------------------------

const CLE_LECTURE_AUTO = "assistant-erp:lecture-auto";

// Préférence « lecture automatique » : lue comme une source externe, pour que
// le rendu serveur (false) et le premier rendu client concordent. Le stockage
// peut être indisponible (navigation privée) : une copie en mémoire prend le relais.
const abonnes = new Set<() => void>();
let memoire = false;

function lireAuto(): boolean {
    try { return localStorage.getItem(CLE_LECTURE_AUTO) === "1"; } catch { return memoire; }
}

function ecrireAuto(v: boolean) {
    memoire = v;
    try { localStorage.setItem(CLE_LECTURE_AUTO, v ? "1" : "0"); } catch { /* stockage indisponible */ }
    abonnes.forEach((f) => f());
}

const abonner = (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };
const sansAbonnement = () => () => { };
const syntheseDisponible = () => "speechSynthesis" in window;

/** La plus naturelle des voix françaises installées. */
function choisirVoix(): SpeechSynthesisVoice | null {
    const fr = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("fr"));
    return fr.find((v) => /natural|neural|online/i.test(v.name))
        ?? fr.find((v) => /google/i.test(v.name))
        ?? fr.find((v) => v.lang === "fr-FR")
        ?? fr[0]
        ?? null;
}

export function useLecture() {
    const disponible = useSyncExternalStore(sansAbonnement, syntheseDisponible, () => false);
    const auto = useSyncExternalStore(abonner, lireAuto, () => false);
    const [enCours, setEnCours] = useState<string | null>(null);
    const voixRef = useRef<SpeechSynthesisVoice | null>(null);

    useEffect(() => {
        if (!disponible) return;
        const maj = () => { voixRef.current = choisirVoix(); };
        maj();
        speechSynthesis.addEventListener("voiceschanged", maj);
        return () => {
            speechSynthesis.removeEventListener("voiceschanged", maj);
            speechSynthesis.cancel();
        };
    }, [disponible]);

    const arreter = useCallback(() => {
        if (!disponible) return;
        speechSynthesis.cancel();
        setEnCours(null);
    }, [disponible]);

    /** Lit un texte ; `cle` identifie le message lu, pour l'interface. */
    const parler = useCallback((texte: string, cle = texte) => {
        if (!disponible || !texte.trim()) return;
        speechSynthesis.cancel();
        const e = new SpeechSynthesisUtterance(textePourVoix(texte));
        e.lang = "fr-FR";
        if (voixRef.current) e.voice = voixRef.current;
        e.rate = 1.05;
        e.onend = () => setEnCours((c) => (c === cle ? null : c));
        e.onerror = () => setEnCours((c) => (c === cle ? null : c));
        setEnCours(cle);
        speechSynthesis.speak(e);
    }, [disponible]);

    const basculerAuto = useCallback(() => {
        const actif = lireAuto();
        if (actif && disponible) speechSynthesis.cancel();
        ecrireAuto(!actif);
    }, [disponible]);

    return { disponible, auto, enCours, parler, arreter, basculerAuto };
}
