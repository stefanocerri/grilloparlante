"""Scrive il testo come si legge: abbreviazioni, simboli, date, ore, decimali, numeri romani.

La voce legge quello che trova: «sig.» resta «sig», «3,5» diventa «tre, cinque», «Luigi XIV» «Luigi csiv». Qui ogni
forma scritta viene sostituita da quella parlata, e quello che non si può leggere (indirizzi web, parentesi,
trattini di dialogo, righe tutte maiuscole) diventa una pausa o sparisce.

Si usa da `clean_for_speech(..., extended=True)`, prima che gli interi rimasti vengano scritti in lettere.
"""

from __future__ import annotations

import re

from app.text_cleanup import number_to_words

_MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre",
           "ottobre", "novembre", "dicembre"]
_ORDINALS = ["", "primo", "secondo", "terzo", "quarto", "quinto", "sesto", "settimo", "ottavo", "nono", "decimo"]

# Parole dopo le quali un numero romano è un ordinale; True se la parola è femminile («Parte seconda»).
_ROMAN_HEADS = {
  "capitolo": False, "libro": False, "volume": False, "atto": False, "canto": False, "tomo": False,
  "titolo": False, "paragrafo": False, "articolo": False, "quaderno": False, "episodio": False,
  "parte": True, "scena": True, "sezione": True, "appendice": True, "lezione": True, "puntata": True,
  "tavola": True, "giornata": True, "novella": True,
}
# Nomi di re, imperatori e papi: solo dopo questi «XIV» è «quattordicesimo» (non dopo «Apollo» o «Rocky»).
_REGNAL_MALE = (
  "Luigi|Carlo|Enrico|Federico|Vittorio Emanuele|Umberto|Giovanni Paolo|Giovanni|Paolo|Pio|Leone|Benedetto|"
  "Gregorio|Clemente|Innocenzo|Urbano|Alessandro|Napoleone|Guglielmo|Filippo|Francesco|Ferdinando|Giorgio|"
  "Edoardo|Riccardo|Nicola|Pietro|Ottone|Massimiliano|Giuseppe|Leopoldo|Alfonso|Amedeo|Emanuele Filiberto|"
  "Ludovico|Costantino|Teodosio|Bonifacio|Sisto|Giulio|Adriano|Martino|Callisto|Celestino|Onorio|Eugenio|"
  "Stefano|Ruggero|Corrado|Cosimo|Tolomeo|Ramses|Dario|Baldovino|Giacomo|Cristiano|Gustavo|Ivan|Alberto|"
  "Vittorio Amedeo|Carlo Alberto|Carlo Emanuele|Francesco Giuseppe|Lotario|Pipino|Manfredi|Roberto|Sigismondo"
)
_REGNAL_FEMALE = "Elisabetta|Caterina|Maria Teresa|Maria|Vittoria|Isabella|Anna|Giovanna|Margherita|Cristina|Cleopatra"
# Santi più comuni: solo davanti a questi «S.» è «San», non davanti a un cognome («S. Freud»).
_SAINTS = (
  "Agata|Agnese|Agostino|Ambrogio|Andrea|Anna|Antonio|Barbara|Bartolomeo|Benedetto|Bernardo|Biagio|Carlo|"
  "Caterina|Cecilia|Chiara|Cristoforo|Domenico|Elena|Elia|Eufemia|Fedele|Filippo|Francesco|Gennaro|Giacomo|"
  "Gimignano|Giorgio|Giovanni|Girolamo|Giuseppe|Giulia|Giusto|Gregorio|Ignazio|Lazzaro|Leonardo|Lorenzo|Luca|"
  "Lucia|Luigi|Marco|Margherita|Maria|Marino|Martino|Matteo|Mauro|Michele|Nicola|Paolo|Pietro|Remo|Rita|Rocco|"
  "Rosa|Sebastiano|Severo|Silvestro|Siro|Stefano|Teresa|Tommaso|Valentino|Vincenzo|Vito|Vittore|Zeno"
)
_MALE_SAINTS_IN_A = {"Andrea", "Luca", "Nicola", "Elia"}

