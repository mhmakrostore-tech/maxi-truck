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
