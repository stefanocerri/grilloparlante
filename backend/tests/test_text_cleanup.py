import pytest

from app.text_cleanup import clean_for_speech, number_to_words
from app.text_spoken import ordinal_to_words, roman_to_int


def spoken(text: str) -> str:
  return clean_for_speech(text, extended=True)


@pytest.mark.parametrize("written, read", [
  ("Il sig. Rossi e la sig.ra Bianchi.", "Il signor Rossi e la signora Bianchi."),
  ("Il dott. Verdi e la prof.ssa Neri.", "Il dottor Verdi e la professoressa Neri."),
  ("Il prof. Galli, l'avv. Gallo e l'ing. Riva.", "Il professor Galli, l'avvocato Gallo e l'ingegner Riva."),
  ("Mele, pere, ecc. Poi basta.", "Mele, pere, eccetera. Poi basta."),
  ("Mele, pere ecc., e altro.", "Mele, pere eccetera, e altro."),
  ("Vedi pag. 12 e p. 7.", "Vedi pagina dodici e pagina sette."),
  ("Il n. 3 del vol. 2, cap. 4.", "Il numero tre del volume due, capitolo quattro."),
  ("Ad es. questo, cfr. Eco.", "Ad esempio questo, confronta Eco."),
  ("S. Pietro, S. Anna e S. Stefano.", "San Pietro, Sant'Anna e Santo Stefano."),
  ("Lo disse S. Freud.", "Lo disse S. Freud."),
])
def test_abbreviazioni(written, read):
  assert spoken(written) == read


@pytest.mark.parametrize("written, read", [
  ("Il 50% dei casi.", "Il cinquanta per cento dei casi."),
  ("Costa 20 €.", "Costa venti euro."),
  ("Costa € 3,5 milioni.", "Costa tre virgola cinque milioni di euro."),
  ("Vale $ 100 e 1 €.", "Vale cento dollari e un euro."),
  ("Tom & Jerry.", "Tom e Jerry."),
  ("Fuori ci sono 30°C.", "Fuori ci sono trenta gradi."),
  ("Fa 2 + 2 = 4.", "Fa due più due uguale a quattro."),
  ("La guerra del 1914-1918.", "La guerra del millenovecentoquattordici millenovecentodiciotto."),
])
def test_simboli(written, read):
  assert spoken(written) == read


@pytest.mark.parametrize("written, read", [
  ("Vale 3,5 punti.", "Vale tre virgola cinque punti."),
  ("Solo lo 0,05 del totale.", "Solo lo zero virgola zero cinque del totale."),
  ("Erano 1.500.000 persone.", "Erano un milione cinquecentomila persone."),
  ("Costa 12.500 euro.", "Costa dodicimilacinquecento euro."),
  ("Alle 10:30 e alle 9:05.", "Alle dieci e trenta e alle nove e zero cinque."),
  ("Alle ore 18.00 in punto.", "Alle ore diciotto in punto."),
  ("Il 12/11/2026 a Roma.", "Il dodici novembre duemilaventisei a Roma."),
  ("L'1/5/1984 nacque.", "Il primo maggio millenovecentottantaquattro nacque."),
  ("Nel 1984 uscì.", "Nel millenovecentottantaquattro uscì."),
])
def test_numeri_date_ore(written, read):
  assert spoken(written) == read


@pytest.mark.parametrize("written, read", [
  ("Capitolo III", "Capitolo terzo"),
  ("Parte II", "Parte seconda"),
  ("Luigi XIV regnò a lungo.", "Luigi quattordicesimo regnò a lungo."),
  ("Elisabetta II regnò a lungo.", "Elisabetta seconda regnò a lungo."),
  ("Nel XIX secolo.", "Nel diciannovesimo secolo."),
  ("La missione Apollo XI partì.", "La missione Apollo XI partì."),
  ("Io e te, Malcolm X e i ragazzi.", "Io e te, Malcolm X e i ragazzi."),
])
def test_numeri_romani(written, read):
  assert spoken(written) == read


def test_ordinali_e_romani():
  assert [ordinal_to_words(n) for n in (1, 8, 11, 14, 20, 23, 26, 100)] == [
    "primo", "ottavo", "undicesimo", "quattordicesimo", "ventesimo", "ventitreesimo", "ventiseiesimo", "centesimo",
  ]
  assert ordinal_to_words(2, feminine=True) == "seconda"
  assert [roman_to_int(r) for r in ("III", "IV", "XIV", "XIX", "MCMLXXXIV")] == [3, 4, 14, 19, 1984]


def test_numeri_grandi():
  assert number_to_words(1984) == "millenovecentottantaquattro"
  assert number_to_words(2_000_000) == "due milioni"
  assert number_to_words(1_000_001) == "un milione uno"


@pytest.mark.parametrize("written, read", [
  ("— Ciao — disse lui — come stai?", "Ciao, disse lui, come stai?"),
  ("– Vieni qui.", "Vieni qui."),
  ("Era tardi (molto tardi) e pioveva.", "Era tardi, molto tardi, e pioveva."),
  ("Era finita (per ora).", "Era finita, per ora."),
  ("E poi... niente. . . .", "E poi… niente…"),
  ("Come scritto [12] altrove.", "Come scritto altrove."),
  ("IL GRILLO E LA LANTERNA", "Il grillo e la lanterna"),
  ("Disse: «BASTA!» e uscì.", "Disse: «Basta!» e uscì."),
  ("La NATO, l'ONU e la RAI.", "La NATO, l'ONU e la RAI."),
  ("CAPITOLO XVIII", "Capitolo diciottesimo"),
  ("Vai su https://www.example.com/a/b?c=1 oggi.", "Vai su example punto com oggi."),
  ("Scrivi a info@example.it.", "Scrivi a info chiocciola example punto it."),
  ("Capitolo 1 · La lanterna", "Capitolo uno. La lanterna"),
])
def test_trattini_parentesi_maiuscole_indirizzi(written, read):
  assert spoken(written) == read


def test_cambi_di_scena_e_paragrafi_restano():
  text = "Fine della scena.\n\n***\n\nNuova scena.\n\n—\n\nUn'altra."
  assert spoken(text) == text


def test_pulizia_ripetuta_non_cambia_piu_niente():
  text = "Il sig. Rossi (nato il 12/11/1950) pagò € 3,5 milioni — il 50% — alle 10:30. CAPITOLO III\n\n— Va bene... — disse."
  once = spoken(text)
  assert spoken(once) == once


def test_testo_gia_importato_con_la_pulizia_di_prima():
  # I libri già importati hanno le cifre in lettere: i simboli rimasti si leggono lo stesso.
  assert spoken(clean_for_speech("Il 50% costa €20, N° 5.")) == "Il cinquanta per cento costa venti euro, numero cinque."


def test_pulizia_classica_invariata():
  text = "Il sig. Rossi (nato nel 1950) pagò 20 €.\n\nCapitolo 1 · La lanterna"
  assert clean_for_speech(text) == "Il sig. Rossi (nato nel millenovecentocinquanta) pagò venti €.\n\nCapitolo uno. La lanterna"