_ROMAN = r"(?=[IVXLCDM])M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})"
_ROMAN_ONLY = re.compile(rf"^{_ROMAN}$")
_ROMAN_AFTER_HEAD = re.compile(rf"\b({'|'.join(_ROMAN_HEADS)})\s+({_ROMAN})\b(?![’'])", re.IGNORECASE)
_ROMAN_AFTER_NAME = re.compile(rf"\b({_REGNAL_MALE}|{_REGNAL_FEMALE})\s+({_ROMAN})\b(?![’'.])")
_ROMAN_CENTURY = re.compile(rf"\b({_ROMAN})\s+(secolo|sec\.)|\b(secolo|sec\.)\s+({_ROMAN})\b", re.IGNORECASE)
_FEMALE_NAMES = set(_REGNAL_FEMALE.split("|"))

_URL = re.compile(r"(?:https?://|www\.)[^\s<>()«»]+", re.IGNORECASE)
_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b")
_ELLIPSIS = re.compile(r"\.(?:\s?\.){2,}")
_NOTE_BRACKET = re.compile(r"\s*\[\d{1,3}\]")
_DATE = re.compile(r"(?<![\w/.-])(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})(?![\w/-]|\.\d)")
_TIME = re.compile(r"(?<![\w:.,])([01]?\d|2[0-3])[:.]([0-5]\d)(?![\w:]|[.,]\d)")
_TIME_HINT = re.compile(r"(?:\bore|\balle|\bdalle|\bh\.?)\s*$", re.IGNORECASE)
_THOUSANDS = re.compile(r"(?<![\w.,])\d{1,3}(?:\.\d{3})+(?![\w]|[.]\d)")
_DECIMAL = re.compile(r"(?<![\w.,])(\d+),(\d+)(?![\w]|[.,]\d)")
_RANGE = re.compile(r"(?<![\w.,/-])(\d{1,4})\s?[-–—]\s?(\d{1,4})(?![\w/-]|[.,]\d)")
_PERCENT = re.compile(r"\s?%")
_PERMILLE = re.compile(r"\s?‰")
_MONEY_BEFORE = re.compile(r"([€$£])\s?(\d[\d.,]*\d|\d)(\s+(?:mila|milion[ei]|miliard[oi]))?")
_MONEY_AFTER = re.compile(r"(\d[\d.,]*\d|\d)(\s+(?:mila|milion[ei]|miliard[oi]))?\s?([€$£])")
_DEGREES = re.compile(r"\s?°\s?[CF]\b|\s?°")
_ORDINAL_MARK = re.compile(r"(?<![\w.,])(\d{1,3})([ºª])")
_NUMBER_SIGN = re.compile(r"\b[Nn][°º]\s?(?=\w)")
# Nei libri importati prima le cifre sono già in lettere: «€venti» va girato in «venti euro».
_MONEY_BEFORE_WORD = re.compile(r"([€$£])\s?([a-zà-ù]+)")
_PLUS = re.compile(r"(?<=[\w)])\s?\+\s?(?=[\w(])")
_EQUALS = re.compile(r"\s?=\s?")
_AMPERSAND = re.compile(r"\s?&\s?")
_DIALOGUE_START = re.compile(r"(?m)^[ \t]*[—–-][ \t]+")
_DASH_INSIDE = re.compile(r"[ \t]+[—–][ \t]+|[ \t]+-[ \t]+|(?<=\w)—(?=\w)")
_TITLE_SEPARATORS = re.compile(r"[ \t]+[·•|¦][ \t]+")
_OPEN_BRACKET = re.compile(r"\s*[(\[{]\s*")
_CLOSE_BRACKET = re.compile(r"\s*[)\]}]")
_CAPS_RUN = re.compile(r"[A-ZÀ-ÖØ-Þ]{2,}(?:[ \t'’,-]+[A-ZÀ-ÖØ-Þ]+)*")
_CAPS_WORD = re.compile(r"[A-ZÀ-ÖØ-Þ]+")

