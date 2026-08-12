# Maxi-Truck

Eerste werkende versie voor:
- Producten met productcode, prijs in CG, voorraad en commissiepercentage
- Verkoop/factuur
- Voorraad automatisch verminderen na verkoop
- Klantenlijst met autocomplete
- Verkoophistorie per dag
- Dagafsluiting: producten per dag samenvoegen, totale verkoop, totale commissie
- Geteld geld invoeren en automatisch verschil berekenen
- Printbare factuur en dagafsluiting
- PWA-installatie / offline basis

Belangrijk:
Deze versie bewaart gegevens lokaal op het apparaat via localStorage.
Voor synchronisatie tussen tablet en pc moet Firebase later gekoppeld worden.


## Secure v2
- Firebase Authentication toegevoegd.
- Beheerder: mh.makrostore@gmail.com via Google-login.
- Verkoop/tablet: maxitrucktablet@maxitruck.local via e-mail/wachtwoord.
- Beheerder ziet alle tabs en kan producten/voorraad/commissie beheren en dag afsluiten.
- Tablet-account ziet alleen Verkoop en Verkopen.
- Data wordt via Firestore gedeeld tussen pc en tablet.
- LET OP: vul in `firebase-app.js` nog de echte Firebase Web App config in voor het Maxi-Truck project.


## v4 – Offline + foto + OB
- Productfoto toevoegen/vervangen.
- Productveld OB %.
- Catalogus/verkoop toont prijs exclusief OB.
- Invoice toont onderaan apart: subtotaal excl. OB, OB-bedrag, totaal incl. OB.
- Bij Print factuur wordt de invoice eerst opgeslagen en daarna het printvenster geopend.
- Firestore persistent cache is geactiveerd voor online/offline gebruik.


## v5 – Voorraad aanvullen
- Nieuwe beheerder-tab **Voorraad aanvullen**.
- Alle producten staan onder elkaar met huidige voorraad.
- Vul alleen het aantal in dat wordt bijgevoegd.
- Nieuwe voorraad wordt direct als voorbeeld berekend.
- Met **Alles opslaan** worden alle ingevulde producten in één keer bijgewerkt.
- Lege velden veranderen niets.
- Tablet/verkoop-account ziet deze tab niet.


## v6 – EACH / CRT
- Catalogus blijft automatisch alfabetisch op productnaam A–Z.
- Iedere product heeft standaard een EACH-prijs.
- Optionele CRT-prijs + PCS per CRT.
- Als CRT niet is ingevuld, wordt CRT niet in de catalogus getoond.
- In Verkoop kan gekozen worden tussen EACH en CRT.
- Bij verkoop van 1 CRT wordt automatisch het ingestelde aantal PCS van de voorraad afgetrokken.
- Invoice en verkoophistorie tonen duidelijk EACH of CRT.
- OB en commissie worden berekend op basis van de gekozen verkoopprijs.


## v7 – Product zoeken
- Duidelijke zoekbalk bovenaan bij **Producten**.
- Zoeken werkt direct op **productcode** én **productnaam**.
- Resultaten filteren terwijl je typt.


## v8 – Herstel witte pagina
- Herstelt een lege `index.html`.
- Behoudt de functies uit de vorige versie, inclusief foto, OB, offline/online, voorraad aanvullen, EACH/CRT en zoeken op productcode of productnaam.
- Service worker cache verhoogd zodat browsers de herstelde site opnieuw laden.


## v9 – CRT + FREE
- Alleen beheerder kan per product **1 CRT = + 1 FREE** aanvinken.
- Bij 1 CRT wordt automatisch 1 FREE toegevoegd.
- Bij 2 CRT wordt automatisch 2 FREE toegevoegd, enz.
- FREE staat op invoice als **FREE** met prijs **CG 0.00**.
- Over FREE wordt geen OB en geen commissie berekend.
- Voorraad wordt wel verminderd met de betaalde PCS plus FREE PCS.
- Verkoop/tablet-account kan deze instelling niet wijzigen.


