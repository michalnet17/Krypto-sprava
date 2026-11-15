#!/usr/bin/env python3
"""Vygeneruje manuál (HTML) pro každý systém; PDF se pak vytiskne přes Chrome (Playwright)."""
import sys, html, pathlib

VERSION = sys.argv[1] if len(sys.argv) > 1 else '0.3.1'
OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else '/tmp/manual')
OUT.mkdir(parents=True, exist_ok=True)
DONATE = 'addr1q9fwf8s2mp3tea20l0p483staa2f9x4qk7l9zjqm8ka40gyweffndrftjdln9tk9nmmgwx0rys2svjfeen36xjkxhgjqp6nlxa'
QR = (pathlib.Path(__file__).resolve().parents[2] / 'web' / 'donate.svg').read_text()
QR = QR[QR.index('<svg'):]

INSTALL = {
 'Windows': '''
<h2>2. Instalace a spuštění – Windows</h2>
<ol>
<li><b>Python 3</b> – stáhni z <b>python.org</b> → Downloads → Windows. Při instalaci <b>zaškrtni „Add python.exe to PATH“</b>. (Nic dalšího se instalovat nemusí.)</li>
<li>Rozbal <code>Krypto-sprava-%s-Windows.zip</code> kamkoli (např. Dokumenty).</li>
<li>Dvojklik na <b>START-PC.bat</b>. Otevře se černé okno (server) a prohlížeč s appkou na <code>http://127.0.0.1:8765</code>.</li>
<li><b>Černé okno nech otevřené</b>, dokud appku používáš. Ukončení: zavři okno.</li>
</ol>
<p class="tip">Windows může při prvním spuštění zobrazit „Systém Windows ochránil počítač“ → <i>Další informace → Přesto spustit</i>. Appka je jen skript, nic neinstaluje.</p>
''' % VERSION,
 'Linux': '''
<h2>2. Instalace a spuštění – Linux</h2>
<ol>
<li><b>Python 3</b> už většina distribucí má. Ověř v terminálu: <code>python3 --version</code>. Když chybí:
 <ul><li>Debian / Ubuntu / Mint: <code>sudo apt install python3</code></li><li>Fedora: <code>sudo dnf install python3</code></li><li>Arch: <code>sudo pacman -S python</code></li></ul></li>
<li>Rozbal <code>Krypto-sprava-%s-Linux.zip</code> (např. do domovské složky).</li>
<li>V terminálu ve složce <code>Krypto-sprava</code> spusť: <code>./start-linux.sh</code><br>
 Když napíše „Permission denied“: <code>chmod +x start-linux.sh</code> nebo spusť <code>bash start-linux.sh</code>.</li>
<li>Otevře se prohlížeč s appkou na <code>http://127.0.0.1:8765</code>. <b>Terminál nech otevřený</b>, ukončení <code>Ctrl+C</code>.</li>
</ol>
<p class="tip">Kdyby se prohlížeč neotevřel sám, otevři adresu <code>http://127.0.0.1:8765</code> ručně.</p>
''' % VERSION,
 'Mac': '''
<h2>2. Instalace a spuštění – macOS</h2>
<ol>
<li><b>Python 3</b> – nainstaluj z <b>python.org</b> → Downloads → macOS, nebo v Terminálu <code>xcode-select --install</code>.</li>
<li>Rozbal <code>Krypto-sprava-%s-Mac.zip</code> (dvojklik), složku si přesuň třeba do Dokumentů.</li>
<li>Dvojklik na <b>start-mac.command</b>. Při prvním spuštění macOS hlásí neznámého vývojáře:
 <b>pravý klik → Otevřít → Otevřít</b> (stačí jednou).</li>
<li>Otevře se Terminál (server) a prohlížeč s appkou na <code>http://127.0.0.1:8765</code>. <b>Terminál nech otevřený.</b></li>
</ol>
<p class="tip">Když dvojklik nefunguje („nemáte oprávnění“), v Terminálu ve složce spusť <code>chmod +x start-mac.command</code> nebo rovnou <code>bash start-mac.command</code>.</p>
''' % VERSION,
 'Android': '''
<h2>2. Instalace – Android (telefon)</h2>
<ol>
<li>Do telefonu zkopíruj soubor <b>KryptoSprava-%s-debug.apk</b> (od autora / z počítače).</li>
<li>Otevři ho ve Správci souborů. Telefon se zeptá na povolení <b>instalace z neznámých zdrojů</b> pro tuto aplikaci (Soubory / Chrome) – povol.</li>
<li>Nainstaluj a spusť <b>Krypto správa</b>. Appka běží celá v telefonu, server ani počítač nepotřebuje.</li>
</ol>
<p class="tip">Exporty (CSV) se ukládají do <b>Stažené soubory / Krypto-sprava</b>. PDF zpráva se otevře v systémovém tisku – zvol cíl <b>Uložit jako PDF</b>.<br>
Google Play Protect může varovat, že appka není z Obchodu Play – je to běžné u appek instalovaných přímo z APK.</p>
<h3>Sestavení APK (jen pro vývojáře, Windows)</h3>
<p>Složka obsahuje zdrojáky a <code>BUILD-APK.bat</code>. Potřeba: Java 17, Android SDK (platforma 35) a Gradle wrapper – skript ho zkopíruje ze složky v proměnné <code>GRADLE_WRAPPER_FROM</code>. Jednodušší je sestavení přes GitHub Actions (tag <code>vX.Y.Z</code>). Výsledek: <code>files\\KryptoSprava-%s-debug.apk</code>.</p>
''' % (VERSION, VERSION),
}