# (abbreviazione, forma letta). L'ordine conta: prima le più lunghe.
_ABBREVIATIONS: list[tuple[re.Pattern[str], str]] = [
  (re.compile(pattern, re.IGNORECASE), spoken)
  for pattern, spoken in [
    (r"\bsig\.ra\b\.?", "signora"),
    (r"\bsig\.na\b\.?", "signorina"),
    (r"\bsigg\.(?=\s)", "signori"),
    (r"\bsig\.(?=\s)", "signor"),
    (r"\bdott\.ssa\b\.?", "dottoressa"),
    (r"\bdott\.(?=\s)", "dottor"),
    (r"\bdr\.(?=\s)", "dottor"),
    (r"\bprof\.ssa\b\.?", "professoressa"),
    (r"\bprof\.(?=\s)", "professor"),
    (r"\bavv\.(?=\s)", "avvocato"),
    (r"\bing\.(?=\s)", "ingegner"),
    (r"\bad\s+es\.(?=[\s,:])", "ad esempio"),
    (r"\bper\s+es\.(?=[\s,:])", "per esempio"),
    (r"\bcfr\.(?=\s)", "confronta"),
    (r"\bpagg\.(?=\s*\d)", "pagine"),
    (r"\bpp\.(?=\s*\d)", "pagine"),
    (r"\bpag\.(?=\s*\d)", "pagina"),
    (r"\bp\.(?=\s*\d)", "pagina"),
    (r"\bnn\.(?=\s*\d)", "numeri"),
    (r"\bn\.(?=\s*\d)", "numero"),
    (r"\bcapp\.(?=\s*[\dIVXLC])", "capitoli"),
    (r"\bcap\.(?=\s*[\dIVXLC])", "capitolo"),
    (r"\bvoll\.(?=\s*[\dIVXLC])", "volumi"),
    (r"\bvol\.(?=\s*[\dIVXLC])", "volume"),
    (r"\bsec\.(?=\s*[IVXLC])", "secolo"),
  ]
]
_ETC = re.compile(r"\b(?:ecc|etc)\.(\s*)(?=(\S?))", re.IGNORECASE)
_SAINT = re.compile(rf"\b(?:S|St)\.\s?({_SAINTS})\b")
_CURRENCY = {"€": ("euro", "euro"), "$": ("dollaro", "dollari"), "£": ("sterlina", "sterline")}


def roman_to_int(numeral: str) -> int:
  values = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
  total = 0
  for index, letter in enumerate(numeral):
    value = values[letter]
    following = values.get(numeral[index + 1], 0) if index + 1 < len(numeral) else 0
    total += -value if value < following else value
  return total


def ordinal_to_words(n: int, feminine: bool = False) -> str:
  """Ordinale in lettere: 3 -> terzo, 14 -> quattordicesimo, 23 -> ventitreesimo."""
  if n <= 0:
    return number_to_words(n)
  if n <= 10:
    word = _ORDINALS[n]
  else:
    cardinal = number_to_words(n)
    # «tre» e «sei» in fondo tengono la vocale: ventitreesimo, ventiseiesimo.
    stem = cardinal if n % 10 in (3, 6) and n % 100 not in (13, 16) else cardinal[:-1]
    word = stem + "esimo"
  return word[:-1] + "a" if feminine else word


def _number(text: str) -> str:
  """Numero scritto con punti delle migliaia e virgola dei decimali, in lettere."""
  whole, _, decimals = text.partition(",")
  words = number_to_words(int(whole.replace(".", "")))
  if not decimals:
    return words
  # «0,05» si legge «zero virgola zero cinque»: gli zeri davanti vanno detti.
  zeros = len(decimals) - len(decimals.lstrip("0"))
  rest = decimals.lstrip("0")
  tail = " ".join(["zero"] * zeros + ([number_to_words(int(rest))] if rest else []))
  return f"{words} virgola {tail}"


def _date(match: re.Match[str]) -> str:
  day, month, year = int(match.group(1)), int(match.group(3)), match.group(4)
  if not (1 <= day <= 31 and 1 <= month <= 12):
    return match.group()
  if len(year) == 2:
    if match.group(2) != "/":
      return match.group()
    year_number = int(year) + (2000 if int(year) < 50 else 1900)
  else:
    year_number = int(year)
  spoken_day = "primo" if day == 1 else number_to_words(day)
  return f"{spoken_day} {_MONTHS[month - 1]} {number_to_words(year_number)}"