## v10 – Prijswijziging melding + catalogus opgeschoond
- Als beheerder een EACH- of CRT-prijs wijzigt, krijgt het verkoop/tablet-account een eenmalige melding.
- De melding toont duidelijk productnaam en nieuwe prijs.
- Knop **Verder naar menu** sluit de melding.
- Commissie en OB zijn niet meer zichtbaar in de verkoopcatalogus.
- Commissie blijft intern bewaard en wordt nog steeds berekend bij Dag afsluiten.
- Commissie wordt niet op de invoice getoond.
- OB blijft intern actief en wordt op de invoice alleen als OB-bedrag bij het totaal vermeld.


## v11 – Voorraad 0 verbergen
- Producten met voorraad **0** worden automatisch uit de verkoopcatalogus verborgen.
- Ze blijven zichtbaar voor de beheerder bij **Producten** en **Voorraad aanvullen**.
- Zodra de voorraad weer boven 0 komt, verschijnt het product automatisch opnieuw in de catalogus.


## v12 – herstel witte pagina
- Cache-busting toegevoegd aan CSS en JavaScript.
- Oude service workers worden verwijderd.
- Tijdelijk geen offline asset-cache om een oude lege pagina te voorkomen.
- Functionaliteit van v11 blijft behouden, inclusief voorraad 0 verbergen.


## v13 – Catalogus zonder voorraadweergave
- Producten met voorraad 0 blijven zichtbaar in de verkoopcatalogus.
- De voorraad/aantallen worden niet meer getoond in de catalogus.
- Voorraad blijft intern actief voor verkoopcontrole en beheer.
- Beheerder blijft voorraad zien bij Producten en Voorraad aanvullen.


## v14 – Login herstel
- Enter in het wachtwoordveld werkt nu via een echt login-formulier.
- De knop Inloggen met e-mail gebruikt dezelfde submit-flow.
- Als offline Firestore-cache niet kan starten, valt de app automatisch terug op online Firestore in plaats van dat de login vastloopt.
- Duidelijke loginstatus/foutcode op het scherm.


## v15 – Factuurnummer + datum/tijd + 2 aantalprijzen
- Iedere invoice krijgt datum én tijd.
- Iedere invoice krijgt een uniek dagnummer zoals `MT-20260812-001`.
- Twee optionele aantalprijzen per product:
  - Aantal prijs 1 + bijbehorende totale prijs
  - Aantal prijs 2 + bijbehorende totale prijs
- Voorbeeld: 4 EACH = CG 5.00 en 8 EACH = CG 9.00.
- In de verkoop verschijnen extra knoppen alleen als die aantalprijzen zijn ingevuld.
- Voorraad wordt met het juiste aantal EACH verminderd.


## v16 – Unieke productcode + automatisch laden
- Een productcode kan niet dubbel worden opgeslagen.
- Zodra de beheerder een bestaande code invoert, worden automatisch de bestaande productgegevens geladen.
- Dit laadt naam, foto, EACH-prijs, aantalprijzen, CRT, FREE, voorraad, commissie en OB.
- Als je probeert op te slaan met een code die al bij een ander product hoort, wordt opslaan geblokkeerd en opent het bestaande product.


## v17 – Bestaande code direct uit Firestore laden
- Bij het typen van een bestaande productcode zoekt Maxi-Truck nu niet alleen in de lokale lijst, maar ook rechtstreeks in Firestore.
- Werkt ook als de productlijst op de pc nog niet ververst was.
- Status onder de code: **Code zoeken...**, **Bestaand product geladen**, of **Nieuwe productcode**.
- Zoeken probeert zowel tekstcodes als oude numeriek opgeslagen codes.
- Duplicaat opslaan blijft geblokkeerd.


## v18 – Alle producten bij Verkoop
- Bij **Producten** en **Verkoop** worden nu alle aangemaakte producten geladen.
- Bij Verkoop was eerder alleen een deel zichtbaar; de limiet van 8 is verwijderd.
- In de verkoopcatalogus staat nu eerst de productnaam en daaronder de code.
- Alfabetische volgorde A–Z blijft behouden.
- Zoeken op productnaam of code blijft werken.


