<p align="center"><img src="web/logo.svg" width="128" alt="Krypto správa logo"></p>

# Krypto správa

Přehled kryptoměn, stakingu a **českých daní** na jednom místě – offline, bez registrace, data zůstávají u tebe.

- **ADA, BTC, ETH, SOL** přímo z blockchainu podle tvých adres (BTC i přes xpub z Ledgeru), **XRP, BNB, DOGE, TRX, LINK, XLM, LTC** z exportů burz (Binance, Coinmate, Anycoin, CoinBank, WhaleBooks/Coinbase)
- **Staking** – každá odměna s datem a cenou v USD / Kč (ADA, SOL)
- **České daně** – časový test 3 roky (FIFO), roční limit **100 000 Kč** od 2025 (společný pro všechna krypta), kolik ještě můžeš prodat bez daně
- **Portfolio s grafy**, tokeny na Cardanu, přepínání Kč / USD
- **Export** do CSV a přehledné **PDF zprávy** (celé období / rok / vybrané roky, volitelné části, adresy celé / zkrácené / skryté)
- Windows, Linux, macOS a Android
- **synchronizace PC ↔ mobil** přes domácí Wi-Fi (spárování QR kódem, šifrovaně, bez cloudu)

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

## Chyby a nápady

V appce: **Nastavení → O aplikaci → Nahlásit chybu / nápad** (nebo tlačítko u červené chybové hlášky) – otevře se předvyplněné hlášení s verzí a logem, adresy se automaticky zamaskují.
Případně rovnou [Issues → New issue](../../issues/new/choose). Hlášení jsou veřejná – nevkládej své adresy, xpub ani `state.json`.

## Soukromí

- Všechna data jsou jen ve tvém počítači / telefonu (`data/state.json`). Nic se neodesílá.
- Appka jen čte veřejná data: Koios (Cardano), mempool.space / blockstream.info (BTC), Blockscout (ETH), Solana RPC, Binance a CoinGecko (ceny), ČNB (kurzy), GitHub (kontrola nové verze).
- Nikdy nepotřebuje seed ani privátní klíče.

## Upozornění

Pomůcka pro přehled a výpočet podle pravidel platných v ČR. **Nenahrazuje daňové poradenství** – výsledky si ověř.

## Podpořit vývoj

Appka je zdarma. Pokud ti pomáhá, můžeš poslat libovolnou částku **ADA** nebo **BTC**:

| ADA (Cardano) | BTC (Bitcoin) |
|---|---|
| <img src="web/donate.svg" alt="QR kód ADA adresy" width="160"> | <img src="web/donate-btc.svg" alt="QR kód BTC adresy" width="160"> |

```
ADA: addr1q9fwf8s2mp3tea20l0p483staa2f9x4qk7l9zjqm8ka40gyweffndrftjdln9tk9nmmgwx0rys2svjfeen36xjkxhgjqp6nlxa
BTC: bc1qhxh9aucufsmh9f7qjwhvrkl9jn3umgzsw7dnwn
```

## Pro vývojáře

- `web/` – celá appka (HTML/JS), stejná pro PC i Android · `server.py` – lokální server (Python stdlib)
- `android/` – WebView obal · sestavení: GitHub Actions (`.github/workflows/release.yml`) nebo `BUILD-APK.bat`
- Nová verze: zvyš `VERSION` ve `web/core.js` (a `versionCode`/`versionName` v `android/app/build.gradle`), nahraj do `main` – zipy i APK se sestaví a vydají samy jako Release `vX.Y.Z`.
- `donate.json` – aktuální donate adresy (ADA, BTC), appka si ji načítá (změna se projeví i ve starších verzích).

Licence: [MIT](LICENSE) · přibalené knihovny: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT), [jsQR](https://github.com/cozmo/jsQR) (Apache 2.0, `web/vendor/LICENSE-jsQR.txt`)