def _time(match: re.Match[str]) -> str:
  # Con il punto («ore 10.30») è un'ora solo se prima c'è scritto: altrimenti è un decimale all'inglese o altro.
  if "." in match.group() and not _TIME_HINT.search(match.string[:match.start()]):
    return match.group()
  hour, minute = int(match.group(1)), int(match.group(2))
  spoken_hour = "una" if hour == 1 else number_to_words(hour)
  if minute == 0:
    return spoken_hour
  spoken_minute = number_to_words(minute)
  return f"{spoken_hour} e {'zero ' if minute < 10 else ''}{spoken_minute}"


def _money(amount: str, scale: str | None, symbol: str) -> str:
  amount = amount.rstrip(".,")
  one, many = _CURRENCY[symbol]
  scale = (scale or "").strip()
  if scale:
    # «5 milioni di euro»: tra milioni e moneta ci vuole «di» (non dopo «mila»).
    joiner = " " if scale == "mila" else " di "
    return f"{_number(amount)} {scale}{joiner}{many}"
  if amount == "1":
    return f"{'una' if one.endswith('a') else 'un'} {one}"
  return f"{_number(amount)} {many}"


def _saint(match: re.Match[str]) -> str:
  name = match.group(1)
  if name.endswith("a") and name not in _MALE_SAINTS_IN_A:
    return f"Sant'{name}" if name[0] in "AEIOU" else f"Santa {name}"
  if name[0] in "AEIOU":
    return f"Sant'{name}"
  if name[0] == "Z" or (name[0] == "S" and name[1] not in "aeiou"):
    return f"Santo {name}"
  return f"San {name}"


def _etc(match: re.Match[str]) -> str:
  # A fine frase il punto dell'abbreviazione è anche il punto della frase: va tenuto.
  following = match.group(2)
  ends_sentence = not following or following.isupper() or following in "«“\"—–"
  return "eccetera" + ("." if ends_sentence else "") + match.group(1)


def _roman_after_head(match: re.Match[str]) -> str:
  numeral = match.group(2)
  # «Parte I» sì, ma «la parte I...» con una sola lettera minuscola non esiste: i numeri romani sono maiuscoli.
  if not numeral.isupper() or not _ROMAN_ONLY.match(numeral):
    return match.group()
  feminine = _ROMAN_HEADS[match.group(1).lower()]
  return f"{match.group(1)} {ordinal_to_words(roman_to_int(numeral), feminine)}"


def _roman_after_name(match: re.Match[str]) -> str:
  name, numeral = match.group(1), match.group(2)
  return f"{name} {ordinal_to_words(roman_to_int(numeral), name in _FEMALE_NAMES)}"


def _roman_century(match: re.Match[str]) -> str:
  numeral = match.group(1) or match.group(4)
  if not numeral.isupper():
    return match.group()
  return f"{ordinal_to_words(roman_to_int(numeral))} secolo"


def _starts_sentence(before: str) -> bool:
  before = before.rstrip(" \t«“»”\"'(—–-")
  return not before or before[-1] in ".!?…:\n"


def _lower_caps(text: str) -> str:
  """Le righe e le parole TUTTE MAIUSCOLE diventano minuscole: la voce le legge lettera per lettera o le grida.
  Restano le sigle brevi (ONU, NATO, RAI) e i numeri romani."""

  def fix(match: re.Match[str]) -> str:
    run = match.group()
    words = _CAPS_WORD.findall(run)
    longest = max(len(word) for word in words)
    if longest < 5 or (len(words) == 1 and _ROMAN_ONLY.match(run)):
      return run
    lowered = _CAPS_WORD.sub(lambda word: word.group() if _ROMAN_ONLY.match(word.group()) and len(word.group()) > 1 else word.group().lower(), run)
    return lowered[:1].upper() + lowered[1:] if _starts_sentence(match.string[:match.start()]) else lowered

  return _CAPS_RUN.sub(fix, text)


def _spoken_address(match: re.Match[str]) -> str:
  """Di un indirizzo web si legge solo il sito («example punto com»), senza http, www e percorso."""
  address = re.sub(r"^(?:https?://)?(?:www\.)?", "", match.group(), flags=re.IGNORECASE)
  trailing = ""
  while address and address[-1] in ".,;:!?":
    trailing = address[-1] + trailing
    address = address[:-1]
  host = address.split("/")[0].split("?")[0]
  return host.replace(".", " punto ") + trailing


