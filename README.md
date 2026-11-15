# Krypto správa

Přehled kryptoměn, stakingu a **českých daní** na jednom místě – offline, bez registrace, data zůstávají u tebe.

- **ADA, BTC, ETH, SOL** přímo z blockchainu podle tvých adres (BTC i přes xpub z Ledgeru), **XRP, BNB, DOGE, TRX, LINK, XLM, LTC** z exportů burz (Binance, Coinmate, Anycoin, CoinBank, WhaleBooks/Coinbase)
- **Staking** – každá odměna s datem a cenou v USD / Kč (ADA, SOL)
- **České daně** – časový test 3 roky (FIFO), roční limit **100 000 Kč** od 2025 (společný pro všechna krypta), kolik ještě můžeš prodat bez daně
- **Portfolio s grafy**, tokeny na Cardanu, přepínání Kč / USD
- **Export** do CSV a přehledné **PDF zprávy** (celé období / rok / vybrané roky, volitelné části, adresy celé / zkrácené / skryté)
- Windows, Linux, macOS a Android

## Stažení

👉 **[Releases – poslední verze](../../releases/latest)**

| Systém | Soubor | Spuštění |
|---|---|---|
| Windows | `Krypto-sprava-X.Y.Z-Windows.zip` | rozbal → `START-PC.bat` |
| Linux | `Krypto-sprava-X.Y.Z-Linux.zip` | rozbal → `./start-linux.sh` |
| macOS | `Krypto-sprava-X.Y.Z-Mac.zip` | rozbal → `start-mac.command` |
| Android | `KryptoSprava-X.Y.Z.apk` | nainstaluj (povol neznámé zdroje) |

PC verze potřebuje jen **Python 3** (bez dalších knihoven). Podrobný návod je v balíčku jako `NAVOD.pdf`.

Appka sama upozorní, když vyjde nová verze.

## Soukromí

- Všechna data jsou jen ve tvém počítači / telefonu (`data/state.json`). Nic se neodesílá.
- Appka jen čte veřejná data: Koios (Cardano), mempool.space / blockstream.info (BTC), Blockscout (ETH), Solana RPC, Binance a CoinGecko (ceny), ČNB (kurzy), GitHub (kontrola nové verze).
- Nikdy nepotřebuje seed ani privátní klíče.

## Upozornění

Pomůcka pro přehled a výpočet podle pravidel platných v ČR. **Nenahrazuje daňové poradenství** – výsledky si ověř.

## Podpořit vývoj

Appka je zdarma. Pokud ti pomáhá, můžeš poslat libovolnou částku **ADA**:

```
addr1q9fwf8s2mp3tea20l0p483staa2f9x4qk7l9zjqm8ka40gyweffndrftjdln9tk9nmmgwx0rys2svjfeen36xjkxhgjqp6nlxa
```

<img src="web/donate.svg" alt="QR kód ADA adresy" width="160">

## Pro vývojáře

- `web/` – celá appka (HTML/JS), stejná pro PC i Android · `server.py` – lokální server (Python stdlib)
- `android/` – WebView obal · sestavení: GitHub Actions (`.github/workflows/release.yml`) nebo `BUILD-APK.bat`
- Nová verze: zvyš `VERSION` ve `web/core.js` (a `versionCode`/`versionName` v `android/app/build.gradle`), pushni tag `vX.Y.Z` – zipy i APK se sestaví a vydají samy.
- `donate.json` – aktuální donate adresa, appka si ji načítá (změna se projeví i ve starších verzích).

Licence: [MIT](LICENSE)
