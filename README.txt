Krypto sprava 0.4.12 - prehled ADA, BTC, ETH, SOL a dalsich, staking a dane (CZ)
=============================================================================

Windows
-------
1) Spust START-PC.bat. Python je pribaleny ve slozce python - nic se neinstaluje.
   Zastupce s ikonou na plochu: spust jednou ZASTUPCE-NA-PLOSE.bat.
   Otevre se prohlizec na http://127.0.0.1:8765. Okno s konzoli nech otevrene.
2) Nastaveni -> zadej stake adresu/adresy (stake1...) -> Ulozit adresy.
3) Nastaveni -> Exporty z burz -> vyber CSV soubory (muzes vybrat vic najednou,
   i prekryvajici se - duplicity se vyradi).
4) Aktualizovat - stahne transakce a odmeny z blockchainu (Koios), ceny ADA/USD
   (Binance) a kurzy CNB. Dalsi aktualizace stahuje jen nove veci.
Data: data\state.json (+ .bak), exporty CSV: slozka exporty\

Linux
-----
1) Rozbal a v terminalu ve slozce spust:  ./start-linux.sh
   (kdyz to nejde: chmod +x start-linux.sh  nebo  bash start-linux.sh)
   Potrebuje jen Python 3 (vetsinou uz je; jinak sudo apt install python3).
   Otevre se prohlizec na http://127.0.0.1:8765. Terminal nech otevreny.
2)-4) dal stejne jako ve Windows. Data: data/state.json, exporty: slozka exporty/

Mac
---
1) Dvojklik na start-mac.command. Pri prvnim spusteni macOS muze napsat, ze jde
   o neznameho vyvojare: pravy klik -> Otevrit -> Otevrit.
   (kdyz to nejde: v Terminalu  chmod +x start-mac.command  nebo  bash start-mac.command)
   Potrebuje Python 3 (python.org, nebo v Terminalu: xcode-select --install).
2)-4) dal stejne jako ve Windows.

PDF zprava: Export -> PDF otevre zpravu v prohlizeci -> "Ulozit jako PDF" (vsechny systemy).

Android
-------
BUILD-APK.bat -> files\KryptoSprava-0.4.12-debug.apk (Gradle wrapper se zkopiruje ze slozky
v promenne GRADLE_WRAPPER_FROM, SDK z %LOCALAPPDATA%\Android\Sdk, platforma 35). Jednodussi: GitHub Actions.
Exporty CSV z telefonu jdou do Stazene soubory/Krypto-sprava.
Data PC a telefonu jsou oddelena - prenos: Synchronizace (nize) nebo Nastaveni -> Zaloha (JSON) -> Obnovit.

Synchronizace PC <-> mobil (0.4.0)
----------------------------------
PC: Nastaveni -> Synchronizace s mobilem -> Zapnout (ukaze QR kod).
Mobil: Nastaveni -> Synchronizace s PC -> Naskenovat QR (appka se zepta na kameru)
       nebo vlozit parovaci kod (text pod QR).
Prenasi se jen nastaveni: adresy, xpub, exporty z burz, rucni upravy. Data z blockchainu
si stahuje kazde zarizeni samo - mobil funguje i mimo domov. Synchronizuje se pri otevreni
appky v mobilu (nebo tlacitkem), kdyz je mobil na stejne Wi-Fi a na PC bezi appka.
Prenos je sifrovany (AES-GCM, klic jen v QR kodu), nejde pres zadny cizi server.
Windows se pri prvnim zapnuti zepta na povoleni ve firewallu - povol "Soukrome site".
Port: 8766 (zmena: promenna ADA_DANE_SYNC_PORT).

