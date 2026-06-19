# Handoff: Energy Piping Design — Strona WWW

## Overview
Kompletna strona internetowa firmy **Energy Piping Design Sp. z o.o.** — specjalistycznej firmy inżynierskiej zajmującej się orurowanie przemysłowym i energetycznym. Projekt obejmuje animowaną sekcję hero (canvas WebGL/2D) oraz cztery strony wewnętrzne z systemem SPA (single-page navigation z animowanymi przejściami).

## About the Design Files
Pliki w tym pakiecie to **prototypy high-fidelity napisane w HTML** — gotowe do odtworzenia wyglądu i zachowania w docelowym środowisku produkcyjnym (React, Next.js itp.). Pliki DC (Design Components) używają własnego systemu renderowania i NIE są przeznaczone do bezpośredniego wdrożenia. Zadaniem developera jest wierne odtworzenie projektu w wybranym frameworku, używając dostarczonych wartości kolorów, typografii, spacing i logiki animacji.

## Fidelity
**High-fidelity (hifi)** — pixel-perfect mockup z finalnymi kolorami, typografią, odstępami i interakcjami. Developer powinien odtworzyć UI możliwie wiernie, używając bibliotek i wzorców z istniejącej bazy kodu.

---

## Screens / Views

### 1. Hero (Strona główna)
**Cel:** Prezentacja firmy z animowaną instalacją rurociągów 3D w tle.

**Layout:**
- Pełnoekranowa sekcja (min-height: 100vh), overflow hidden
- Tło: `radial-gradient(125% 95% at 70% 38%, #133451 0%, #0a1c30 46%, #05101c 100%)`
- Canvas HTML2D (position: absolute, inset: 0) z animacją izometryczną
- Scrim lewo-prawo: `linear-gradient(102deg, #05101c 0%, rgba(5,16,28,0.92) 28%, rgba(6,18,32,0.12) 64%, transparent 78%)`
- Treść wyrównana do lewej, max-width 660px, padding: clamp(22px,5vw,72px)