## v19 – P12
- Beheerder kan per product een aparte **P12-prijs** invoeren.
- P12 betekent 12 stuks.
- Als P12-prijs leeg is, wordt P12 niet getoond in Verkoop.
- Als P12 is ingevuld, verschijnt bij Verkoop een aparte **P12** knop.
- 1 P12 trekt automatisch 12 stuks van de voorraad af.
- Invoice toont P12 als verkoopvorm.
- OB en commissie worden berekend op de P12-prijs maar commissie blijft alleen zichtbaar bij Dag afsluiten.
- Een wijziging van de P12-prijs kan ook in de prijswijzigingsmelding verschijnen.


## v20 – Brede Producten-pagina
- Producten gebruikt op pc bijna de volledige schermbreedte.
- Rechterkolommen en actieknoppen zijn beter zichtbaar.
- Als het scherm toch te smal is, kan de producttabel horizontaal schuiven zonder de pagina af te snijden.

## v21 – Zoekveld Verkoop automatisch leeg
- Nadat een product bij Verkoop is gekozen/toegevoegd, wordt het zoekveld automatisch leeggemaakt.
- De cursor gaat terug naar het zoekveld zodat direct het volgende product gezocht kan worden.


## v22 – Commissie op vast bedrag / TP per eenheid
- Nieuw veld **Commissie basis (CG)** per product.
- Normale producten: commissie = Commissie basis × Commissie % × verkochte hoeveelheid.
- Nieuw vinkje **TP: commissie op verkochte P12 / CRT**.
- Bij TP-producten:
  - verkoop als P12 → commissie wordt berekend over de P12-prijs.
  - verkoop als CRT → commissie wordt berekend over de CRT-prijs.
  - andere verkoopvormen gebruiken de vaste Commissie basis.
- Commissie blijft alleen zichtbaar/berekend voor beheerder en Dag afsluiten; niet op de invoice.


## v23 – Commissie basis per product
- **Commissie basis (CG)** wordt nu strikt per product opgeslagen.
- Bij openen/bewerken van een product wordt alleen de eigen commissiebasis van dat product geladen.
- Bij nieuw product worden commissievelden leeggemaakt zodat waarden van het vorige product niet meekomen.
- Normale producten: commissie = eigen commissiebasis × commissie % × aantal verkocht.
- TP-producten: bij P12 wordt gerekend over P12-prijs; bij CRT over CRT-prijs.
- Dag afsluiten telt de berekende commissies van alle producten op.


## v24 – Commissie basis opslaan herstel
- Hersteld dat **Commissie basis (CG)** na opslaan soms weer leeg was.
- Bij een bestaande productcode wordt nu eerst het echte product-ID gekoppeld voordat wordt opgeslagen.
- Na opslaan worden de producten opnieuw uit Firestore geladen, zodat het opgeslagen commissiebasisbedrag direct zichtbaar blijft.
- Commissiebasis blijft per product apart.


## v25 – Commissie basis definitief opgeslagen
- Fout hersteld: `commissionBase` en `tpCommission` werden eerder niet in het productdocument meegeschreven.
- Het bedrag bij **Commissie basis (CG)** wordt nu echt per product in Firestore opgeslagen.
- Bij opnieuw openen van hetzelfde product wordt het opgeslagen bedrag terug geladen.
- Nieuwe producten starten met een leeg commissiebasisveld.
- TP-producten blijven automatisch P12- of CRT-prijs als commissiebasis gebruiken, afhankelijk van wat op de bon is verkocht.


## v26 – TP commissie op één EACH-basis
- Je voert per product maar **één Commissiebasis (CG) per EACH** in.
- Alleen als **TP: commissie op verkochte P12 / CRT** is aangevinkt, rekent Maxi-Truck automatisch:
  - P12 → commissiebasis × 12 × commissie %
  - CRT → commissiebasis × PCS per CRT × commissie %
