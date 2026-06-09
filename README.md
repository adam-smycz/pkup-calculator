# PKUP — kalkulator autorskich kosztów uzyskania przychodu

Webowy kalkulator do wyliczania **50% KUP** dla okresu rozliczeniowego od 10. do 9. dnia kolejnego miesiąca. Pobiera Twoje zmergowane PR-y z GitHuba, pozwala zaznaczyć które były pracą twórczą i proporcjonalnie rozdziela godziny między ticketami Jira (na podstawie liczby dodanych linii). Na końcu generuje raport XLSX.

## Wymagania

- **Node.js ≥ 18** (testowane na 20.x)
- **pnpm** (`npm i -g pnpm`)
- **GitHub CLI** (`gh`) — używany lokalnie przez middleware Vite do odpytywania GitHuba
- Aktywny **`gh auth login`** z tokenem, który ma scope'y:
  - `repo` — żeby czytać PR-y w organizacji
  - `read:org` — żeby zobaczyć listę członków orga (dropdown użytkownika)

Sprawdź swoje uprawnienia:

```bash
gh auth status
```

Jeśli brakuje scope'ów:

```bash
gh auth refresh -s repo,read:org
```

## Instalacja

```bash
git clone https://github.com/adam-smycz/pkup-calculator.git
cd pkup-calculator
pnpm install
cp .env.example .env
```

W `.env` ustaw dwa pola:

```bash
VITE_USERNAME=twoj-login-github      # domyślny user przy pierwszym uruchomieniu
VITE_GITHUB_ORG=aipoweredmarketer    # organizacja, z której pobieramy PR-y i listę userów
```

## Uruchomienie

```bash
pnpm dev
```

Aplikacja startuje na `http://localhost:5173`. URL pamięta wybrany rok/miesiąc (`/2026/january`), więc możesz zakładkować bezpośrednio okres.

Build produkcyjny:

```bash
pnpm build
pnpm preview
```

## Jak używać

1. **Wybierz rok i miesiąc** z górnych zakładek. Okres rozliczeniowy to zawsze 10. → 9. (np. styczeń = 10.01 → 09.02).
2. **Wybierz użytkownika** z dropdownu „Użytkownik" — lista to członkowie orga z `.env`. Cały stan (dni, %, PR-y) jest namespace'owany per user, więc kilka osób może korzystać z tej samej instancji.
3. **Zaznacz dni**: praca / urlop / L4. Dni robocze są wstępnie zaznaczone jako „praca", weekendy i święta polskie pomijane.
4. **Ustaw % pracy twórczej** — np. 50% oznacza że połowa godzin pracy to praca autorska. Wartość zapisywana per miesiąc.
5. **Sprawdź Githuba** — pobiera wszystkie Twoje zmergowane PR-y w orgu w danym okresie. Wynik cache'owany w `localStorage`, przycisk ↻ wymusza odświeżenie.
6. **Zaznacz PR-y twórcze** w tabeli — system proporcjonalnie (na bazie liczby dodanych linii) rozdziela Twoje **godziny twórcze (Hc)** między zaznaczone tickety.
7. **Wygeneruj XLS** — generuje plik `LOGIN.ROK.MM.miesiac.from.DD.MM.RR.to.DD.MM.RR.PKUP.report.xlsx`.

## Wzór

```
Ht = liczba dni roboczych × 8 h          (nominał czasu pracy w okresie)
Hc = Ht × (% pracy twórczej)              (godziny twórcze)
P  = Hc / (Ht − Ha)                       (procent KUP — dział płac dolicza Ha = nieobecności)
```

Godziny Hc są rozdzielane między zaznaczone PR-y proporcjonalnie do `additions`, z poprawką largest-remainder żeby suma równała się dokładnie Hc.

## Architektura

- **Vite + TypeScript**, czysty DOM (bez frameworka)
- Middleware w `vite.config.ts` proxuje dwa endpointy:
  - `GET /api/github-users` → `gh api orgs/:org/members --paginate`
  - `GET /api/github-prs?username=&start=&end=` → `gh search prs` + `gh pr view` po szczegóły
- Święta dla 2026–2030 leżą w `public/data/*.json`
- Cały stan w `localStorage`, klucze prefiksowane loginem (`pkup:LOGIN:2026/january`, `pkup-github:LOGIN:…` itd.)

## Tylko lokalnie

Aplikacja **wymaga lokalnego `gh` CLI** — nie ma backendu. Buildu produkcyjnego z `pnpm preview` nie da się sensownie używać bez Vite dev servera, bo middleware z GitHubem działa tylko w devie.