**Nawigacja:**
- Logo: height clamp(60px,6.8vw,84px), plik: `epd-logo-white.png`
- Linki (IBM Plex Mono, 13px, letter-spacing 0.04em, uppercase, #bcd2e2): Usługi | Realizacje | O firmie | Certyfikaty
- Przycisk "Kontakt" (IBM Plex Mono, 13px, uppercase, border: 1px solid rgba(120,200,235,0.45), border-radius: 3px, padding: 10px 18px)
- Hover: border-color #2fb6d6, background rgba(47,182,214,0.1)

**Hero content (od lewej):**
- Eyebrow: IBM Plex Mono, 12–13px, letter-spacing 0.18em, uppercase, #5fd0ec + pulsująca kropka #2fb6d6
- H1: Space Grotesk 600, clamp(38px,6vw,76px), line-height 1.02, letter-spacing -0.02em, #f3f8fc
- Tekst: "Rurociągi projektowane z inżynierską precyzją."
- Paragraf: IBM Plex Sans, clamp(16px,1.5vw,20px), line-height 1.6, #a9c2d4
- CTA Primary: "Nasze realizacje →" — background #2fb6d6, color #04121d, padding 16px 30px, border-radius 3px, hover #56cce6
- CTA Secondary: "Poznaj usługi" — border: 1px solid rgba(160,200,225,0.28), color #eaf2f8

**Chips (IBM Plex Mono, 13px, #7f9bb0):**
Analizy podatności | Projekty & modelowanie 3D | Skanowanie laserowe | Automatyka — IRiESP & NC-RfG

**Canvas Animation (JS/Canvas 2D):**
Animacja w trzech fazach (loop 11s):
1. Skan (0–3.6s): Niebieska linia skanuje od lewej do prawej, odsłaniając chmurę punktów (pyłek)
2. Budowanie rur (3.6–6.8s): Izometryczna sieć rurociągów rysuje się jednocześnie — wszystkie gałęzie równomiernie
3. Przepływ energii (5.4s+): Cyjanowe impulsy płyną od punktu źródłowego radiacyjnie przez sieć, pyłek zanika

Izometryczna sieć (7 łańcuchów rurociągów):
- Główna głowica pozioma (podwójna: lewa + prawa od źródła)
- Lewa główna gałąź z pętlą dolną
- Gałąź środkowa (wstecz)
- Gałąź prawa (w dół)
- Pionowa mała
- Łańcuchy mają zaokrąglone łuki na zagięciach (arcTo w canvas 2D)

Punkt źródłowy energii: [-4.5, 2.4, -1.7] (koniec przedniego stubu), renderowany jako zielono-niebieska świecąca kropka.

Projekcja izometryczna (standard):
```
ix = (X - Z) * 0.866
iy = (X + Z) * 0.5 - Y
```

Paleta canvas:
- Tło: ciemny granat #05101c
- Rura shadow: rgba(6,22,38,0.88), width w*1.36
- Rura body: #2c77a0, width w
- Rura highlight: #3f8cb4, width w*0.58
- Rura sheen: rgba(165,224,247,0.82), width w*0.22
- Energia: radialGradient z accent #2fb6d6, tryb 'lighter'
- Pyłek: rgba(150,210,240, alpha), zanika po formowaniu rur

---

### 2. Usługi
**Cel:** Prezentacja 6 usług firmy w siatce kart.

**Layout:**
- Sticky nav (identyczna jak hero, active link: #2fb6d6)
- Header sekcji: eyebrow + H1 + paragraf (padding: clamp(48px,6vh,72px) clamp(22px,5vw,72px) 40px)
- Grid: `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`, gap: 1px, background: rgba(160,200,225,0.07)

**Karty usług (background #05101c, padding 32px 28px 28px):**
- Kod: IBM Plex Mono, 11px, uppercase, #2fb6d6, border-bottom: 1px solid rgba(47,182,214,0.18)
- Tytuł: Space Grotesk 600, 16–19px, #eaf2f8
- Opis: IBM Plex Sans, 14px, line-height 1.68, #7f9bb0

6 usług: EPD-SRV-01 Analizy przedprojektowe | EPD-SRV-02 Podatność rurociągów | EPD-SRV-03 Projekty wykonawcze i powykonawcze | EPD-SRV-04 Skanowanie laserowe 3D | EPD-SRV-05 Modelowanie 3D instalacji | EPD-SRV-06 Automatyzacja — IRiESP & NC-RfG

---

### 3. Realizacje
**Cel:** Siatka 6 przykładowych projektów.

**Karty projektów (background #05101c, padding 28px 26px 24px, flex column):**
- Kod + branża: IBM Plex Mono, 10px, uppercase, #4f6e85
- Klient: Space Grotesk 600, 15–18px, #eaf2f8
- Opis: 13.5px, line-height 1.6, #7f9bb0
- Rok: IBM Plex Mono, 11px, #2fb6d6

6 projektów: EC Katowice (2023) | KGHM (2023) | PKN Orlen (2022) | Enea Wytwarzanie (2022) | Tauron (2021) | Lotos Petrobaltic (2021)

---

### 4. O firmie
**Cel:** Historia firmy + kadra zarządzająca.

**Sekcja Historia:**
- Flex row (wrap): kolumna lewa (tekst) + timeline prawa
- Timeline: rok (IBM Plex Mono, 11px, #2fb6d6, width 48px) + opis, border-top: 1px solid rgba(255,255,255,0.07)
- Milestones: 2017, 2019, 2021, 2024

**Sekcja Kadra:**
- Zarząd (grid, minmax 220px, 260px, gap 48px 56px):
  - Paweł Ulbrich — Prezes Zarządu / Dyrektor Generalny — foto: uploads/ulbrich.jpg
  - Rafał Borówka — Wiceprezes Zarządu / Dyrektor Techniczny — foto: uploads/borowka.jpg
- Kadra menedżerska:
  - Michał Wilk — Prokurent (brak zdjęcia, placeholder)
  - Michał Celmer — Kierownik Zespołu Projektowego — foto: uploads/celmer.jpg

Zdjęcia: width 100%, aspect-ratio 1, object-fit cover, object-position top center, border 1px solid rgba(160,200,225,0.12)

---

### 5. Certyfikaty
**Cel:** Dwa placeholder'y na zdjęcia certyfikatów ISO.

Dwa placeholdery (border 1px solid rgba(160,200,225,0.12), border-radius 2px):
- ZSZ ISO 9001 — PN-EN ISO 9001:2015
- BHP ISO 45001 — PN-EN ISO 45001:2018
Aspect ratio: 1.414 (format A4), background: repeating-linear-gradient(-45deg, stripe pattern)

---

### 6. Modal Kontakt / Zapytaj o wycenę
**Cel:** Formularz kontaktowy + dane firmy.

**Layout:**
- position: fixed, full screen, z-index: 200, background: rgba(4,10,20,0.97)
- Max-width container 1060px, padding clamp(40px,6vh,72px) clamp(22px,5vw,72px)
- Flex row: formularz (flex:1) + kolumna danych (width 280px)

**Formularz:** Imię i Nazwisko, Firma, E-mail, Telefon, Przedmiot zapytania, Treść wiadomości
Inputy: background rgba(255,255,255,0.04), border 1px solid rgba(160,200,225,0.18), border-radius 2px, padding 12px 14px, color #eaf2f8
Submit: background #2fb6d6, color #04121d, padding 15px 32px

**Dane firmy:**
- Energy Piping Design Sp. z o.o.
- ul. Jesionowa 15, 40-159 Katowice
- kontakt@epdesign.pl
- NIP: 9542829277 | KRS: 0000914400 | REGON: 389584790
- LinkedIn: https://www.linkedin.com/company/energy-piping-design/

---

## Interactions & Behavior

### Nawigacja SPA
- Klik na link nawigacyjny → animacja przejścia → wyświetlenie nowej strony
- Stan: page = 'home' | 'uslugi' | 'realizacje' | 'ofirmie' | 'certyfikaty'
- Overlay wycena: boolean wycena = false

**Animacja przejścia (scan sweep):**
```css
@keyframes epdScanSweep {
  0%   { background-position: -200% 0; opacity: 1; }
  100% { background-position: 200%  0; opacity: 0; }
}
```
Overlay: `linear-gradient(90deg, transparent 0%, rgba(47,182,214,0.35) 49%, rgba(47,182,214,0.55) 50%, rgba(47,182,214,0.35) 51%, transparent 100%)`, background-size: 200% 100%, duration 0.6s
Zmiana strony: setTimeout 260ms po rozpoczęciu animacji

**Page styles:**
```js
active:   { transform: 'translateX(0)',    transition: 'transform 0.65s cubic-bezier(0.4,0,0.2,1)' }
inactive: { transform: 'translateX(100%)', pointerEvents: 'none' }
```

### Canvas Animation Timings
- front01 (sweep): clamp((t-200)/3000, 0, 1) — sweep progress
- buildP (pipes): clamp((t-3600)/3200, 0, 1) — pipe build progress
- flowA (energy): clamp((t-5400)/1800, 0, 1) — energy flow fade-in
- nodeA (dots): clamp((t-6200)/1000, 0, 1) — endpoint dot fade-in
- Cloud settle: clamp((t-6800)/1200, 0, 1) — dust fade-out
- Cloud mix: ease(clamp((t-1000)/2400, 0, 1)) — dust convergence
- Easing: `v < 0.5 ? 2*v*v : 1 - pow(-2*v+2,2)/2`

### Mouse Parallax (Hero)
```js
rot = sin(t * 0.00018) * 0.10 + mouse.x * 0.05
cx  = baseCx + mouse.x * 20
cy  = baseCy + mouse.y * 14 + sin(t * 0.00022) * 6
```

---

## Design Tokens

| Token | Value |
|-------|-------|
| bg-primary | #05101c |
| bg-secondary | #0a1c30 |
| bg-tertiary | #04101a |
| accent-cyan | #2fb6d6 |
| accent-hover | #56cce6 |
| text-primary | #eaf2f8 / #f3f8fc |
| text-secondary | #a9c2d4 / #8fa9bd |
| text-muted | #7f9bb0 / #4f6e85 |
| text-dark | #2f4558 / #3a5568 |
| border-subtle | rgba(160,200,225,0.12) |
| border-nav | rgba(160,200,225,0.07) |
| card-bg | rgba(255,255,255,0.025–0.04) |
| font-headline | Space Grotesk 600 |
| font-body | IBM Plex Sans 400/500/600 |
| font-mono | IBM Plex Mono 400/500 |

---

## Assets

| Plik | Opis |
|------|------|
| uploads/epd-logo-white.png | Logo EPDesign (białe, na ciemne tło, 640×388px) |
| uploads/ulbrich.jpg | Zdjęcie Paweł Ulbrich (Prezes) |
| uploads/borowka.jpg | Zdjęcie Rafał Borówka (Wiceprezes) |
| uploads/celmer.jpg | Zdjęcie Michał Celmer (Kierownik Zespołu) |

Fonty Google: Space Grotesk (400,500,600,700) + IBM Plex Sans (400,500,600) + IBM Plex Mono (400,500)

---

## Files

| Plik | Opis |
|------|------|
| Hero EPDesign.dc.html | Główny plik prototypu — cała strona w jednym pliku DC |

---

## Notes for Developer
- Cała logika canvas animation jest w klasie Component (logic class) — ok. 550 linii JS
- Sieć rurociągów zdefiniowana jako 7 łańcuchów (chains) z węzłami 3D
- Dijkstra do obliczenia odległości od źródła dla synchronizacji przepływu energii
- Pyłek (cloud points) — tablice prekalkulowane, renderowane w canvas 2D frame
- Każda strona wewnętrzna ma własną sticky nawigację z podświetleniem aktywnej pozycji
- Formularz w modalu jest statyczny (brak backendu) — wymaga integracji z emailem/CRM