- Bij meerdere P12/CRT wordt ook met het verkochte aantal vermenigvuldigd.
- Als TP niet is aangevinkt, blijft de normale vaste commissiebasis per verkochte eenheid gelden.
- De verkoper hoeft tijdens verkoop niets aan te vinken; de instelling wordt éénmalig bij het product opgeslagen.


## v27 – TP aparte commissiebasis voor P12 en CRT
- Product éénmalig aanvinken als **TP product**.
- Apart veld **TP commissie basis P12 (CG)**.
- Apart veld **TP commissie basis CRT (CG)**.
- Bij verkoop als P12 gebruikt Maxi-Truck automatisch de P12-commissiebasis.
- Bij verkoop als CRT gebruikt Maxi-Truck automatisch de CRT-commissiebasis.
- De verkoper hoeft tijdens verkoop niets aan te vinken.
- Voor normale verkoop blijft **Commissie basis normaal (CG)** beschikbaar.


## v28 – Aantal direct invoeren bij Verkoop
- Elk product bij Verkoop heeft nu direct een **Aantal**-vak.
- Vul bijvoorbeeld 5 in en druk EACH → 5 EACH wordt direct aan de factuur toegevoegd.
- Vul 3 in en druk P12 → 3 P12 wordt toegevoegd.
- Vul 2 in en druk CRT → 2 CRT wordt toegevoegd.
- Voorraadcontrole houdt rekening met het ingevoerde aantal en de gekozen eenheid.


## v29 – CRT toevoegen hersteld
- CRT-knop gebruikt nu betrouwbaar het aantal uit het vak bij Verkoop.
- Voorbeeld: aantal 2 + CRT voegt 2 CRT toe aan de factuur.
- Voorraadcontrole rekent met `aantal CRT × PCS per CRT`.
- Als `1 FREE` actief is, wordt ook de gratis EACH per CRT meegenomen in de voorraad.
- Als CRT-prijs of PCS per CRT ontbreekt, verschijnt nu een duidelijke melding.
- Zoekveld wordt pas leeggemaakt nadat het product succesvol aan de factuur is toegevoegd.


## v30 – CRT knop klikbaar + duidelijke controle
- CRT-knop wordt niet meer stil uitgeschakeld door de voorraadweergave.
- CRT-knop is expliciet `type="button"`.
- Bij klikken controleert de app de CRT-prijs, PCS per CRT en voorraad.
- Als iets ontbreekt, verschijnt een duidelijke melding.
- Bij succesvolle toevoeging verschijnt: `X CRT toegevoegd aan de factuur`.


## v31 – CRT echte herstel
- Kritieke fout hersteld: na toevoegen werd een niet-bestaande functie `renderProductResults()` aangeroepen.
- Dit is vervangen door de juiste `renderProductSearch()`.
- CRT gebruikt nu hetzelfde betrouwbare toevoegproces als EACH.
- Bij onvoldoende voorraad verschijnt een duidelijke melding met benodigde EACH en huidige voorraad.
- Na succesvol toevoegen springt het aantalvak terug naar 1.


## v32 – Voorraad aanvullen printen
- Nieuwe knop **Voorraadlijst printen** op de pagina Voorraad aanvullen.
- Print bevat code, productnaam, huidige voorraad, ingevuld bijvullen en nieuwe voorraad.
- Datum en tijd staan bovenaan de geprinte lijst.
- Alleen beheerder kan deze lijst printen.
- Als er een zoekfilter actief is, wordt alleen de gefilterde lijst geprint.


## v33 – Code verbergen bij Verkoop
- In de categorie **Verkoop** wordt de productcode niet meer zichtbaar getoond.
- Zoeken op productcode blijft wel werken.
- De beheerder blijft de productcode zien bij **Producten**.
- Op de geprinte invoice blijft de productcode zichtbaar.
- Op de geprinte voorraadlijst blijft de productcode zichtbaar.