COMMON_TOP = '''
<h2>1. Co appka umí</h2>
<ul>
<li>Přehled kryptoměn <b>ADA, BTC, ETH, SOL</b> přímo z blockchainu podle tvých adres a <b>XRP, BNB, DOGE, TRX, LINK, XLM, LTC</b> z exportů burz. Každá mince má vlastní evidenci, nic se nemíchá. Stablecoiny se nesledují.</li>
<li><b>Staking</b> – každá odměna s datem připsání a cenou v USD i Kč (ADA, SOL).</li>
<li><b>České daně</b> – časový test 3 roky (FIFO), roční limit <b>100 000 Kč</b> od roku 2025 (společný pro všechna krypta), kolik ještě můžeš prodat bez daně, kdy se další mince dostanou přes 3 roky.</li>
<li><b>Portfolio s grafy</b>, tokeny na Cardanu s logy a cenou, přepínání Kč / USD.</li>
<li><b>Export</b> do CSV (Excel) a přehledné <b>PDF zprávy</b> – celé období, jeden rok nebo vybrané roky, volitelné části.</li>
<li>Vše běží <b>jen u tebe</b> – data se nikam neodesílají, appka jen stahuje veřejná data z blockchainu a ceny.</li>
</ul>
'''

COMMON = '''
<h2>3. První nastavení</h2>
<p>Nahoře je <b>výběr mince</b> (ADA, BTC, …, Všechny mince). Nastavení se dělá zvlášť pro každou minci v záložce <b>Nastavení</b>.</p>
<h3>Peněženky (blockchain)</h3>
<table>
<tr><th>Mince</th><th>Co zadat</th><th>Kde to najdu</th></tr>
<tr><td><b>ADA</b></td><td>stake adresa <code>stake1…</code> (nebo jakákoli <code>addr1…</code> adresa peněženky – appka si stake dopočítá)</td><td>Eternl / Yoroi / Lace: Přijmout → adresa; appka sama dohledá všechny adresy pod stake klíčem.</td></tr>
<tr><td><b>BTC</b></td><td><b>xpub / ypub / zpub</b> celého účtu (doporučeno), případně jednotlivé adresy <code>bc1…</code>, <code>1…</code>, <code>3…</code></td><td>Ledger Live: Účty → Bitcoin → ⋯ / ikona klíče → Upravit účet → Pokročilé → xpub. Je i v exportu operací z Ledger Live – appka ho pak sama nabídne.</td></tr>
<tr><td><b>ETH</b></td><td>adresa <code>0x…</code></td><td>Peněženka → Přijmout.</td></tr>
<tr><td><b>SOL</b></td><td>adresa peněženky (vč. stakingu – stake účty se najdou samy)</td><td>Phantom / Solflare / Ledger → Přijmout.</td></tr>
</table>
<p>Po vložení klikni <b>Uložit a načíst</b>. Každá adresa na samostatný řádek.</p>
<p class="tip"><b>xpub</b> slouží jen ke čtení – kdo ho má, vidí tvoje BTC adresy a zůstatky, ale nemůže nic poslat. Přesto ho nikomu nedávej.<br>
<b>Nikdy nikam nezadávej seed (12/24 slov) ani privátní klíč.</b> Appka je nikdy nepotřebuje.</p>
<p class="warn"><b>Pozor na adresy burz:</b> nezadávej jako „svou“ vkladovou adresu na burze (Binance, Coinmate…). Burza z ní hned posílá prostředky dál a evidence by se rozhodila. Appka takovou adresu u BTC pozná a upozorní.</p>

<h3>Exporty z burz</h3>
<p>Nastavení → <b>Exporty z burz</b> → vyber CSV soubory (můžeš víc najednou, i překrývající se – duplicity se vyřadí). Exporty jsou společné pro všechny mince, každá mince si z nich vezme své řádky.</p>
<table>
<tr><th>Burza</th><th>Jaký export</th></tr>
<tr><td>Binance</td><td>Historie transakcí (Transaction History) – CSV se sloupci User_ID, UTC_Time, Operation, Coin, Change. Lze po rocích.</td></tr>
<tr><td>Coinmate</td><td>Historie transakcí – CSV (oddělené středníkem).</td></tr>
<tr><td>Anycoin</td><td>Objednávky i transakce – CSV.</td></tr>
<tr><td>CoinBank</td><td>Obchody – CSV.</td></tr>
<tr><td>Coinbase a další</td><td>Přes WhaleBooks: TRANSACTION-EXPORT_&lt;burza&gt;….csv</td></tr>
</table>
<p>Exporty z Ledger Live / Eternl appka nepotřebuje (bere blockchain přímo) – z Ledger Live si jen přečte xpub a adresy účtů a nabídne je k přidání.</p>

<h2>4. Aktualizace</h2>
<p>Tlačítko <b>Aktualizovat</b> stáhne nové transakce, odměny, ceny (Binance, CoinGecko) a kurzy ČNB. Poprvé to může trvat i několik minut, další aktualizace stahují jen nové věci. Když jsou data starší než 12 h, appka se aktualizuje sama po spuštění.</p>
<p class="tip">Když veřejný server omezí rychlost („moc dotazů“), appka sama zpomalí a pokračuje. U BTC se při výpadku mempool.space použije blockstream.info.</p>

<h2>5. Jak číst přehled</h2>
<ul>
<li><b>Portfolio</b> – kde co je (peněženky, staking, burzy) a hodnota. Tlačítko <b>Kč ↔ $</b> přepíná měnu.</li>
<li><b>Grafy</b> – složení podle mincí, podle místa a podíl nad / pod 3 roky.</li>
<li><b>Drženo déle než 3 roky</b> (zeleně) = osvobozeno od daně. <b>Drženo kratší dobu</b> (oranžově) = při prodeji se počítá do limitu / daně.</li>
<li><b>Rok …: kolik můžeš prodat bez daně</b> – zbývající limit 100 000 Kč za aktuální rok (za všechna krypta dohromady).</li>
<li><b>Kontrola zůstatku</b> – evidence vs. skutečnost (blockchain + burzy). Rozdíl by měl být 0.</li>
<li><b>Upozornění</b> (žluté rámečky) – co je potřeba dořešit: příchozí bez doloženého nákupu, odchody na cizí adresy, adresa burzy zadaná jako vlastní…</li>
</ul>

<h3>Kam odešly (cizí adresy)</h3>
<p>Seznam adres, kam odešly mince a nevrátily se. Dokud je neoznačíš, berou se jako <b>úbytek bez příjmu</b> (evidence tak sedí se zůstatkem). U každého příjemce můžeš zvolit:</p>
<ul>
<li><b>Moje peněženka</b> – je to tvoje další peněženka, appka ji přidá a načte (převody se vyruší). Použij jen pro <i>vlastní</i> peněženku, ne pro adresu burzy.</li>
<li><b>Burza / prodej</b> – šlo o prodej nebo směnu za jinou kryptoměnu (počítá se příjem za tržní cenu v den odeslání). Patří sem i swap na DEX.</li>
<li><b>Ztráta / dar</b> – scam, ztracené mince, dar (bez příjmu).</li>
<li><b>Zrušit</b> – vrátí označení.</li>
</ul>

<h3>Ostatní záložky</h3>
<ul>
<li><b>Odměny</b> – staking odměna po epochách (datum, množství, cena USD/Kč, kdy bude osvobozená).</li>
<li><b>Loty</b> – co kdy bylo nabyto, kolik zbývá, kdy projde časovým testem.</li>
<li><b>Pohyby</b> – všechny transakce. U každé lze ručně opravit zařazení (vlastní převod, nákup, příjem, prodej/swap/platba, ztráta…). Filtr <i>jen k vyřešení</i> ukáže, co chybí.</li>
<li><b>Daně</b> – prodeje (FIFO) a souhrn po letech, limit 100 000 Kč. Pole <i>Krypto mimo appku</i> pro příjmy z kryptoměn, které v appce nemáš.</li>
<li><b>Nastavení → Pravidla</b> – zda se staking bere jako příjem v den připsání, zda se do limitu počítají i prodeje mincí starších 3 let (opatrnější varianta), výše limitu.</li>
</ul>

<h2>6. Všechny mince</h2>
<p>Volba <b>Všechny mince</b> nahoře ukáže celkové portfolio, grafy, <b>společný limit 100 000 Kč</b> za aktuální rok a příjmy z prodejů po letech za všechny mince.</p>

<h2>7. Export (CSV / PDF)</h2>
<p>Tlačítko <b>⇩ Export</b> nahoře. Volby si appka pamatuje:</p>
<ul>
<li><b>Období</b> – celé období, jeden rok, nebo vybrané roky.</li>
<li><b>Mince</b> – které zahrnout.</li>
<li><b>Formát</b> – <b>CSV</b> (každá část samostatný soubor, pro Excel) a/nebo <b>PDF</b> (zpráva s grafy).</li>
<li><b>Adresy</b> – celé (pro tebe), zkrácené (pro účetní, úřad) nebo skryté (pro cizí). Pole „Pro koho“ se vypíše do hlavičky.</li>
<li><b>Části</b> – každou lze vypnout: souhrn, grafy, portfolio, průměrná nákupní cena a nerealizovaný zisk/ztráta, kde co je, daně po rocích, prodeje, loty, staking (souhrn i jednotlivě), burzy a směnárny, všechny pohyby, adresy, kam odešly, tokeny, metodika.</li>
</ul>
<p><b>PDF:</b> zpráva se otevře v novém okně prohlížeče → v tisku zvol <b>Uložit jako PDF</b>. (Když se okno neotevře, povol v prohlížeči vyskakovací okna pro 127.0.0.1.)<br>
<b>CSV:</b> ukládá se do složky <code>exporty</code> vedle appky (v telefonu Stažené soubory / Krypto-sprava).</p>

<h3>Nové verze</h3>
<p>Když vyjde nová verze, appka nahoře ukáže lištu <b>„Je dostupná nová verze …“</b> s tlačítkem <b>Stáhnout</b> (vede na stránku ke stažení: <b>github.com/michalnet17/krypto-sprava/releases</b>). Nic se neinstaluje samo. Stáhni nový balíček, rozbal ho přes starý (složka <code>data</code> zůstane) a spusť znovu. Kontrolu lze vypnout v Nastavení → O aplikaci.</p>

<h2>8. Data, záloha a soukromí</h2>
<ul>
<li>Všechna data jsou v souboru <code>data/state.json</code> ve složce appky (+ automatická záloha <code>state.json.bak</code>). V telefonu v úložišti appky.</li>
<li><b>Nastavení → Záloha</b> – <i>Uložit zálohu (JSON)</i> a <i>Obnovit ze zálohy</i>. Tak přeneseš data mezi PC a telefonem nebo na jiný počítač.</li>
<li>Když appku posíláš dál, posílej jen balíček (zip) – <b>nikdy složku <code>data</code></b>, jsou v ní tvoje adresy.</li>
<li>Appka komunikuje jen s veřejnými službami: Koios (Cardano), mempool.space / blockstream.info (BTC), Blockscout (ETH), Solana RPC, Binance a CoinGecko (ceny), ČNB (kurzy). Neodesílá tam nic osobního kromě adres, které si nechá načíst.</li>
</ul>

<h2>9. Řešení problémů</h2>
<table>
<tr><th>Problém</th><th>Řešení</th></tr>
<tr><td>„Nenašel jsem Python“</td><td>Nainstaluj Python 3 (viz kapitola 2).</td></tr>
<tr><td>Port 8765 obsazený / „běží stará verze serveru“</td><td>Zavři všechna okna / terminály appky a spusť ji znovu. Novější verze starou ukončí sama.</td></tr>
<tr><td>Po aktualizaci se nic nezměnilo</td><td>V prohlížeči <b>Ctrl+F5</b> (Mac: Cmd+Shift+R).</td></tr>
<tr><td>Chyba SSL / certifikát</td><td>Appka zkusí záložní cestu přes systémový curl. Pomůže i aktualizace Pythonu.</td></tr>
<tr><td>Zůstatek nesedí</td><td>Zkontroluj, zda máš zadané všechny peněženky (u BTC xpub) a nahrané exporty všech burz. Pak dořeš „Kam odešly“ a Pohyby → <i>jen k vyřešení</i>.</td></tr>
<tr><td>Adresa s desítkami tisíc transakcí</td><td>Nejspíš adresa burzy – appka se zeptá, zda ji opravdu načíst. Odeber ji v Nastavení.</td></tr>
</table>

<h2>10. Upozornění</h2>
<p>Appka je pomůcka pro přehled a výpočet podle pravidel platných v ČR (časový test 3 roky, limit 100 000 Kč od roku 2025). <b>Nenahrazuje daňové poradenství</b> – výsledky si ověř, případně se poraď s daňovým poradcem. Výpočty závisí na úplnosti nahraných dat.</p>
'''

