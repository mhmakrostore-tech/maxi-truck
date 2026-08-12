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