Dalsi mince (0.2.0)
-------------------
Nahore vyber minci (ADA, BTC, ETH, SOL, XRP, BNB, DOGE, TRX, LINK, XLM, LTC, Vsechny mince).
Kazda mince ma vlastni data, evidenci a opravy - nic se nemicha. Stablecoiny se nesleduji.
- BTC: Nastaveni -> xpub/ypub/zpub z Ledgeru nebo adresy bc1/1/3 (mempool.space, zaloha blockstream.info).
- ETH: adresa 0x... (Blockscout, jen ETH, ne tokeny).
- SOL: adresa (Solana RPC), vc. stakingu (stake ucty a odmeny po epochach).
- Ostatni jen z exportu burz. Po aktualizaci na 0.2.0 nahraj exporty znovu
  (stare importy maji ulozene jen ADA).
- Vsechny mince: soucet portfolia a SPOLECNY limit 100 000 Kc za vsechny mince.

Export (0.3.0)
--------------
Tlacitko "Export" nahore: obdobi (vse / jeden rok / vybrane roky), mince, casti
(portfolio, prumerna nakupni cena a zisk/ztrata, kde co je, dane po rocich, prodeje,
loty, staking, burzy, pohyby, adresy, kam odeslo, tokeny, grafy, metodika),
adresy cele / zkracene / skryte a "pro koho". Volby si appka pamatuje.
- CSV: kazda cast jako samostatny soubor (PC: slozka exporty, telefon: Stazene soubory/Krypto-sprava).
- PDF: zprava s grafy se otevre v novem okne -> "Ulozit jako PDF" (telefon: systemovy tisk).

Podporovane exporty
-------------------------------------
Binance  - Transaction History (User_ID, UTC_Time, Operation, Coin, Change)
Coinmate - historie transakci (ID;Datum;Typ;Castka;...)
Anycoin  - objednavky (UID,DATE,SYMBOL,ACTION,QUANTY,PRICE) i transakce (Date,Type,Amount...)
CoinBank - CoinBank-Obchody.csv
Coinbase - Vypisy / Statements (CSV, i vice souboru najednou)
WhaleBooks - TRANSACTION-EXPORT_<burza>_...
Exporty Ledger Live / Eternl / odmen se ignoruji - to se bere primo z blockchainu.

Jak to pocita
-------------
- FIFO: prodava se nejdriv nejstarsi ADA.
- Casovy test: osvobozeno, kdyz od nabyti uplynuly vic nez 3 roky.
- Limit 100 000 Kc/rok = hruby prijem ze vsech krypto prodeju (jine mince zadej v zalozce Dane).
  Pri prekroceni se dani cely prijem z mladsich ADA.
- Staking: odmena = prijem v den pripsani (zacatek epochy earned+2), cena ADA/USD
  z Binance x kurz CNB. Lze prepnout v Nastaveni.
- Vybery z burz se paruji s prichozimi transakcemi na blockchainu (hash / castka+cas).
  Nesparovane pohyby = vlastni prevod. Kdyz slo o prodej/platbu/prijem, zmen v Pohybech.
- Kontrola zustatku porovna evidenci se skutecnym zustatkem a ukaze rozdil.
- Co odeslo na cizi adresu a nevratilo se, se odepise bez prijmu (evidence = skutecny zustatek).
  Pokud slo o prodej/smenu, oznac to v "Kam odesly" jako Burza/prodej.
- Pravidla 3 roky a 100 000 Kc plati od roku 2025. Roky pred 2025 jsou jen informativni.

Nejsem danovy poradce - vysledky si nech zkontrolovat.

Navod
-----
Podrobny navod je v souboru NAVOD.pdf (ve slozce s appkou).

Podpora vyvoje
--------------
Appka je zdarma. Pokud ti pomaha, muzes autorovi poslat libovolnou castku ADA nebo BTC:
ADA (Cardano): addr1q9fwf8s2mp3tea20l0p483staa2f9x4qk7l9zjqm8ka40gyweffndrftjdln9tk9nmmgwx0rys2svjfeen36xjkxhgjqp6nlxa
BTC (Bitcoin):  bc1qhxh9aucufsmh9f7qjwhvrkl9jn3umgzsw7dnwn
(adresy i s QR kodem jsou v appce: Nastaveni -> Podporit vyvoj)
