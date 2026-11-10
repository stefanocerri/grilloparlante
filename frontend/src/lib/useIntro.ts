import { useEffect } from "react";
import introUrl from "../assets/intro.m4a";

const PLAYED = "introPlayed";

/**
 * La voce del Grillo saluta la prima volta in assoluto che si apre il pannello, poi mai più.
 * Il pannello viene creato nascosto: si aspetta che sia visibile davvero.
 */
export function useIntro() {
  useEffect(() => {
    if (localStorage.getItem(PLAYED)) return;
    const audio = new Audio(introUrl);
    let started = false;

    const stop = () => {
      document.removeEventListener("visibilitychange", play);
      window.removeEventListener("pointerdown", play);
    };
    function play() {
      if (started || document.visibilityState !== "visible") return;
      started = true;
      audio.play().then(
        () => {
          localStorage.setItem(PLAYED, "1");
          stop();
        },
        // Riproduzione automatica bloccata: riprova al primo clic.
        () => (started = false)
      );
    }

    document.addEventListener("visibilitychange", play);
    window.addEventListener("pointerdown", play);
    play();
    return () => {
      stop();
      audio.pause();
    };
  }, []);
}