def _tidy_punctuation(text: str) -> str:
  """Dopo le sostituzioni restano virgole doppie o prima di un punto: si rimettono a posto."""
  text = re.sub(r"[ \t]+([,;:.!?…»”])", r"\1", text)
  text = re.sub(r",(?:\s*,)+", ",", text)
  text = re.sub(r",\s*([.;:!?…])", r"\1", text)
  text = re.sub(r"([.;:!?…«“])\s*,\s*", r"\1 ", text)
  text = re.sub(r"(?m)^[ \t]*,\s*", "", text)
  text = re.sub(r"«[ \t]+", "«", text)
  return text


def spell_out(text: str) -> str:
  text = _ELLIPSIS.sub("…", text)
  text = _EMAIL.sub(lambda m: m.group().replace("@", " chiocciola ").replace(".", " punto "), text)
  text = _URL.sub(_spoken_address, text)
  text = _NOTE_BRACKET.sub("", text)

  # Abbreviazioni
  for pattern, spoken in _ABBREVIATIONS:
    text = pattern.sub(lambda m, spoken=spoken: spoken.capitalize() if m.group()[0].isupper() else spoken, text)
  text = _ETC.sub(_etc, text)
  text = _SAINT.sub(_saint, text)

  # Numeri romani (prima delle maiuscole: «CAPITOLO III» deve ancora riconoscersi)
  text = _ROMAN_CENTURY.sub(_roman_century, text)
  text = _ROMAN_AFTER_HEAD.sub(_roman_after_head, text)
  text = _ROMAN_AFTER_NAME.sub(_roman_after_name, text)

  # Date, ore, monete, percentuali, intervalli, decimali
  text = _DATE.sub(_date, text)
  # «l'1/5/1984» è diventato «l'primo maggio»: l'articolo va rifatto («il primo», «del primo», «al primo»).
  text = re.sub(r"\b(\w*?)(l)l['’]primo (?=" + "|".join(_MONTHS) + ")", r"\1\2 primo ", text)
  text = re.sub(r"\b([Ll])['’]primo (?=" + "|".join(_MONTHS) + ")", lambda m: ("Il" if m.group(1) == "L" else "il") + " primo ", text)
  text = _TIME.sub(_time, text)
  text = _MONEY_BEFORE.sub(lambda m: _money(m.group(2), m.group(3), m.group(1)), text)
  text = _MONEY_AFTER.sub(lambda m: _money(m.group(1), m.group(2), m.group(3)), text)
  text = _MONEY_BEFORE_WORD.sub(lambda m: f"{m.group(2)} {_CURRENCY[m.group(1)][1]}", text)
  text = re.sub(r"[€]", " euro ", text)
  text = re.sub(r"[$]", " dollari ", text)
  text = re.sub(r"[£]", " sterline ", text)
  text = _NUMBER_SIGN.sub(lambda m: "Numero " if m.group()[0] == "N" and _starts_sentence(m.string[:m.start()]) else "numero ", text)
  text = _ORDINAL_MARK.sub(lambda m: ordinal_to_words(int(m.group(1)), m.group(2) == "ª"), text)
  text = _RANGE.sub(lambda m: f"{number_to_words(int(m.group(1)))}, {number_to_words(int(m.group(2)))}", text)
  text = _THOUSANDS.sub(lambda m: _number(m.group()), text)
  text = _DECIMAL.sub(lambda m: _number(m.group()), text)
  text = _PERCENT.sub(" per cento", text)
  text = _PERMILLE.sub(" per mille", text)
  text = _DEGREES.sub(" gradi", text)
  text = _PLUS.sub(" più ", text)
  text = _EQUALS.sub(" uguale a ", text)
  text = _AMPERSAND.sub(" e ", text)

  # Trattini, separatori e parentesi diventano pause
  text = _DIALOGUE_START.sub("", text)
  text = _DASH_INSIDE.sub(", ", text)
  text = _TITLE_SEPARATORS.sub(". ", text)
  text = _OPEN_BRACKET.sub(", ", text)
  text = _CLOSE_BRACKET.sub(",", text)

  text = _lower_caps(text)
  return _tidy_punctuation(text)