DON = '''
<h2>Podpořit vývoj</h2>
<div class="don"><div class="qr">%s</div><div>
<p>Krypto správa je zdarma. Pokud ti ušetřila čas nebo starosti s daněmi, můžeš autorovi poslat libovolnou částku <b>ADA</b> (Cardano) na adresu:</p>
<p class="addr">%s</p>
<p class="mut">Adresa je i v appce: Nastavení → Podpořit vývoj (tlačítko Kopírovat). Děkuji!</p></div></div>
''' % (QR, DONATE)

CSS = '''
@page { size: A4; margin: 16mm 15mm; }
body { font: 11px/1.5 "Segoe UI", system-ui, Roboto, Arial, sans-serif; color: #111827; margin: 0; }
.cover { border-bottom: 3px solid #3b82f6; padding-bottom: 10px; margin-bottom: 8px; }
h1 { font-size: 26px; margin: 0; } .sub { color: #4b5563; font-size: 13px; }
h2 { font-size: 16px; margin: 20px 0 6px; padding-bottom: 3px; border-bottom: 2px solid #3b82f6; break-after: avoid; }
h3 { font-size: 13px; margin: 12px 0 4px; break-after: avoid; }
code { font-family: Consolas, ui-monospace, monospace; background: #f3f4f6; padding: 0 3px; border-radius: 3px; font-size: 10.5px; }
table { width: 100%; border-collapse: collapse; margin: 6px 0; } th, td { border: 1px solid #e5e7eb; padding: 4px 6px; text-align: left; vertical-align: top; } th { background: #f3f4f6; }
tr { break-inside: avoid; }
.tip { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 6px 10px; border-radius: 4px; }
.warn { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 6px 10px; border-radius: 4px; }
.mut { color: #6b7280; } ul, ol { padding-left: 20px; } li { margin: 2px 0; }
.don { display: flex; gap: 16px; align-items: center; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; break-inside: avoid; }
.qr svg { width: 150px; height: 150px; } .addr { font-family: Consolas, monospace; font-size: 10.5px; word-break: break-all; background: #f3f4f6; padding: 6px 8px; border-radius: 6px; }
.toc { columns: 2; font-size: 11px; }
'''

TOC = ['Co appka umí', 'Instalace a spuštění', 'První nastavení', 'Aktualizace', 'Jak číst přehled', 'Všechny mince', 'Export (CSV / PDF)', 'Data, záloha a soukromí', 'Řešení problémů', 'Upozornění', 'Podpořit vývoj']

for osname, inst in INSTALL.items():
    label = {'Mac': 'macOS'}.get(osname, osname)
    toc = ''.join('<li>%s</li>' % html.escape(t) for t in TOC)
    body = f'''<div class="cover"><h1>Krypto správa</h1><div class="sub">Návod k použití · verze {VERSION} · {label}</div></div>
<p>Přehled kryptoměn, stakingu a českých daní na jednom místě – offline, bez registrace, data zůstávají u tebe.</p>
<h3>Obsah</h3><ol class="toc">{toc}</ol>
{COMMON_TOP}{inst}{COMMON}{DON}'''
    doc = f'<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><title>Krypto správa – návod ({label})</title><style>{CSS}</style></head><body>{body}</body></html>'
    (OUT / f'Navod-{osname}.html').write_text(doc, encoding='utf-8')
print('ok', [p.name for p in OUT.iterdir()])
