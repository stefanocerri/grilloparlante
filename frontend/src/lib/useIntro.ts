import { useEffect } from "react";
import introUrl from "../assets/intro.m4a";

const PLAYED = "introPlayed";
/** Volume del saluto (1 = come il file): a metà, per non spaventare all'apertura. */
const VOLUME = 0.5;
let audio: HTMLAudioElement | null = null;
let starting = false;

/** Rifare la configurazione guidata dalle Impostazioni fa risentire anche il saluto. */
export function resetIntro() {
  localStorage.removeItem(PLAYED);
}

/**
 * La voce del Grillo saluta la prima volta in assoluto che si apre il pannello, poi mai più.
 * Il pannello viene creato nascosto: si aspetta che sia visibile davvero.
 * `onboarded` serve solo a ricontrollare quando la configurazione guidata riparte.
 */
export function useIntro(onboarded: boolean | undefined) {
  useEffect(() => {
    if (localStorage.getItem(PLAYED)) return;

    const stop = () => {
      document.removeEventListener("visibilitychange", play);
      window.removeEventListener("pointerdown", play);
    };
    function play() {
      if (starting || localStorage.getItem(PLAYED) || document.visibilityState !== "visible") return;
      starting = true;
      audio ??= new Audio(introUrl);
      audio.volume = VOLUME;
      audio.currentTime = 0;
      audio
        .play()
        .then(
          () => {
            localStorage.setItem(PLAYED, "1");
            stop();
          },
          // Riproduzione automatica bloccata: riprova al primo clic.
          () => undefined
        )
        .finally(() => (starting = false));
    }

    document.addEventListener("visibilitychange", play);
    window.addEventListener("pointerdown", play);
    play();
    return stop;
  }, [onboarded]);
}
